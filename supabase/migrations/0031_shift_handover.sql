-- ============================================================================
-- 0031: вахта и передача смены мастеру-сменщику (06.10.2026).
--  * profiles.on_duty — на вахте / на межвахте (по умолчанию на вахте).
--  * hand_over_shift(кому, комментарий) — «сдать вахту»: ВСЕ активные
--    скважины бурения мастера (in_progress / suspended) переходят к сменщику
--    (drilling_tasks.foreman_id), его неотправленные черновики и сводки,
--    возвращённые на правку, — тоже (reports.author_id). Сдающий уходит на
--    межвахту, сменщик заступает. Передаётся только бурение: по геологической
--    части отвечают геологи (task_assignees), её это не касается.
--  * start_shift() — «заступить на вахту» (без передачи скважин).
--  * shift_handovers — журнал передач (имена хранятся снимком).
--  * Сменщик видит ВСЕ сводки по своим скважинам (иначе у него не было бы
--    накопленного забоя и истории диаметров), сдавший вахту сохраняет доступ
--    к сданным скважинам и их сводкам только на чтение.
-- Идемпотентна.
-- ============================================================================

alter table profiles add column if not exists on_duty boolean not null default true;

create table if not exists shift_handovers (
  id uuid primary key default gen_random_uuid(),
  from_id uuid references profiles(id) on delete set null,
  to_id uuid references profiles(id) on delete set null,
  from_name text not null,
  to_name text not null,
  task_ids uuid[] not null default '{}',
  tasks_count int not null default 0,
  drafts_moved int not null default 0,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists shift_handovers_from_idx on shift_handovers(from_id, created_at desc);
create index if not exists shift_handovers_to_idx on shift_handovers(to_id, created_at desc);

alter table shift_handovers enable row level security;

drop policy if exists "shift_handovers_select" on shift_handovers;
create policy "shift_handovers_select"
  on shift_handovers for select
  using (is_management() or from_id = auth.uid() or to_id = auth.uid());

-- Видна ли скважина/её сводки пользователю: он сейчас бригадир скважины или
-- сдал её по вахте (только чтение). Security definer — чтобы не упереться в
-- RLS самих таблиц и не получить рекурсию политик.
create or replace function can_view_drilling_task(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from drilling_tasks dt where dt.id = p_task and dt.foreman_id = auth.uid())
      or exists (select 1 from shift_handovers h where h.from_id = auth.uid() and p_task = any(h.task_ids));
$$;

drop policy if exists "drilling_tasks_select" on drilling_tasks;
create policy "drilling_tasks_select"
  on drilling_tasks for select
  using (
    is_management()
    or foreman_id = auth.uid()
    or is_geology_assignee_of_well(drilling_tasks.id)
    or can_view_drilling_task(drilling_tasks.id)
  );

drop policy if exists "reports_select" on reports;
create policy "reports_select"
  on reports for select
  using (
    is_management()
    or author_id = auth.uid()
    or (reports.drilling_task_id is not null and can_view_drilling_task(reports.drilling_task_id))
  );

-- Список мастеров для выбора сменщика (профили других мастеров сами по себе
-- мастеру не читаются).
create or replace function list_shift_candidates()
returns table (id uuid, full_name text, on_duty boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.on_duty
  from profiles p
  where p.role = 'party_chief' and p.id <> auth.uid()
    and (is_management() or exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'party_chief'))
  order by p.full_name;
$$;

create or replace function hand_over_shift(p_to uuid, p_comment text default null)
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

  insert into shift_handovers (from_id, to_id, from_name, to_name, task_ids, tasks_count, drafts_moved, comment)
  values (me, p_to, me_name, to_name, ids, coalesce(array_length(ids, 1), 0), moved, nullif(trim(coalesce(p_comment, '')), ''));

  update profiles set on_duty = false where id = me;
  update profiles set on_duty = true where id = p_to;

  return jsonb_build_object('tasks', coalesce(array_length(ids, 1), 0), 'drafts', moved);
end;
$$;

create or replace function start_shift()
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set on_duty = true where id = auth.uid() and role = 'party_chief';
$$;

grant execute on function hand_over_shift(uuid, text) to authenticated;
grant execute on function start_shift() to authenticated;
grant execute on function list_shift_candidates() to authenticated;
