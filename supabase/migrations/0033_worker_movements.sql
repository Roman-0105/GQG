-- ============================================================================
-- 0033: перемещения работников между мастерами и их вахты (07.10.2026).
--  * worker_crew_history — журнал «кто в чьей бригаде и с какой даты»
--    (пишется триггером при любой смене workers.assigned_foreman_id).
--  * worker_stays — вахта работника: заезд, плановое число дней (любое),
--    плановый и фактический выезд. Просроченный плановый выезд при открытой
--    вахте = переработка.
--  * worker_events — хронология для карточки работника.
--  * RPC: transfer_worker, start_worker_stay, extend_worker_stay,
--    depart_worker; hand_over_shift расширен выбором людей (остаются/уезжают).
-- Переводить работника могут руководство и мастер его бригады. Идемпотентна.
-- ============================================================================

create table if not exists worker_crew_history (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  foreman_id uuid references profiles(id) on delete set null,
  from_date date not null default current_date,
  to_date date,
  reason text,
  moved_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists worker_crew_history_worker_idx on worker_crew_history(worker_id, from_date);
create index if not exists worker_crew_history_foreman_idx on worker_crew_history(foreman_id, from_date);

create table if not exists worker_stays (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  arrived_on date not null,
  planned_days int not null check (planned_days > 0),
  planned_departure date not null,
  departed_on date,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists worker_stays_one_open on worker_stays(worker_id) where departed_on is null;

create table if not exists worker_events (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  kind text not null check (kind in ('arrived', 'extended', 'departed', 'transferred')),
  event_date date not null default current_date,
  text text not null,
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists worker_events_worker_idx on worker_events(worker_id, event_date, created_at);

alter table worker_crew_history enable row level security;
alter table worker_stays enable row level security;
alter table worker_events enable row level security;

drop policy if exists "worker_crew_history_select" on worker_crew_history;
create policy "worker_crew_history_select" on worker_crew_history for select using (auth.uid() is not null);
drop policy if exists "worker_crew_history_write_management" on worker_crew_history;
create policy "worker_crew_history_write_management" on worker_crew_history for all using (is_management()) with check (is_management());

drop policy if exists "worker_stays_select" on worker_stays;
create policy "worker_stays_select" on worker_stays for select using (auth.uid() is not null);
drop policy if exists "worker_stays_write_management" on worker_stays;
create policy "worker_stays_write_management" on worker_stays for all using (is_management()) with check (is_management());

drop policy if exists "worker_events_select" on worker_events;
create policy "worker_events_select" on worker_events for select using (auth.uid() is not null);
drop policy if exists "worker_events_write_management" on worker_events;
create policy "worker_events_write_management" on worker_events for all using (is_management()) with check (is_management());

-- Задним числом: текущая бригада каждого работника — одна открытая запись.
insert into worker_crew_history (worker_id, foreman_id, from_date, reason)
select w.id, w.assigned_foreman_id, coalesce(w.created_at::date, current_date), 'начальная привязка'
from workers w
where w.assigned_foreman_id is not null
  and not exists (select 1 from worker_crew_history h where h.worker_id = w.id);

-- Любая смена бригады работника (включая правку в «Работниках») пишет историю.
create or replace function track_worker_crew()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := coalesce(nullif(current_setting('app.transfer_date', true), '')::date, current_date);
  why text := coalesce(nullif(current_setting('app.transfer_reason', true), ''), 'изменение бригады');
begin
  if tg_op = 'INSERT' then
    if new.assigned_foreman_id is not null then
      insert into worker_crew_history (worker_id, foreman_id, from_date, reason, moved_by)
      values (new.id, new.assigned_foreman_id, d, 'приписан к бригаде', auth.uid());
    end if;
  elsif new.assigned_foreman_id is distinct from old.assigned_foreman_id then
    update worker_crew_history set to_date = d where worker_id = new.id and to_date is null;
    if new.assigned_foreman_id is not null then
      insert into worker_crew_history (worker_id, foreman_id, from_date, reason, moved_by)
      values (new.id, new.assigned_foreman_id, d, why, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workers_track_crew_trg on workers;
create trigger workers_track_crew_trg
  after insert or update of assigned_foreman_id on workers
  for each row execute function track_worker_crew();

create or replace function can_manage_worker(p_worker uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_management()
      or exists (select 1 from workers w where w.id = p_worker and w.assigned_foreman_id = auth.uid());
$$;

create or replace function transfer_worker(
  p_worker uuid,
  p_to uuid,
  p_date date default current_date,
  p_reason text default null,
  p_move_assignments boolean default false,
  p_task uuid default null,
  p_role text default null,
  p_shift int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_f uuid;
  tname text;
begin
  if not can_manage_worker(p_worker) then
    raise exception 'Нет прав переводить этого работника' using errcode = '42501';
  end if;
  select assigned_foreman_id into old_f from workers where id = p_worker;
  select full_name into tname from profiles where id = p_to and role = 'party_chief';
  if tname is null then
    raise exception 'Новый мастер должен иметь роль «Ответственный»';
  end if;
  if old_f is not distinct from p_to then
    raise exception 'Работник уже в бригаде этого мастера';
  end if;

  perform set_config('app.transfer_reason', coalesce(p_reason, ''), true);
  perform set_config('app.transfer_date', p_date::text, true);
  update workers set assigned_foreman_id = p_to where id = p_worker;

  if p_move_assignments then
    update task_worker_assignments set valid_to = p_date where worker_id = p_worker and valid_to is null and valid_from <= p_date;
    if p_task is not null and p_role in ('driller', 'assistant_driller') then
      if not exists (select 1 from drilling_tasks where id = p_task and foreman_id = p_to) then
        raise exception 'Скважина не принадлежит новому мастеру';
      end if;
      insert into task_worker_assignments (drilling_task_id, role, worker_id, shift_number, valid_from)
      values (p_task, p_role, p_worker, p_shift, p_date);
    end if;
  end if;

  insert into worker_events (worker_id, kind, event_date, text, actor_id)
  values (p_worker, 'transferred', p_date, 'Переведён к мастеру ' || tname || coalesce(' · ' || nullif(p_reason, ''), ''), auth.uid());
end;
$$;

create or replace function start_worker_stay(p_worker uuid, p_arrived date, p_days int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_manage_worker(p_worker) then
    raise exception 'Нет прав менять вахту этого работника' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 then
    raise exception 'Укажите число дней вахты';
  end if;
  if exists (select 1 from worker_stays where worker_id = p_worker and departed_on is null) then
    raise exception 'У работника уже есть открытая вахта — отметьте выезд или продлите её';
  end if;
  insert into worker_stays (worker_id, arrived_on, planned_days, planned_departure)
  values (p_worker, p_arrived, p_days, p_arrived + p_days);
  insert into worker_events (worker_id, kind, event_date, text, actor_id)
  values (p_worker, 'arrived', p_arrived, 'Заезд, план ' || p_days || ' дн. (до ' || to_char(p_arrived + p_days, 'DD.MM.YYYY') || ')', auth.uid());
end;
$$;

create or replace function extend_worker_stay(p_worker uuid, p_new_departure date, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s worker_stays%rowtype;
begin
  if not can_manage_worker(p_worker) then
    raise exception 'Нет прав менять вахту этого работника' using errcode = '42501';
  end if;
  select * into s from worker_stays where worker_id = p_worker and departed_on is null;
  if not found then
    raise exception 'У работника нет открытой вахты';
  end if;
  if p_new_departure <= s.arrived_on then
    raise exception 'Дата выезда должна быть позже заезда';
  end if;
  update worker_stays
  set planned_departure = p_new_departure,
      planned_days = p_new_departure - s.arrived_on,
      note = coalesce(nullif(p_note, ''), note)
  where id = s.id;
  insert into worker_events (worker_id, kind, event_date, text, actor_id)
  values (p_worker, 'extended', current_date, 'Вахта продлена до ' || to_char(p_new_departure, 'DD.MM.YYYY') || coalesce(' · ' || nullif(p_note, ''), ''), auth.uid());
end;
$$;

create or replace function depart_worker(p_worker uuid, p_date date default current_date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_manage_worker(p_worker) then
    raise exception 'Нет прав менять вахту этого работника' using errcode = '42501';
  end if;
  update worker_stays set departed_on = p_date where worker_id = p_worker and departed_on is null;
  if not found then
    raise exception 'У работника нет открытой вахты';
  end if;
  insert into worker_events (worker_id, kind, event_date, text, actor_id)
  values (p_worker, 'departed', p_date, 'Выезд', auth.uid());
end;
$$;

-- «Сдать вахту» умеет решать судьбу людей мастера:
-- p_keep — остаются и переходят к сменщику, p_leave — уезжают (закрывается вахта).
drop function if exists hand_over_shift(uuid, text);
drop function if exists hand_over_shift(uuid, text, uuid[], uuid[]);
create or replace function hand_over_shift(p_to uuid, p_comment text default null, p_keep uuid[] default null, p_leave uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  me_name text;
  to_name text;
  ids uuid[];
  moved int := 0;
  wid uuid;
  kept int := 0;
  left_n int := 0;
begin
  if me is null then
    raise exception 'Нужно войти в систему' using errcode = '42501';
  end if;
  select full_name into me_name from profiles where id = me and role = 'party_chief';
  if me_name is null then
    raise exception 'Сдать вахту может только мастер (роль «Ответственный»)' using errcode = '42501';
  end if;
  if p_to is null or p_to = me then
    raise exception 'Выберите сменщика — другого мастера';
  end if;
  select full_name into to_name from profiles where id = p_to and role = 'party_chief';
  if to_name is null then
    raise exception 'Сменщик должен быть мастером (роль «Ответственный»)';
  end if;

  select coalesce(array_agg(id), '{}') into ids
  from drilling_tasks
  where foreman_id = me and status in ('in_progress', 'suspended');

  update drilling_tasks set foreman_id = p_to where id = any(ids);

  update reports
  set author_id = p_to
  where drilling_task_id = any(ids)
    and author_id = me
    and (approval_status = 'draft' or edit_unlocked = true);
  get diagnostics moved = row_count;

  perform set_config('app.transfer_reason', 'смена вахты', true);
  perform set_config('app.transfer_date', current_date::text, true);
  foreach wid in array coalesce(p_keep, '{}'::uuid[]) loop
    if exists (select 1 from workers where id = wid and assigned_foreman_id = me) then
      update workers set assigned_foreman_id = p_to where id = wid;
      insert into worker_events (worker_id, kind, event_date, text, actor_id)
      values (wid, 'transferred', current_date, 'Переведён к мастеру ' || to_name || ' · смена вахты', me);
      kept := kept + 1;
    end if;
  end loop;
  foreach wid in array coalesce(p_leave, '{}'::uuid[]) loop
    if exists (select 1 from workers where id = wid and assigned_foreman_id = me) then
      update worker_stays set departed_on = current_date where worker_id = wid and departed_on is null;
      insert into worker_events (worker_id, kind, event_date, text, actor_id)
      values (wid, 'departed', current_date, 'Выезд · смена вахты', me);
      left_n := left_n + 1;
    end if;
  end loop;

  insert into shift_handovers (from_id, to_id, from_name, to_name, task_ids, tasks_count, drafts_moved, comment)
  values (me, p_to, me_name, to_name, ids, coalesce(array_length(ids, 1), 0), moved, nullif(trim(coalesce(p_comment, '')), ''));

  update profiles set on_duty = false where id = me;
  update profiles set on_duty = true where id = p_to;

  return jsonb_build_object('tasks', coalesce(array_length(ids, 1), 0), 'drafts', moved, 'kept', kept, 'left', left_n);
end;
$$;

grant execute on function transfer_worker(uuid, uuid, date, text, boolean, uuid, text, int) to authenticated;
grant execute on function start_worker_stay(uuid, date, int) to authenticated;
grant execute on function extend_worker_stay(uuid, date, text) to authenticated;
grant execute on function depart_worker(uuid, date) to authenticated;
grant execute on function hand_over_shift(uuid, text, uuid[], uuid[]) to authenticated;
