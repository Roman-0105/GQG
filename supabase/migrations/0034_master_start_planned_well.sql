-- ============================================================================
-- 0034: мастер сам приступает к запланированной скважине (07.10.2026).
--  * Мастера (роль party_chief) видят запланированные скважины (status = 'planned').
--  * start_planned_well(скважина, дата, бригада) — мастер берёт скважину в работу:
--    становится бригадиром, статус in_progress, дата начала, организация
--    бурения (если не задана при планировании — «своя» организация), и в тот же
--    момент назначается состав бригады (буровики и помощники по сменам).
--    Работники без бригады приписываются к мастеру; чужих не берём.
-- Идемпотентна.
-- ============================================================================

create or replace function is_party_chief()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'party_chief');
$$;

drop policy if exists "drilling_tasks_select" on drilling_tasks;
create policy "drilling_tasks_select"
  on drilling_tasks for select
  using (
    is_management()
    or foreman_id = auth.uid()
    or is_geology_assignee_of_well(drilling_tasks.id)
    or can_view_drilling_task(drilling_tasks.id)
    or (drilling_tasks.status = 'planned' and is_party_chief())
  );

-- p_crew: [{"worker_id": "...", "role": "driller" | "assistant_driller", "shift": 1 | 2}, ...]
create or replace function start_planned_well(p_task uuid, p_start date, p_crew jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  t drilling_tasks%rowtype;
  org uuid;
  item jsonb;
  wid uuid;
  wrole text;
  wshift int;
  w workers%rowtype;
  crew_role_of text;
  n_driller int := 0;
  n_assistant int := 0;
begin
  if me is null or not is_party_chief() then
    raise exception 'Приступить к скважине может только мастер (роль «Ответственный»)' using errcode = '42501';
  end if;
  select * into t from drilling_tasks where id = p_task for update;
  if not found or t.status <> 'planned' then
    raise exception 'Скважина уже не запланирована (кто-то успел её запустить)';
  end if;
  if p_start is null then
    raise exception 'Укажите дату начала бурения';
  end if;
  if p_crew is null or jsonb_typeof(p_crew) <> 'array' or jsonb_array_length(p_crew) = 0 then
    raise exception 'Выберите работников бригады';
  end if;

  -- проверяем бригаду
  for item in select * from jsonb_array_elements(p_crew) loop
    wid := (item->>'worker_id')::uuid;
    wrole := item->>'role';
    wshift := nullif(item->>'shift', '')::int;
    if wrole not in ('driller', 'assistant_driller') or wshift not in (1, 2) then
      raise exception 'Неверная роль или смена в составе бригады';
    end if;
    select * into w from workers where id = wid and archived_at is null;
    if not found then
      raise exception 'Работник не найден или в архиве';
    end if;
    if w.assigned_foreman_id is not null and w.assigned_foreman_id <> me then
      raise exception 'Работник % числится в бригаде другого мастера', w.full_name;
    end if;
    select pos.crew_role into crew_role_of from positions pos where pos.id = w.position_id;
    if crew_role_of is distinct from wrole then
      raise exception 'Должность работника % не подходит для выбранной роли', w.full_name;
    end if;
    if wrole = 'driller' then n_driller := n_driller + 1; else n_assistant := n_assistant + 1; end if;
  end loop;
  if n_driller = 0 or n_assistant = 0 then
    raise exception 'В бригаде нужен хотя бы один машинист-буровик и один помощник';
  end if;

  org := t.drilling_org_id;
  if org is null then
    select id into org from drilling_organizations where is_own limit 1;
  end if;
  if org is null then
    raise exception 'Не задана организация бурения — обратитесь к руководству';
  end if;

  update drilling_tasks
  set status = 'in_progress',
      foreman_id = me,
      start_date = p_start,
      drilling_org_id = org
  where id = p_task;

  -- бригада: приписываем свободных, назначения по сменам
  perform set_config('app.transfer_reason', 'приступили к скважине', true);
  perform set_config('app.transfer_date', p_start::text, true);
  for item in select * from jsonb_array_elements(p_crew) loop
    wid := (item->>'worker_id')::uuid;
    update workers set assigned_foreman_id = me where id = wid and assigned_foreman_id is null;
    insert into task_worker_assignments (drilling_task_id, role, worker_id, shift_number, valid_from)
    values (p_task, item->>'role', wid, (item->>'shift')::int, p_start);
  end loop;

  return jsonb_build_object('task', p_task, 'crew', jsonb_array_length(p_crew));
end;
$$;

grant execute on function is_party_chief() to authenticated;
grant execute on function start_planned_well(uuid, date, jsonb) to authenticated;
