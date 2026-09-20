-- ============================================================================
-- Этап 10: распределение работников по задачам (20.09.2026, по запросу
-- заказчика). "Работники" (см. миграцию 0009) до сих пор были привязаны
-- только к бригадиру ("своя бригада") — теперь бригадир (или техдир/гендир)
-- может дополнительно расписать, кто из ЕГО бригады выполняет конкретную
-- роль на конкретном задании: буровик/помбур на скважине, ответственный
-- исполнитель на описании керна/распиловке/опробовании.
--
-- Это ЧИСТО учётная информация (для отчётности "кто именно делал"), она
-- НЕ меняет, кто согласовывает и кто может подавать сводки — тот механизм
-- (foreman_id / assigned_party_chief_id на самих заданиях) не трогаем.
--
-- Одна строка = один работник в одной роли на одном задании. Заданий-типов
-- четыре (как и в reports, см. one_task_source) — тот же приём с
-- num_nonnulls() для проверки "ровно один FK из четырёх".
-- ============================================================================

create table task_worker_assignments (
  id uuid primary key default gen_random_uuid(),

  drilling_task_id uuid references drilling_tasks(id) on delete cascade,
  core_description_task_id uuid references core_description_tasks(id) on delete cascade,
  core_sawing_task_id uuid references core_sawing_tasks(id) on delete cascade,
  sampling_task_id uuid references sampling_tasks(id) on delete cascade,

  -- 'driller'/'assistant_driller' — только для drilling_task_id (буровик
  -- один, помбуров может быть несколько сразу); 'responsible' — для
  -- остальных трёх видов (обычно один человек, но не ограничиваем числом).
  role text not null check (role in ('driller', 'assistant_driller', 'responsible')),

  worker_id uuid not null references workers(id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint one_task_source check (
    num_nonnulls(drilling_task_id, core_description_task_id, core_sawing_task_id, sampling_task_id) = 1
  )
);

comment on table task_worker_assignments is
  'Учётное распределение конкретных работников по ролям на задании — не влияет на согласование/права на подачу сводок.';

-- Уникальность (задание, роль, работник) — по одному частичному индексу на
-- каждый вид задания: обычный UNIQUE по всем 4 FK-колонкам не сработал бы,
-- т.к. в Postgres NULL никогда не равен NULL, а ровно 3 из 4 колонок у
-- каждой строки всегда NULL (см. one_task_source выше).
create unique index task_worker_assignments_drilling_uniq
  on task_worker_assignments (drilling_task_id, role, worker_id)
  where drilling_task_id is not null;
create unique index task_worker_assignments_core_description_uniq
  on task_worker_assignments (core_description_task_id, role, worker_id)
  where core_description_task_id is not null;
create unique index task_worker_assignments_core_sawing_uniq
  on task_worker_assignments (core_sawing_task_id, role, worker_id)
  where core_sawing_task_id is not null;
create unique index task_worker_assignments_sampling_uniq
  on task_worker_assignments (sampling_task_id, role, worker_id)
  where sampling_task_id is not null;

alter table task_worker_assignments enable row level security;

-- Читать может любой авторизованный (как и остальные справочники/учётные
-- данные, не связанные напрямую с деньгами или персональными данными).
create policy "task_worker_assignments_select_all"
  on task_worker_assignments for select
  using (auth.uid() is not null);

create policy "task_worker_assignments_write_management"
  on task_worker_assignments for all
  using (is_management())
  with check (is_management());

-- Бригадир/ответственный САМ распределяет СВОИХ работников по СВОИМ
-- заданиям — тот же принцип владения заданием, что и в reports_insert_own
-- (миграция 0007), плюс дополнительная проверка: работника можно назначить,
-- только если он реально числится в бригаде именно этого бригадира
-- (workers.assigned_foreman_id), а не взят из чужого списка.
create policy "task_worker_assignments_own_foreman"
  on task_worker_assignments for all
  using (
    exists (
      select 1 from drilling_tasks dt
      where dt.id = task_worker_assignments.drilling_task_id and dt.foreman_id = auth.uid()
    )
    or exists (
      select 1 from core_description_tasks cdt
      left join drilling_tasks dt2 on dt2.id = cdt.drilling_task_id
      where cdt.id = task_worker_assignments.core_description_task_id
        and (dt2.foreman_id = auth.uid() or cdt.assigned_party_chief_id = auth.uid())
    )
    or exists (
      select 1 from core_sawing_tasks cst
      join drilling_tasks dt3 on dt3.id = cst.drilling_task_id
      where cst.id = task_worker_assignments.core_sawing_task_id and dt3.foreman_id = auth.uid()
    )
    or exists (
      select 1 from sampling_tasks st
      where st.id = task_worker_assignments.sampling_task_id and st.assigned_party_chief_id = auth.uid()
    )
  )
  with check (
    (
      exists (
        select 1 from drilling_tasks dt
        where dt.id = task_worker_assignments.drilling_task_id and dt.foreman_id = auth.uid()
      )
      or exists (
        select 1 from core_description_tasks cdt
        left join drilling_tasks dt2 on dt2.id = cdt.drilling_task_id
        where cdt.id = task_worker_assignments.core_description_task_id
          and (dt2.foreman_id = auth.uid() or cdt.assigned_party_chief_id = auth.uid())
      )
      or exists (
        select 1 from core_sawing_tasks cst
        join drilling_tasks dt3 on dt3.id = cst.drilling_task_id
        where cst.id = task_worker_assignments.core_sawing_task_id and dt3.foreman_id = auth.uid()
      )
      or exists (
        select 1 from sampling_tasks st
        where st.id = task_worker_assignments.sampling_task_id and st.assigned_party_chief_id = auth.uid()
      )
    )
    and exists (
      select 1 from workers w
      where w.id = task_worker_assignments.worker_id and w.assigned_foreman_id = auth.uid()
    )
  );
