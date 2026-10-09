-- ============================================================================
-- 0038. Каталог возможностей и индивидуальные права (09.10.2026, этап 2).
-- Начальство (is_management: уровни 1–2 и разработчик) имеет все возможности.
-- Остальным возможность выдаётся персонально через profile_caps (allowed=true)
-- или отзывается (allowed=false). Выдавать и отзывать может только management.
-- Возможности этого шага:
--   approve_reports — согласовывать и возвращать сводки
--   corrections_db  — вкладка «БД сводок» (исправление согласованных сводок)
--   view_all_data   — просмотр всех участков, заданий и сводок (только чтение)
-- approve_reports и corrections_db включают чтение. Политики ниже — добавочные
-- (permissive политики объединяются через OR), существующие не меняются.
-- ============================================================================

create table if not exists profile_caps (
  profile_id uuid not null references profiles(id) on delete cascade,
  cap text not null check (cap in ('approve_reports', 'corrections_db', 'view_all_data')),
  allowed boolean not null default true,
  granted_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (profile_id, cap)
);
alter table profile_caps enable row level security;
drop policy if exists "profile_caps_select" on profile_caps;
create policy "profile_caps_select" on profile_caps for select using (profile_id = auth.uid() or is_management());
drop policy if exists "profile_caps_write_management" on profile_caps;
create policy "profile_caps_write_management" on profile_caps for all using (is_management()) with check (is_management());

create or replace function has_cap(p_cap text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_management()
    or coalesce((select allowed from profile_caps where profile_id = auth.uid() and cap = p_cap), false);
$$;

create or replace function sees_all()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_management() or has_cap('approve_reports') or has_cap('corrections_db') or has_cap('view_all_data');
$$;

drop policy if exists "reports_select_caps" on reports;
create policy "reports_select_caps" on reports for select using (sees_all());
drop policy if exists "report_costs_select_caps" on report_costs;
create policy "report_costs_select_caps" on report_costs for select using (sees_all());
drop policy if exists "report_edit_log_select_caps" on report_edit_log;
create policy "report_edit_log_select_caps" on report_edit_log for select using (sees_all());
drop policy if exists "report_drill_diameters_select_caps" on report_drill_diameters;
create policy "report_drill_diameters_select_caps" on report_drill_diameters for select using (sees_all());
drop policy if exists "report_casings_select_caps" on report_casings;
create policy "report_casings_select_caps" on report_casings for select using (sees_all());
drop policy if exists "report_status_log_select_caps" on report_status_log;
create policy "report_status_log_select_caps" on report_status_log for select using (sees_all());
drop policy if exists "report_samples_select_caps" on report_samples;
create policy "report_samples_select_caps" on report_samples for select using (sees_all());
drop policy if exists "sites_select_caps" on sites;
create policy "sites_select_caps" on sites for select using (sees_all());
drop policy if exists "drilling_tasks_select_caps" on drilling_tasks;
create policy "drilling_tasks_select_caps" on drilling_tasks for select using (sees_all());
drop policy if exists "core_description_tasks_select_caps" on core_description_tasks;
create policy "core_description_tasks_select_caps" on core_description_tasks for select using (sees_all());
drop policy if exists "core_sawing_tasks_select_caps" on core_sawing_tasks;
create policy "core_sawing_tasks_select_caps" on core_sawing_tasks for select using (sees_all());
drop policy if exists "sampling_tasks_select_caps" on sampling_tasks;
create policy "sampling_tasks_select_caps" on sampling_tasks for select using (sees_all());
drop policy if exists "task_assignees_select_caps" on task_assignees;
create policy "task_assignees_select_caps" on task_assignees for select using (sees_all());
drop policy if exists "task_worker_assignments_select_caps" on task_worker_assignments;
create policy "task_worker_assignments_select_caps" on task_worker_assignments for select using (sees_all());

-- имена авторов сводок для согласующих (разработчика по-прежнему не видно)
drop policy if exists "profiles_select_caps" on profiles;
create policy "profiles_select_caps" on profiles for select using (sees_all() and role <> 'developer');

-- согласование для тех, кому выдано approve_reports
drop policy if exists "reports_update_approver" on reports;
create policy "reports_update_approver" on reports for update using (has_cap('approve_reports')) with check (has_cap('approve_reports'));

create or replace function reports_guard_approval()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or is_management() or has_cap('approve_reports') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.approval_status <> 'draft'
       or new.approved_by is not null
       or new.approved_at is not null
       or new.edit_unlocked
       or new.review_comment is not null then
      raise exception 'Новая сводка может быть создана только как черновик'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.approval_status in ('approved', 'rejected')
     and new.approval_status is distinct from old.approval_status then
    raise exception 'Статус "%" может выставлять только руководство', new.approval_status
      using errcode = '42501';
  end if;

  if new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at then
    raise exception 'Поля согласования может менять только руководство'
      using errcode = '42501';
  end if;

  if new.edit_unlocked and not old.edit_unlocked then
    raise exception 'Разблокировать правку может только руководство'
      using errcode = '42501';
  end if;

  if new.review_comment is not null
     and new.review_comment is distinct from old.review_comment then
    raise exception 'Комментарий проверяющего может менять только руководство'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- исправление сводок (БД сводок) — тем, у кого есть corrections_db
create or replace function admin_edit_reports(p_task uuid, p_reason text, p_edits jsonb, p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  errors text[] := '{}';
  warnings text[] := '{}';
  ed jsonb;
  rid uuid;
  rr record;
  r reports%rowtype;
  label text;
  a_min numeric;
  a_max numeric;
  old_total numeric := 0;
  new_total numeric := 0;
  shifted int := 0;
  auth_changed int := 0;
  proj numeric;
  chg jsonb;
  oldd jsonb;
  newd jsonb;
  oldc jsonb;
  newc jsonb;
  batch uuid := gen_random_uuid();
  applied boolean := false;
begin
  if not (is_management() or has_cap('corrections_db')) then
    raise exception 'Исправлять сводки может только руководство' using errcode = '42501';
  end if;
  if p_edits is null or jsonb_typeof(p_edits) <> 'array' or jsonb_array_length(p_edits) = 0 then
    raise exception 'Нет изменений';
  end if;
  if p_apply and length(trim(coalesce(p_reason, ''))) < 3 then
    errors := errors || 'Укажите причину исправления'::text;
  end if;

  drop table if exists _w, _w0, _dm, _cs, _rc, _pos0, _pos;
  create temp table _w on commit drop as
    select id, report_date as d, shift_number as sh, coalesce(drilling_meters, 0) as m,
           hours_worked as h, author_id as a, shift_notes as n
    from reports
    where drilling_task_id = p_task and approval_status in ('approved', 'submitted');
  create temp table _w0 on commit drop as select * from _w;
  create temp table _dm on commit drop as
    select dd.report_id, dd.depth_from as f, dd.depth_to as t, dd.diameter_code as c, dd.is_reaming as rm
    from report_drill_diameters dd where dd.report_id in (select id from _w);
  create temp table _cs on commit drop as
    select cc.report_id, cc.diameter_code as c, cc.depth_to as dep
    from report_casings cc where cc.report_id in (select id from _w);
  create temp table _rc on commit drop as
    select rc.report_id, rc.cost_item_id as item, rc.quantity as qty
    from report_costs rc where rc.report_id in (select id from _w);

  -- накладываем правки на рабочую копию
  for ed in select * from jsonb_array_elements(p_edits) loop
    rid := (ed->>'report_id')::uuid;
    if not exists (select 1 from _w where id = rid) then
      errors := errors || 'Сводка не относится к этой скважине или ещё не согласована'::text;
      continue;
    end if;
    if ed ? 'meters' then update _w set m = coalesce(nullif(ed->>'meters', '')::numeric, 0) where id = rid; end if;
    if ed ? 'hours' then update _w set h = nullif(ed->>'hours', '')::numeric where id = rid; end if;
    if ed ? 'author_id' then update _w set a = (ed->>'author_id')::uuid where id = rid; end if;
    if ed ? 'notes' then update _w set n = nullif(ed->>'notes', '') where id = rid; end if;
    if ed ? 'date' then update _w set d = (ed->>'date')::date where id = rid; end if;
    if ed ? 'shift' then update _w set sh = nullif(ed->>'shift', '')::int where id = rid; end if;
    if ed ? 'diameters' then
      delete from _dm where report_id = rid;
      insert into _dm
        select rid, x."from", x."to", x.code, coalesce(x.reaming, false)
        from jsonb_to_recordset(ed->'diameters') as x("from" numeric, "to" numeric, code text, reaming boolean);
    end if;
    if ed ? 'casings' then
      delete from _cs where report_id = rid;
      insert into _cs select rid, x.code, x.depth from jsonb_to_recordset(ed->'casings') as x(code text, depth numeric);
    end if;
    if ed ? 'costs' then
      delete from _rc where report_id = rid;
      insert into _rc select rid, x.item, x.qty from jsonb_to_recordset(ed->'costs') as x(item uuid, qty numeric);
    end if;
  end loop;

  -- проверки по каждой сводке
  for rr in select * from _w order by d, coalesce(sh, 0) loop
    label := to_char(rr.d, 'DD.MM') || coalesce(', смена ' || rr.sh, '');
    if rr.m < 0 then
      errors := errors || ('Отрицательный метраж (' || label || '): ' || rr.m || ' м')::text;
    end if;
    if rr.m > 500 then
      errors := errors || ('Слишком большой метраж (' || label || '): ' || rr.m || ' м')::text;
    end if;
    if rr.h is not null and (rr.h < 0 or rr.h > 24) then
      errors := errors || ('Часы работы должны быть от 0 до 24 (' || label || ')')::text;
    end if;
    if rr.sh is not null and rr.sh not in (1, 2) then
      errors := errors || ('Смена должна быть 1 или 2 (' || label || ')')::text;
    end if;
    if not exists (select 1 from profiles where id = rr.a and role = 'party_chief') then
      errors := errors || ('Составитель сводки (' || label || ') должен быть мастером')::text;
    end if;
  end loop;
  for rr in select d, sh, count(*) c from _w where sh is not null group by d, sh having count(*) > 1 loop
    errors := errors || ('Две сводки на одну дату и смену: ' || to_char(rr.d, 'DD.MM.YYYY') || ', смена ' || rr.sh)::text;
  end loop;

  -- забой по накоплению метров: до и после правок
  create temp table _pos0 on commit drop as
    select id, coalesce(sum(m) over (order by d, coalesce(sh, 0), id rows between unbounded preceding and 1 preceding), 0) as s,
           coalesce(sum(m) over (order by d, coalesce(sh, 0), id rows between unbounded preceding and current row), 0) as e
    from _w0;
  create temp table _pos on commit drop as
    select id, coalesce(sum(m) over (order by d, coalesce(sh, 0), id rows between unbounded preceding and 1 preceding), 0) as s,
           coalesce(sum(m) over (order by d, coalesce(sh, 0), id rows between unbounded preceding and current row), 0) as e
    from _w;

  -- интервалы диаметров обязаны сходиться с забоем
  for rr in
    select p.id, p.s, p.e, w.d, w.sh
    from _pos p join _w w using (id)
    where w.m > 0 and exists (select 1 from _dm where report_id = p.id and not rm)
  loop
    label := to_char(rr.d, 'DD.MM') || coalesce(', смена ' || rr.sh, '');
    select min(f), max(t) into a_min, a_max from _dm where report_id = rr.id and not rm;
    if abs(a_min - rr.s) > 0.011 or abs(a_max - rr.e) > 0.011 then
      errors := errors || ('Интервалы диаметров (' || label || ') не сходятся с забоем: нужно ' || round(rr.s, 2) || '–' || round(rr.e, 2) || ' м, сейчас ' || round(a_min, 2) || '–' || round(a_max, 2) || ' м')::text;
    end if;
    if exists (select 1 from _dm where report_id = rr.id and t < f) then
      errors := errors || ('Интервал диаметра (' || label || ') задан «до» меньше «от»')::text;
    end if;
    if exists (
      select 1 from (select f, lag(t) over (order by f) as pt from _dm where report_id = rr.id and not rm) q
      where pt is not null and abs(f - pt) > 0.011
    ) then
      errors := errors || ('Интервалы диаметров (' || label || ') идут с разрывом или наложением')::text;
    end if;
  end loop;
  for rr in
    select p.id, p.e, c.c, c.dep, w.d, w.sh
    from _cs c join _pos p on p.id = c.report_id join _w w on w.id = c.report_id
    where c.dep > p.e + 0.011
  loop
    errors := errors || ('Обсадка ' || rr.c || ' до ' || round(rr.dep, 2) || ' м глубже забоя сводки (' || to_char(rr.d, 'DD.MM') || coalesce(', смена ' || rr.sh, '') || ', забой ' || round(rr.e, 2) || ' м)')::text;
  end loop;

  -- затраты: статья существует, количество не отрицательное
  for rr in select rc.report_id, rc.item, rc.qty, w.d, w.sh from _rc rc join _w w on w.id = rc.report_id loop
    if rr.item is null or not exists (select 1 from cost_items where id = rr.item) then
      errors := errors || ('Не выбрана статья затрат (' || to_char(rr.d, 'DD.MM') || coalesce(', смена ' || rr.sh, '') || ')')::text;
    elsif rr.qty is null or rr.qty < 0 then
      errors := errors || ('Количество затрат должно быть не меньше нуля (' || to_char(rr.d, 'DD.MM') || coalesce(', смена ' || rr.sh, '') || ')')::text;
    end if;
  end loop;

  -- предупреждения
  select coalesce(max(e), 0) into old_total from _pos0;
  select coalesce(max(e), 0) into new_total from _pos;
  if abs(new_total - old_total) > 0.005 then
    warnings := warnings || ('Забой скважины изменится: ' || round(old_total, 2) || ' → ' || round(new_total, 2) || ' м (' || case when new_total > old_total then '+' else '' end || round(new_total - old_total, 2) || ' м)')::text;
  end if;
  select count(*) into shifted from _pos p join _pos0 q using (id) where abs(p.s - q.s) > 0.005;
  if shifted > 0 then
    warnings := warnings || ('Сдвинется забой у ' || shifted || ' сводок')::text;
  end if;
  select projected_depth into proj from drilling_tasks where id = p_task;
  if proj is not null and new_total > proj then
    warnings := warnings || ('Забой (' || round(new_total, 2) || ' м) превышает проектную глубину (' || round(proj, 2) || ' м)')::text;
  end if;
  select count(*) into auth_changed from _w w join _w0 w0 using (id) where w.a is distinct from w0.a;
  if auth_changed > 0 then
    warnings := warnings || ('Меняется составитель у ' || auth_changed || ' сводок: изменится «кто бурил» в отчётах')::text;
  end if;

  if p_apply and cardinality(errors) = 0 then
    for ed in select * from jsonb_array_elements(p_edits) loop
      rid := (ed->>'report_id')::uuid;
      select * into r from reports where id = rid for update;
      chg := '{}'::jsonb;
      if ed ? 'meters' and coalesce(nullif(ed->>'meters', '')::numeric, 0) is distinct from coalesce(r.drilling_meters, 0) then
        chg := chg || jsonb_build_object('drilling_meters', jsonb_build_object('old', r.drilling_meters, 'new', coalesce(nullif(ed->>'meters', '')::numeric, 0)));
      end if;
      if ed ? 'hours' and nullif(ed->>'hours', '')::numeric is distinct from r.hours_worked then
        chg := chg || jsonb_build_object('hours_worked', jsonb_build_object('old', r.hours_worked, 'new', nullif(ed->>'hours', '')::numeric));
      end if;
      if ed ? 'author_id' and (ed->>'author_id')::uuid is distinct from r.author_id then
        chg := chg || jsonb_build_object('author_id', jsonb_build_object('old', r.author_id, 'new', (ed->>'author_id')::uuid));
      end if;
      if ed ? 'notes' and nullif(ed->>'notes', '') is distinct from r.shift_notes then
        chg := chg || jsonb_build_object('shift_notes', jsonb_build_object('old', r.shift_notes, 'new', nullif(ed->>'notes', '')));
      end if;
      if ed ? 'date' and (ed->>'date')::date is distinct from r.report_date then
        chg := chg || jsonb_build_object('report_date', jsonb_build_object('old', r.report_date, 'new', (ed->>'date')::date));
      end if;
      if ed ? 'shift' and nullif(ed->>'shift', '')::int is distinct from r.shift_number then
        chg := chg || jsonb_build_object('shift_number', jsonb_build_object('old', r.shift_number, 'new', nullif(ed->>'shift', '')::int));
      end if;
      if ed ? 'diameters' then
        select coalesce(jsonb_agg(jsonb_build_object('from', depth_from, 'to', depth_to, 'code', diameter_code, 'reaming', is_reaming) order by is_reaming, depth_from), '[]'::jsonb)
          into oldd from report_drill_diameters where report_id = rid;
        select coalesce(jsonb_agg(jsonb_build_object('from', x."from", 'to', x."to", 'code', x.code, 'reaming', coalesce(x.reaming, false)) order by coalesce(x.reaming, false), x."from"), '[]'::jsonb)
          into newd from jsonb_to_recordset(ed->'diameters') as x("from" numeric, "to" numeric, code text, reaming boolean);
        if oldd is distinct from newd then
          chg := chg || jsonb_build_object('diameters', jsonb_build_object('old', oldd, 'new', newd));
        end if;
      end if;
      if ed ? 'casings' then
        select coalesce(jsonb_agg(jsonb_build_object('code', diameter_code, 'depth', depth_to) order by diameter_code), '[]'::jsonb)
          into oldc from report_casings where report_id = rid;
        select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'depth', x.depth) order by x.code), '[]'::jsonb)
          into newc from jsonb_to_recordset(ed->'casings') as x(code text, depth numeric);
        if oldc is distinct from newc then
          chg := chg || jsonb_build_object('casings', jsonb_build_object('old', oldc, 'new', newc));
        end if;
      end if;
      if ed ? 'costs' then
        select coalesce(jsonb_agg(jsonb_build_object('item', cost_item_id, 'qty', quantity) order by cost_item_id, quantity), '[]'::jsonb)
          into oldc from report_costs where report_id = rid;
        select coalesce(jsonb_agg(jsonb_build_object('item', x.item, 'qty', x.qty) order by x.item, x.qty), '[]'::jsonb)
          into newc from jsonb_to_recordset(ed->'costs') as x(item uuid, qty numeric);
        if oldc is distinct from newc then
          chg := chg || jsonb_build_object('costs', jsonb_build_object('old', oldc, 'new', newc));
        end if;
      end if;
      if chg = '{}'::jsonb then
        continue;
      end if;

      update reports
      set drilling_meters = case when ed ? 'meters' then coalesce(nullif(ed->>'meters', '')::numeric, 0) else drilling_meters end,
          hours_worked = case when ed ? 'hours' then nullif(ed->>'hours', '')::numeric else hours_worked end,
          author_id = case when ed ? 'author_id' then (ed->>'author_id')::uuid else author_id end,
          shift_notes = case when ed ? 'notes' then nullif(ed->>'notes', '') else shift_notes end,
          report_date = case when ed ? 'date' then (ed->>'date')::date else report_date end,
          shift_number = case when ed ? 'shift' then nullif(ed->>'shift', '')::int else shift_number end,
          last_edited_at = now(),
          edit_count = edit_count + 1
      where id = rid;

      if chg ? 'diameters' then
        delete from report_drill_diameters where report_id = rid;
        insert into report_drill_diameters (report_id, depth_from, depth_to, diameter_code, is_reaming)
          select rid, x."from", x."to", x.code, coalesce(x.reaming, false)
          from jsonb_to_recordset(ed->'diameters') as x("from" numeric, "to" numeric, code text, reaming boolean);
      end if;
      if chg ? 'casings' then
        delete from report_casings where report_id = rid;
        insert into report_casings (report_id, diameter_code, depth_to)
          select rid, x.code, x.depth from jsonb_to_recordset(ed->'casings') as x(code text, depth numeric);
      end if;

      if chg ? 'costs' then
        delete from report_costs where report_id = rid;
        insert into report_costs (report_id, cost_item_id, quantity)
          select rid, x.item, x.qty from jsonb_to_recordset(ed->'costs') as x(item uuid, qty numeric);
      end if;

      insert into report_edit_log (batch_id, report_id, task_id, editor_id, reason, changes)
      values (batch, rid, p_task, auth.uid(), trim(p_reason), chg);
    end loop;
    applied := true;
  end if;

  return jsonb_build_object(
    'ok', cardinality(errors) = 0,
    'applied', applied,
    'errors', to_jsonb(errors),
    'warnings', to_jsonb(warnings),
    'old_depth', round(old_total, 2),
    'new_depth', round(new_total, 2),
    'shifted', shifted
  );
end;
$$;

create or replace function admin_revert_edit(p_log uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l report_edit_log%rowtype;
  edit jsonb := '{}'::jsonb;
  k text;
  res jsonb;
begin
  if not (is_management() or has_cap('corrections_db')) then
    raise exception 'Откатывать исправления может только руководство' using errcode = '42501';
  end if;
  select * into l from report_edit_log where id = p_log;
  if not found then
    raise exception 'Запись журнала не найдена';
  end if;
  edit := jsonb_build_object('report_id', l.report_id);
  for k in select jsonb_object_keys(l.changes) loop
    edit := edit || jsonb_build_object(
      case k
        when 'drilling_meters' then 'meters'
        when 'hours_worked' then 'hours'
        when 'shift_notes' then 'notes'
        when 'report_date' then 'date'
        when 'shift_number' then 'shift'
        else k
      end,
      l.changes->k->'old'
    );
  end loop;
  res := admin_edit_reports(l.task_id, coalesce(nullif(trim(p_reason), ''), 'Откат исправления от ' || to_char(l.edited_at, 'DD.MM.YYYY HH24:MI')), jsonb_build_array(edit), true);
  if (res->>'applied')::boolean then
    update report_edit_log set reverted = true where id = p_log;
  end if;
  return res;
end;
$$;


grant execute on function admin_edit_reports(uuid, text, jsonb, boolean) to authenticated;
grant execute on function admin_revert_edit(uuid, text) to authenticated;
grant execute on function has_cap(text) to authenticated;
grant execute on function sees_all() to authenticated;
