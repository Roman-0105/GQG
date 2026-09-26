-- ============================================================================
-- Этап 16 (25.09.2026, по запросу владельца платформы): оргструктура строится
-- от людей, а не от абстрактных "слотов" должностей.
--
-- Зафиксированные решения (4 уточняющих вопроса в диалоге):
--  1. "Должность" — отдельно от "роли". Роль остаётся тем же 4-значным
--     enum'ом прав доступа (не трогаем). Должность — новый общий
--     справочник названий, переиспользуемый и на profiles, и на workers.
--  2. "Пользователи" и "Работники" остаются двумя отдельными экранами —
--     решение финальное, не пересматривается.
--  3. Понятие "вакантная должность" (узел org_positions без назначенного
--     человека) упраздняется: у КАЖДОГО человека (profiles ИЛИ workers)
--     теперь своё поле "должность" и своё поле "кому подчиняется".
--  4. Правка иерархии остаётся формой (select "Руководитель"), а не
--     drag-and-drop — сознательно отложено.
--
-- Прямое следствие пункта 3 (озвучено владельцу явно, не сюрприз): узлы
-- без назначенного человека (на момент сида миграции 0013 таких было
-- порядка 11 из 16 — "Ведущий инженер-геотехник", "Техник-геолог" и т.п.)
-- пропадут из схемы сразу после этой миграции, пока на них не заведут
-- реального работника/пользователя с той же должностью.
--
-- org_positions НЕ дропается в этом файле — данные из неё переносятся
-- сюда, сама таблица убирается отдельным следующим файлом
-- (0017_drop_org_positions.sql) после того, как результат перенесён и
-- проверен вживую.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Справочник должностей — отдельно от profiles.role. Тот же RLS-паттерн,
--    что у остальных простых справочников (cost_categories/
--    drilling_organizations): смотреть могут все авторизованные, писать
--    (добавлять/переименовывать/удалять) — только management.
-- ----------------------------------------------------------------------------
create table positions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

comment on table positions is
  'Справочник названий должностей — отдельно от profiles.role (роль = права доступа, должность = название в оргструктуре/учёте).';

alter table positions enable row level security;

create policy "positions_select_all"
  on positions for select
  using (auth.uid() is not null);

create policy "positions_write_management"
  on positions for all
  using (is_management())
  with check (is_management());

-- Сидируем справочник из уже существующих названий (дерево org_positions +
-- свободный текст workers.position), чтобы ничего не потерять.
insert into positions (name)
select distinct trim(title) from org_positions where trim(title) <> ''
on conflict (name) do nothing;

insert into positions (name)
select distinct trim(position) from workers
where position is not null and trim(position) <> ''
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- 2. profiles: должность + "кому подчиняется" (ровно один из двух
--    возможных типов цели — тот же приём, что num_nonnuls у org_positions
--    в миграции 0015). on delete set null — как assigned_worker_id/
--    assigned_profile_id: если руководителя удалят, цепочка просто
--    обрывается, не блокирует удаление (сознательно иначе, чем у
--    author_id/foreman_id/created_by/approved_by).
-- ----------------------------------------------------------------------------
alter table profiles add column position_id uuid references positions(id) on delete set null;
alter table profiles add column reports_to_profile_id uuid references profiles(id) on delete set null;
alter table profiles add column reports_to_worker_id uuid references workers(id) on delete set null;

alter table profiles add constraint profiles_one_report_target check (
  num_nonnulls(reports_to_profile_id, reports_to_worker_id) <= 1
);
alter table profiles add constraint profiles_no_self_report check (
  reports_to_profile_id is null or reports_to_profile_id <> id
);

-- ----------------------------------------------------------------------------
-- 3. workers: те же поля + перенос свободного текста position. НЕ трогаем
--    и НЕ переиспользуем assigned_foreman_id — это отдельное операционное
--    отношение (бригада для распределения по ЗАДАНИЯМ,
--    task_worker_assignments), у него уже своя семантика и RLS
--    (task_worker_assignments_own_foreman): геолог, например, может не
--    входить ни в одну буровую бригаду (assigned_foreman_id = null), но
--    иметь начальника в оргструктуре компании.
-- ----------------------------------------------------------------------------
alter table workers add column position_id uuid references positions(id) on delete set null;
alter table workers add column reports_to_profile_id uuid references profiles(id) on delete set null;
alter table workers add column reports_to_worker_id uuid references workers(id) on delete set null;

alter table workers add constraint workers_one_report_target check (
  num_nonnulls(reports_to_profile_id, reports_to_worker_id) <= 1
);
alter table workers add constraint workers_no_self_report check (
  reports_to_worker_id is null or reports_to_worker_id <> id
);

update workers w
set position_id = p.id
from positions p
where w.position is not null and trim(w.position) = p.name;

alter table workers drop column position;

-- ----------------------------------------------------------------------------
-- 4. Перенос данных из org_positions в людей — только для узлов, у которых
--    БЫЛ назначен реальный человек. "Кому подчиняется" — не прямой
--    parent_id (у большинства сидовых узлов родитель — вакантный слот), а
--    БЛИЖАЙШИЙ ПРЕДОК ПО ДЕРЕВУ, у которого ТОЖЕ был назначен человек
--    (пропускаем вакантные промежуточные узлы).
--
--    Раньше здесь был `create temporary table` с общим результатом для
--    4a/4b — сломалось в Supabase SQL Editor: соединение идёт через пулер
--    (Supavisor), соседние операторы могут выполниться на РАЗНЫХ
--    физических сессиях, а temp-таблица живёт только в своей сессии —
--    следующий оператор её не видел ("relation ... does not exist").
--    Чинится тем, что каждый UPDATE — полностью самодостаточный оператор
--    с СОБСТВЕННЫМ `with recursive`, без промежуточной temp-таблицы
--    (рекурсия просто продублирована дважды).
-- ----------------------------------------------------------------------------

-- 4a. Должность + руководитель для узлов, назначенных на PROFILE.
with recursive walk as (
  select
    op.id as origin_id,
    op.parent_id as candidate_id,
    1 as depth
  from org_positions op
  where (op.assigned_worker_id is not null or op.assigned_profile_id is not null)
    and op.parent_id is not null

  union all

  select
    w.origin_id,
    cand.parent_id,
    w.depth + 1
  from walk w
  join org_positions cand on cand.id = w.candidate_id
  where cand.assigned_worker_id is null
    and cand.assigned_profile_id is null
    and cand.parent_id is not null
),
candidate_rows as (
  select w.origin_id, w.depth, cand.assigned_worker_id, cand.assigned_profile_id
  from walk w
  join org_positions cand on cand.id = w.candidate_id
),
ancestors as (
  select distinct on (origin_id)
    origin_id,
    assigned_worker_id as ancestor_worker_id,
    assigned_profile_id as ancestor_profile_id
  from candidate_rows
  where assigned_worker_id is not null or assigned_profile_id is not null
  order by origin_id, depth asc
)
update profiles pr
set
  position_id = pos.id,
  reports_to_profile_id = anc.ancestor_profile_id,
  reports_to_worker_id = anc.ancestor_worker_id
from org_positions op
join positions pos on pos.name = trim(op.title)
left join ancestors anc on anc.origin_id = op.id
where op.assigned_profile_id = pr.id;

-- 4b. Должность + руководитель для узлов, назначенных на WORKER (та же
--     рекурсия, продублирована — CTE не переживает границу оператора).
with recursive walk as (
  select
    op.id as origin_id,
    op.parent_id as candidate_id,
    1 as depth
  from org_positions op
  where (op.assigned_worker_id is not null or op.assigned_profile_id is not null)
    and op.parent_id is not null

  union all

  select
    w.origin_id,
    cand.parent_id,
    w.depth + 1
  from walk w
  join org_positions cand on cand.id = w.candidate_id
  where cand.assigned_worker_id is null
    and cand.assigned_profile_id is null
    and cand.parent_id is not null
),
candidate_rows as (
  select w.origin_id, w.depth, cand.assigned_worker_id, cand.assigned_profile_id
  from walk w
  join org_positions cand on cand.id = w.candidate_id
),
ancestors as (
  select distinct on (origin_id)
    origin_id,
    assigned_worker_id as ancestor_worker_id,
    assigned_profile_id as ancestor_profile_id
  from candidate_rows
  where assigned_worker_id is not null or assigned_profile_id is not null
  order by origin_id, depth asc
)
update workers w
set
  position_id = pos.id,
  reports_to_profile_id = anc.ancestor_profile_id,
  reports_to_worker_id = anc.ancestor_worker_id
from org_positions op
join positions pos on pos.name = trim(op.title)
left join ancestors anc on anc.origin_id = op.id
where op.assigned_worker_id = w.id;

-- ----------------------------------------------------------------------------
-- 5. org_positions свою роль отыграла для чтения кодом (после этой миграции
--    приложение её больше не запрашивает) — но саму таблицу пока не трогаем,
--    см. шапку файла. submits_reports НЕ переносим никуда — это теперь
--    ВЫЧИСЛЯЕМЫЙ на фронте признак (person.type === 'profile' && person.role
--    === 'party_chief'): в этой системе сводки реально подают только
--    начальники буровой партии, ни гендир/техдир, ни тем более "работники"
--    (нет логина) сводок не подают.
-- ----------------------------------------------------------------------------
