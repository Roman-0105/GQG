-- ============================================================================
-- 0021: геологический блок (03.10.2026, по реальной сводке из WhatsApp).
--
-- 1. sample_types       — справочник видов проб (объёмный вес и т.д.),
--                         редактируется руководством (добавить/переименовать/
--                         удалить), геологи выбирают вид при заполнении сводки.
-- 2. report_samples     — сколько проб какого вида отобрано в сводке.
--                         reports.samples_taken остаётся ИТОГОМ (сумма по видам),
--                         так что вся прежняя логика прогресса работает как раньше.
-- 3. task_assignees     — несколько ответственных на одно геологическое
--                         задание (описание керна / распиловка / опробование).
--                         У core/sampling прежнее поле assigned_party_chief_id
--                         остаётся «основным» ответственным и дублируется здесь.
-- 4. reports.documentation_finished / sampling_layout_done — отметки
--                         «документация закончена» и «разбивка на опробование».
-- 5. Права геолога: видит и заполняет СВОИ задания (RLS), видит саму
--    скважину и ИТОГОВЫЙ прогресс бурения (функция drilling_task_progress),
--    но не сводки бурения (там комментарии и затраты).
-- Идемпотентна там, где это возможно.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Виды проб
-- ---------------------------------------------------------------------------
create table if not exists sample_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table sample_types enable row level security;

drop policy if exists "sample_types_select_all" on sample_types;
create policy "sample_types_select_all"
  on sample_types for select
  using (auth.uid() is not null);

drop policy if exists "sample_types_write_management" on sample_types;
create policy "sample_types_write_management"
  on sample_types for all
  using (is_management())
  with check (is_management());

insert into sample_types (name) values ('Объёмный вес')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Пробы в сводке по видам
-- ---------------------------------------------------------------------------
create table if not exists report_samples (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  -- restrict: вид, по которому уже есть пробы, удалить нельзя (иначе
  -- потеряется история) — его можно переименовать.
  sample_type_id uuid not null references sample_types(id) on delete restrict,
  quantity integer not null check (quantity >= 0),
  unique (report_id, sample_type_id)
);

alter table report_samples enable row level security;

drop policy if exists "report_samples_select" on report_samples;
create policy "report_samples_select"
  on report_samples for select
  using (
    exists (
      select 1 from reports r
      where r.id = report_samples.report_id
        and (is_management() or r.author_id = auth.uid())
    )
  );

drop policy if exists "report_samples_write_own_or_management" on report_samples;
create policy "report_samples_write_own_or_management"
  on report_samples for all
  using (
    is_management()
    or exists (
      select 1 from reports r
      where r.id = report_samples.report_id
        and r.author_id = auth.uid()
        and (r.approval_status = 'draft' or r.edit_unlocked = true)
    )
  )
  with check (
    is_management()
    or exists (
      select 1 from reports r
      where r.id = report_samples.report_id
        and r.author_id = auth.uid()
        and (r.approval_status = 'draft' or r.edit_unlocked = true)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Несколько ответственных на геологическое задание
-- ---------------------------------------------------------------------------
create table if not exists task_assignees (
  id uuid primary key default gen_random_uuid(),
  core_description_task_id uuid references core_description_tasks(id) on delete cascade,
  core_sawing_task_id uuid references core_sawing_tasks(id) on delete cascade,
  sampling_task_id uuid references sampling_tasks(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint task_assignees_one_task check (
    num_nonnulls(core_description_task_id, core_sawing_task_id, sampling_task_id) = 1
  )
);

create unique index if not exists task_assignees_core_uniq
  on task_assignees (core_description_task_id, profile_id) where core_description_task_id is not null;
create unique index if not exists task_assignees_sawing_uniq
  on task_assignees (core_sawing_task_id, profile_id) where core_sawing_task_id is not null;
create unique index if not exists task_assignees_sampling_uniq
  on task_assignees (sampling_task_id, profile_id) where sampling_task_id is not null;

alter table task_assignees enable row level security;

drop policy if exists "task_assignees_select" on task_assignees;
create policy "task_assignees_select"
  on task_assignees for select
  using (is_management() or profile_id = auth.uid());

drop policy if exists "task_assignees_write_management" on task_assignees;
create policy "task_assignees_write_management"
  on task_assignees for all
  using (is_management())
  with check (is_management());

-- Переносим уже назначенных ответственных, чтобы у старых заданий
-- список ответственных тоже был полным.
insert into task_assignees (core_description_task_id, profile_id)
select id, assigned_party_chief_id from core_description_tasks
where assigned_party_chief_id is not null
on conflict do nothing;

insert into task_assignees (sampling_task_id, profile_id)
select id, assigned_party_chief_id from sampling_tasks
where assigned_party_chief_id is not null
on conflict do nothing;

-- «Является ли текущий пользователь ответственным за это геологическое задание».
-- security definer: чтобы можно было вызывать из RLS других таблиц, не упираясь
-- в собственные политики task_assignees.
create or replace function is_task_assignee(p_core uuid, p_sawing uuid, p_sampling uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from task_assignees ta
    where ta.profile_id = auth.uid()
      and (
        (p_core is not null and ta.core_description_task_id = p_core)
        or (p_sawing is not null and ta.core_sawing_task_id = p_sawing)
        or (p_sampling is not null and ta.sampling_task_id = p_sampling)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Отметки в сводке
-- ---------------------------------------------------------------------------
alter table reports add column if not exists documentation_finished boolean not null default false;
alter table reports add column if not exists sampling_layout_done boolean not null default false;
comment on column reports.documentation_finished is 'Отметка «документация закончена» (геологическая/геотехническая).';
comment on column reports.sampling_layout_done is 'Отметка «разбивка на опробование выполнена».';

-- ---------------------------------------------------------------------------
-- 5. RLS: доступ ответственных-геологов
-- ---------------------------------------------------------------------------
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
    or is_task_assignee(core_description_tasks.id, null, null)
  );

drop policy if exists "core_sawing_tasks_select" on core_sawing_tasks;
create policy "core_sawing_tasks_select"
  on core_sawing_tasks for select
  using (
    is_management()
    or exists (
      select 1 from drilling_tasks dt
      where dt.id = core_sawing_tasks.drilling_task_id and dt.foreman_id = auth.uid()
    )
    or is_task_assignee(null, core_sawing_tasks.id, null)
  );

drop policy if exists "sampling_tasks_select" on sampling_tasks;
create policy "sampling_tasks_select"
  on sampling_tasks for select
  using (
    is_management()
    or assigned_party_chief_id = auth.uid()
    or is_task_assignee(null, null, sampling_tasks.id)
  );

-- Геолог видит САМУ скважину (номер, статус, плановая глубина), на которой
-- у него есть задание. Сводки бурения ему не открываем.
-- Проверка вынесена в функцию security definer: иначе политика drilling_tasks
-- ссылалась бы на core_description_tasks, а её политика — на drilling_tasks,
-- и Postgres упал бы с «infinite recursion detected in policy».
create or replace function is_geology_assignee_of_well(p_drilling_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from core_description_tasks c
      where c.drilling_task_id = p_drilling_task_id
        and (c.assigned_party_chief_id = auth.uid() or is_task_assignee(c.id, null, null))
    )
    or exists (
      select 1 from core_sawing_tasks s
      where s.drilling_task_id = p_drilling_task_id and is_task_assignee(null, s.id, null)
    )
    or exists (
      select 1 from sampling_tasks sm
      where sm.drilling_task_id = p_drilling_task_id
        and (sm.assigned_party_chief_id = auth.uid() or is_task_assignee(null, null, sm.id))
    );
$$;

drop policy if exists "drilling_tasks_select" on drilling_tasks;
create policy "drilling_tasks_select"
  on drilling_tasks for select
  using (
    is_management()
    or foreman_id = auth.uid()
    or is_geology_assignee_of_well(drilling_tasks.id)
  );

-- Подача сводок: к прежним условиям добавляем «ответственный из списка».
drop policy if exists "reports_insert_own" on reports;
create policy "reports_insert_own"
  on reports for insert
  with check (
    author_id = auth.uid()
    and (
      exists (
        select 1 from drilling_tasks dt
        where dt.id = reports.drilling_task_id and dt.foreman_id = auth.uid()
      )
      or exists (
        select 1 from core_description_tasks cdt
        left join drilling_tasks dt2 on dt2.id = cdt.drilling_task_id
        where cdt.id = reports.core_description_task_id
          and (dt2.foreman_id = auth.uid() or cdt.assigned_party_chief_id = auth.uid())
      )
      or exists (
        select 1 from core_sawing_tasks cst
        join drilling_tasks dt3 on dt3.id = cst.drilling_task_id
        where cst.id = reports.core_sawing_task_id and dt3.foreman_id = auth.uid()
      )
      or exists (
        select 1 from sampling_tasks st
        where st.id = reports.sampling_task_id and st.assigned_party_chief_id = auth.uid()
      )
      or is_task_assignee(reports.core_description_task_id, reports.core_sawing_task_id, reports.sampling_task_id)
    )
  );

-- Участок виден, если у человека есть любое назначение на нём.
drop policy if exists "sites_select" on sites;
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
    or exists (
      select 1 from core_description_tasks cdt2
      where cdt2.site_id = sites.id
        and (cdt2.assigned_party_chief_id = auth.uid() or is_task_assignee(cdt2.id, null, null))
    )
    or exists (
      select 1 from core_sawing_tasks cst
      join drilling_tasks dt3 on dt3.id = cst.drilling_task_id
      where cst.site_id = sites.id and dt3.foreman_id = auth.uid()
    )
    or exists (
      select 1 from core_sawing_tasks cst2
      where cst2.site_id = sites.id and is_task_assignee(null, cst2.id, null)
    )
    or exists (
      select 1 from sampling_tasks st
      where st.site_id = sites.id
        and (st.assigned_party_chief_id = auth.uid() or is_task_assignee(null, null, st.id))
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Итоговый прогресс бурения для геологов (без доступа к самим сводкам)
-- ---------------------------------------------------------------------------
create or replace function drilling_task_progress(p_drilling_task_id uuid)
returns table (approved numeric, submitted numeric, last_report_date date)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    is_management()
    or exists (
      select 1 from drilling_tasks dt
      where dt.id = p_drilling_task_id and dt.foreman_id = auth.uid()
    )
    or is_geology_assignee_of_well(p_drilling_task_id)
  ) then
    return;
  end if;

  return query
  select
    coalesce(sum(r.drilling_meters) filter (where r.approval_status = 'approved'), 0)::numeric,
    coalesce(sum(r.drilling_meters) filter (where r.approval_status = 'submitted'), 0)::numeric,
    max(r.report_date)
  from reports r
  where r.drilling_task_id = p_drilling_task_id;
end;
$$;
