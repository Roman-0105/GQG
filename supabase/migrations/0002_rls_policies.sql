-- ============================================================================
-- Этап 2: RLS-политики
--
-- Ключевые правила из ТЗ:
-- - Гендир и техдир — полный доступ везде (is_management()).
-- - Начальник партии (party_chief) видит только те задания, где он назначен
--   бригадиром (foreman_id), и только те сводки, которые сам создал.
-- - Начальник партии создаёт сводки, но не может править отправленную —
--   только через запрос на правку, одобряемый гендиром/техдиром
--   (флаг edit_unlocked снимает блокировку редактирования для автора).
-- - Скважины подрядчика (external_*) в core_description_tasks редактирует
--   только гендир/техдир.
-- ============================================================================

alter table profiles enable row level security;
alter table drilling_organizations enable row level security;
alter table cost_categories enable row level security;
alter table sites enable row level security;
alter table drilling_tasks enable row level security;
alter table drilling_task_diameters enable row level security;
alter table core_description_tasks enable row level security;
alter table core_description_external_diameters enable row level security;
alter table reports enable row level security;
alter table report_costs enable row level security;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create policy "profiles_select_own_or_management"
  on profiles for select
  using (id = auth.uid() or is_management());

create policy "profiles_insert_management"
  on profiles for insert
  with check (is_management());

create policy "profiles_update_management"
  on profiles for update
  using (is_management());

-- ----------------------------------------------------------------------------
-- Справочники — читать могут все авторизованные, править — только management
-- ----------------------------------------------------------------------------
create policy "drilling_organizations_select_all"
  on drilling_organizations for select
  using (auth.uid() is not null);

create policy "drilling_organizations_write_management"
  on drilling_organizations for all
  using (is_management())
  with check (is_management());

create policy "cost_categories_select_all"
  on cost_categories for select
  using (auth.uid() is not null);

create policy "cost_categories_write_management"
  on cost_categories for all
  using (is_management())
  with check (is_management());

-- ----------------------------------------------------------------------------
-- sites — management видит и правит всё; party_chief видит только те
-- участки, где у него есть хотя бы одно назначенное задание
-- ----------------------------------------------------------------------------
create policy "sites_select"
  on sites for select
  using (
    is_management()
    or exists (
      select 1 from drilling_tasks dt
      where dt.site_id = sites.id and dt.foreman_id = auth.uid()
    )
    or exists (
      select 1 from core_description_tasks cdt
      join drilling_tasks dt2 on dt2.id = cdt.drilling_task_id
      where cdt.site_id = sites.id and dt2.foreman_id = auth.uid()
    )
  );

create policy "sites_write_management"
  on sites for insert
  with check (is_management());

create policy "sites_update_management"
  on sites for update
  using (is_management());

-- ----------------------------------------------------------------------------
-- drilling_tasks — management полный доступ; party_chief видит только свои
-- (где он бригадир)
-- ----------------------------------------------------------------------------
create policy "drilling_tasks_select"
  on drilling_tasks for select
  using (is_management() or foreman_id = auth.uid());

create policy "drilling_tasks_write_management"
  on drilling_tasks for insert
  with check (is_management());

create policy "drilling_tasks_update_management"
  on drilling_tasks for update
  using (is_management());

create policy "drilling_task_diameters_select"
  on drilling_task_diameters for select
  using (
    exists (
      select 1 from drilling_tasks dt
      where dt.id = drilling_task_diameters.drilling_task_id
        and (is_management() or dt.foreman_id = auth.uid())
    )
  );

create policy "drilling_task_diameters_write_management"
  on drilling_task_diameters for all
  using (is_management())
  with check (is_management());

-- ----------------------------------------------------------------------------
-- core_description_tasks — как drilling_tasks, но "доступ по назначению"
-- определяется через связанный drilling_task (для своих скважин) или
-- напрямую не ограничивается для party_chief, если задание "внешнее"
-- (в этом случае доступ на СВОЁ участие даёт запись в reports, а не
-- назначение — задание на внешнюю скважину создаёт management, см. ТЗ)
-- ----------------------------------------------------------------------------
create policy "core_description_tasks_select"
  on core_description_tasks for select
  using (
    is_management()
    or exists (
      select 1 from drilling_tasks dt
      where dt.id = core_description_tasks.drilling_task_id
        and dt.foreman_id = auth.uid()
    )
    or exists (
      -- party_chief видит внешнее задание, если ему уже назначили сводку по нему
      select 1 from reports r
      where r.core_description_task_id = core_description_tasks.id
        and r.author_id = auth.uid()
    )
  );

-- Создание и любое изменение (в т.ч. дозаполнение external_* полей) —
-- только гендир/техдир, для ОБОИХ типов (своя скважина / скважина
-- подрядчика) — см. ТЗ раздел 8/v0.6.
create policy "core_description_tasks_write_management"
  on core_description_tasks for all
  using (is_management())
  with check (is_management());

create policy "core_description_external_diameters_select"
  on core_description_external_diameters for select
  using (
    exists (
      select 1 from core_description_tasks cdt
      where cdt.id = core_description_external_diameters.core_description_task_id
    )
  );

create policy "core_description_external_diameters_write_management"
  on core_description_external_diameters for all
  using (is_management())
  with check (is_management());

-- ----------------------------------------------------------------------------
-- reports — party_chief создаёт свои сводки и видит только свои;
-- редактирует только черновики (draft) или разблокированные (edit_unlocked);
-- management видит и может согласовывать все
-- ----------------------------------------------------------------------------
create policy "reports_select"
  on reports for select
  using (is_management() or author_id = auth.uid());

create policy "reports_insert_own"
  on reports for insert
  with check (author_id = auth.uid());

-- Автор может обновлять свою сводку, ТОЛЬКО пока она черновик или пока
-- ему явно разблокировали правку (edit_unlocked = true) после одобрения
-- запроса. Смену approval_status на 'approved' автору не даём — это
-- делает отдельная политика для management.
create policy "reports_update_own_when_editable"
  on reports for update
  using (
    author_id = auth.uid()
    and (approval_status = 'draft' or edit_unlocked = true)
  )
  with check (author_id = auth.uid());

-- management может обновлять любую сводку (в т.ч. approval_status,
-- edit_unlocked — сам процесс согласования/разблокировки)
create policy "reports_update_management"
  on reports for update
  using (is_management());

create policy "report_costs_select"
  on report_costs for select
  using (
    exists (
      select 1 from reports r
      where r.id = report_costs.report_id
        and (is_management() or r.author_id = auth.uid())
    )
  );

create policy "report_costs_write_own_or_management"
  on report_costs for all
  using (
    is_management()
    or exists (
      select 1 from reports r
      where r.id = report_costs.report_id
        and r.author_id = auth.uid()
        and (r.approval_status = 'draft' or r.edit_unlocked = true)
    )
  )
  with check (
    is_management()
    or exists (
      select 1 from reports r
      where r.id = report_costs.report_id
        and r.author_id = auth.uid()
        and (r.approval_status = 'draft' or r.edit_unlocked = true)
    )
  );
