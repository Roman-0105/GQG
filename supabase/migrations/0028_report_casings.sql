-- ============================================================================
-- 0028: обсадка скважины по сводкам (06.10.2026).
-- Строка пишется только в той сводке, где обсадка изменилась (спустили
-- колонну или углубили): диаметр + глубина «до» (от устья). Текущее состояние
-- скважины = максимальная глубина по каждому диаметру среди сводок задания.
-- Права как у report_drill_diameters. Идемпотентна.
-- ============================================================================

create table if not exists report_casings (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  diameter_code text not null check (diameter_code in ('AQ', 'BQ', 'NQ', 'HQ', 'PQ')),
  depth_to numeric not null check (depth_to > 0)
);

create index if not exists report_casings_report_idx on report_casings(report_id);

alter table report_casings enable row level security;

drop policy if exists "report_casings_select" on report_casings;
create policy "report_casings_select"
  on report_casings for select
  using (
    exists (select 1 from reports r where r.id = report_casings.report_id)
  );

drop policy if exists "report_casings_write_own_or_management" on report_casings;
create policy "report_casings_write_own_or_management"
  on report_casings for all
  using (
    is_management()
    or exists (
      select 1 from reports r
      where r.id = report_casings.report_id
        and r.author_id = auth.uid()
        and (r.approval_status = 'draft' or r.edit_unlocked = true)
    )
  )
  with check (
    is_management()
    or exists (
      select 1 from reports r
      where r.id = report_casings.report_id
        and r.author_id = auth.uid()
        and (r.approval_status = 'draft' or r.edit_unlocked = true)
    )
  );
