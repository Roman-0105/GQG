-- ============================================================================
-- Этап 2: Схема БД — пользователи/роли, участки, задания, сводки, справочники
-- См. ТЗ (актуальная версия v0.7) для контекста бизнес-логики.
--
-- Как применить: Supabase Dashboard -> SQL Editor -> вставить содержимое
-- файла целиком -> Run. Либо через Supabase CLI (supabase db push), если
-- он у вас настроен локально.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Роли и профили пользователей
-- ----------------------------------------------------------------------------
-- auth.users управляется самим Supabase Auth (email/пароль и т.д.).
-- profiles — наша таблица с ролью и ФИО, 1:1 с auth.users.

create type user_role as enum (
  'general_director',
  'technical_director',
  'party_chief'
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null,
  created_at timestamptz not null default now()
);

comment on table profiles is 'Роль и ФИО пользователя. Гендир и техдир имеют идентичные права (см. ТЗ раздел 2).';

-- Вспомогательная функция: роль текущего пользователя. STABLE + SECURITY
-- DEFINER, чтобы её можно было использовать внутри RLS-политик без
-- рекурсивных обращений к самой таблице profiles через RLS.
create or replace function auth_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

-- Гендир и техдир имеют идентичные права везде ниже — удобно проверять
-- одной функцией, а не дублировать условие в каждой политике.
create or replace function is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_role() in ('general_director', 'technical_director');
$$;

-- ----------------------------------------------------------------------------
-- 2. Справочники
-- ----------------------------------------------------------------------------

create table drilling_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_own boolean not null default false, -- "своя" организация или подрядчик
  created_at timestamptz not null default now()
);

create table cost_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, -- материалы, ГСМ, коронки, ... — список расширяемый
  unit text, -- л / шт / т и т.п. (см. ТЗ: затраты считаем и в количестве, и в сумме)
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Участки работ
-- ----------------------------------------------------------------------------

create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. Задания "Бурение скважины"
-- ----------------------------------------------------------------------------

create type task_status as enum (
  'planned',
  'in_progress',
  'suspended',
  'completed'
);

create table drilling_tasks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  well_number text not null,
  rig_number text,
  drilling_org_id uuid not null references drilling_organizations(id),
  coord_wgs84_lat numeric,
  coord_wgs84_lon numeric,
  coord_local_x numeric,
  coord_local_y numeric,
  wellhead_elevation numeric,           -- абсолютная отметка устья
  foreman_id uuid not null references profiles(id), -- бригадир — выбирается вручную (см. ТЗ)
  start_date date,
  projected_depth numeric,
  angle numeric,                        -- угол бурения
  azimuth numeric,                      -- азимут бурения
  status task_status not null default 'planned',
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- Диаметры бурения по интервалам (могут быть разными на разных интервалах — см. ТЗ)
create table drilling_task_diameters (
  id uuid primary key default gen_random_uuid(),
  drilling_task_id uuid not null references drilling_tasks(id) on delete cascade,
  depth_from numeric not null,
  depth_to numeric not null,
  diameter numeric not null,
  check (depth_to > depth_from)
);

-- ----------------------------------------------------------------------------
-- 5. Задания "Описание керна"
-- ----------------------------------------------------------------------------
-- Может ссылаться на собственную скважину (drilling_task_id) ИЛИ описывать
-- скважину подрядчика вручную (external_* поля). Ровно один из двух
-- вариантов должен быть заполнен — проверяется CHECK-constraint'ом ниже.
-- Права редактирования "внешней" скважины — см. RLS ниже (только гендир/техдир).

create table core_description_tasks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,

  drilling_task_id uuid references drilling_tasks(id) on delete cascade,

  -- Поля "чужой" скважины подрядчика (без персонала — см. ТЗ раздел 8/v0.6)
  external_well_number text,
  external_drilling_org_id uuid references drilling_organizations(id),
  external_coord_wgs84_lat numeric,
  external_coord_wgs84_lon numeric,
  external_coord_local_x numeric,
  external_coord_local_y numeric,
  external_wellhead_elevation numeric,
  external_projected_depth numeric,
  external_angle numeric,
  external_azimuth numeric,

  shift_enabled boolean not null default true, -- "работа по сменам" — настраиваемый признак (см. ТЗ v0.7)

  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),

  constraint one_well_source check (
    (drilling_task_id is not null and external_well_number is null)
    or
    (drilling_task_id is null and external_well_number is not null)
  )
);

-- Диаметры для скважины подрядчика по интервалам (аналог drilling_task_diameters)
create table core_description_external_diameters (
  id uuid primary key default gen_random_uuid(),
  core_description_task_id uuid not null references core_description_tasks(id) on delete cascade,
  depth_from numeric not null,
  depth_to numeric not null,
  diameter numeric not null,
  check (depth_to > depth_from)
);

-- ----------------------------------------------------------------------------
-- 6. Сводки (посменные; суточные — авторассчитанная агрегация, отдельно
--    не хранятся, см. ТЗ v0.7 раздел 3-4)
-- ----------------------------------------------------------------------------

create type approval_status as enum (
  'draft',
  'submitted',
  'approved',
  'rejected'
);

create table reports (
  id uuid primary key default gen_random_uuid(),

  drilling_task_id uuid references drilling_tasks(id) on delete cascade,
  core_description_task_id uuid references core_description_tasks(id) on delete cascade,

  site_id uuid not null references sites(id),
  author_id uuid not null references profiles(id),

  report_date date not null,
  shift_number smallint check (shift_number in (1, 2)), -- null, если задание работает без смен

  hours_worked numeric,
  drilling_meters numeric,
  core_description_interval_from numeric,
  core_description_interval_to numeric,
  photofixation_interval_from numeric,
  photofixation_interval_to numeric,

  approval_status approval_status not null default 'draft',
  submitted_at timestamptz,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  edit_request_reason text,     -- причина запроса на правку (пока не одобрено)
  edit_unlocked boolean not null default false, -- true после одобрения гендиром — разрешает автору редактировать снова

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint one_task_source check (
    (drilling_task_id is not null and core_description_task_id is null)
    or
    (drilling_task_id is null and core_description_task_id is not null)
  )
);

-- Затраты в сводке: категория + количество + сумма, несколько строк на сводку
create table report_costs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  cost_category_id uuid not null references cost_categories(id),
  quantity numeric,  -- количество (л/шт/т — см. unit у категории)
  amount numeric      -- сумма, ₽
);

-- updated_at автообновление
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger reports_set_updated_at
  before update on reports
  for each row execute function set_updated_at();
