-- ============================================================================
-- 0039. Разделение сводок по профилю работ (09.10.2026, этап 3).
-- Профиль берётся из должности автора (positions.work_area):
--   * геологический профиль не подаёт сводки по бурению;
--   * буровой профиль не подаёт сводки по описанию керна и опробованию,
--     кроме работ, прицепленных к его собственной скважине (составная форма
--     сводки мастера) — распиловка на его скважине разрешена как и раньше.
-- Должность с профилем «other» или без должности — без ограничений.
-- Начальство не ограничивается. Политика RESTRICTIVE: добавляется поверх
-- существующих (reports_insert_own и др.), их не меняет.
-- ============================================================================

create or replace function report_area_allowed(p_drilling uuid, p_core uuid, p_sampling uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  area text;
begin
  if is_management() then
    return true;
  end if;
  select pos.work_area into area
  from profiles p join positions pos on pos.id = p.position_id
  where p.id = auth.uid();
  if area is null or area = 'other' then
    return true;
  end if;
  if area = 'geology' then
    return p_drilling is null;
  end if;
  -- буровой профиль
  if p_core is not null then
    return exists (
      select 1 from core_description_tasks cdt
      join drilling_tasks dt on dt.id = cdt.drilling_task_id
      where cdt.id = p_core and dt.foreman_id = auth.uid()
    );
  end if;
  if p_sampling is not null then
    return exists (
      select 1 from sampling_tasks st
      join drilling_tasks dt on dt.id = st.drilling_task_id
      where st.id = p_sampling and dt.foreman_id = auth.uid()
    );
  end if;
  return true;
end;
$$;

grant execute on function report_area_allowed(uuid, uuid, uuid) to authenticated;

drop policy if exists "reports_insert_area_split" on reports;
create policy "reports_insert_area_split"
  on reports as restrictive for insert
  with check (report_area_allowed(drilling_task_id, core_description_task_id, sampling_task_id));
