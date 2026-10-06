-- ============================================================================
-- 0027: фактический диаметр бурения по сводкам (06.10.2026).
-- Мастер в сводке по бурению выбирает размер штанги (AQ/BQ/NQ/HQ/PQ); если
-- за смену диаметр сменился — добавляет интервал «с какого метра». Один
-- интервал = одна строка. Плановые диаметры задания (drilling_task_diameters)
-- не трогаются — на стволе рисуется факт, а где его ещё нет — план.
-- Права как у report_costs: пишет автор, пока сводка черновик/разблокирована,
-- или руководство; читает тот, кто видит саму сводку.
-- Идемпотентна.
-- ============================================================================

create table if not exists report_drill_diameters (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  depth_from numeric not null,
  depth_to numeric not null,
  diameter_code text not null check (diameter_code in ('AQ', 'BQ', 'NQ', 'HQ', 'PQ')),
  check (depth_to >= depth_from)
);

create index if not exists report_drill_diameters_report_idx on report_drill_diameters(report_id);

alter table report_drill_diameters enable row level security;

drop policy if exists "report_drill_diameters_select" on report_drill_diameters;
create policy "report_drill_diameters_select"
  on report_drill_diameters for select
  using (
    exists (select 1 from reports r where r.id = report_drill_diameters.report_id)
  );

drop policy if exists "report_drill_diameters_write_own_or_management" on report_drill_diameters;
create policy "report_drill_diameters_write_own_or_management"
  on report_drill_diameters for all
  using (
    is_management()
    or exists (
      select 1 from reports r
      where r.id = report_drill_diameters.report_id
        and r.author_id = auth.uid()
        and (r.approval_status = 'draft' or r.edit_unlocked = true)
    )
  )
  with check (
    is_management()
    or exists (
      select 1 from reports r
      where r.id = report_drill_diameters.report_id
        and r.author_id = auth.uid()
        and (r.approval_status = 'draft' or r.edit_unlocked = true)
    )
  );
