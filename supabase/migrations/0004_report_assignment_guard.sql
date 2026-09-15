-- ============================================================================
-- Этап 5, подготовка: у задания "Описание керна" по скважине подрядчика
-- нет бригадира (полей персонала там нет намеренно, см. ТЗ). Но кто-то
-- всё равно должен вносить по нему сводки — нужен явный ответственный.
-- Заодно ужесточаем RLS на reports: раньше начальник партии технически
-- мог вставить сводку по ЛЮБОМУ заданию (проверялось только author_id),
-- это было прикрыто только интерфейсом, а не базой.
-- ============================================================================

alter table core_description_tasks
  add column assigned_party_chief_id uuid references profiles(id);

comment on column core_description_tasks.assigned_party_chief_id is
  'Обязательно для заданий по скважине подрядчика (drilling_task_id is null) — '
  'для своей скважины ответственный уже определяется через foreman_id связанного drilling_task.';

-- Пересоздаём core_description_tasks_select с учётом нового поля
drop policy if exists "core_description_tasks_select" on core_description_tasks;

create policy "core_description_tasks_select"
  on core_description_tasks for select
  using (
    is_management()
    or exists (
      select 1 from drilling_tasks dt
      where dt.id = core_description_tasks.drilling_task_id
        and dt.foreman_id = auth.uid()
    )
    or assigned_party_chief_id = auth.uid()
  );

-- Пересоздаём reports_insert_own — теперь реально проверяет, что автор
-- назначен на задание (бригадир своей скважины ИЛИ ответственный за
-- скважину подрядчика), а не просто "author_id = свой id".
drop policy if exists "reports_insert_own" on reports;

create policy "reports_insert_own"
  on reports for insert
  with check (
    author_id = auth.uid()
    and (
      exists (
        select 1 from drilling_tasks dt
        where dt.id = reports.drilling_task_id
          and dt.foreman_id = auth.uid()
      )
      or exists (
        select 1 from core_description_tasks cdt
        left join drilling_tasks dt2 on dt2.id = cdt.drilling_task_id
        where cdt.id = reports.core_description_task_id
          and (dt2.foreman_id = auth.uid() or cdt.assigned_party_chief_id = auth.uid())
      )
    )
  );
