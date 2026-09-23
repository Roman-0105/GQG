-- ============================================================================
-- Этап 13: организационная структура компании (22.09.2026, по запросу
-- заказчика/владельца платформы) — дерево должностей с возможностью
-- назначать на каждую реального работника из справочника workers.
--
-- org_positions — самоссылающееся дерево (parent_id). "Мастер" встречается
-- в схеме несколько раз (разные ветки) — это НЕЗАВИСИМЫЕ узлы, не один
-- переиспользуемый справочник должностей: организационная схема рисует
-- конкретные штатные единицы, а не абстрактный список названий.
--
-- submits_reports — узлы, чей держатель реально заходит в систему и
-- отправляет сводки (на присланной заказчиком схеме такие "Мастер"
-- выделены оранжевой рамкой) — просто визуальная метка в этой таблице,
-- НЕ связана напрямую с profiles/role: сама учётная запись для входа
-- заводится как обычно, через "Пользователи".
--
-- assigned_worker_id — сознательно ссылается на workers (не на profiles):
-- по решению заказчика орг-схема заполняется тем же справочником "Работники",
-- которым уже пользуются при распределении по буровым бригадам, а не
-- отдельным списком.
-- ============================================================================

create table org_positions (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references org_positions(id) on delete cascade,
  title text not null,
  sort_order integer not null default 0,
  submits_reports boolean not null default false,
  assigned_worker_id uuid references workers(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table org_positions is
  'Оргструктура компании — дерево должностей. Реальный человек назначается через assigned_worker_id (справочник workers).';
comment on column org_positions.submits_reports is
  'Держатель этой должности реально работает в системе и отправляет сводки (визуальная метка в схеме, на права не влияет).';

alter table org_positions enable row level security;

-- Смотреть схему могут все авторизованные (как и другие справочники) —
-- редактировать (структуру И назначения) только management, что теперь
-- включает и разработчика (см. миграцию 0012).
create policy "org_positions_select_all"
  on org_positions for select
  using (auth.uid() is not null);

create policy "org_positions_write_management"
  on org_positions for all
  using (is_management())
  with check (is_management());

-- ----------------------------------------------------------------------------
-- Сид: схема, присланная заказчиком 22.09.2026 (свои позиции пока без
-- назначенных людей — заказчик распределит их сам через интерфейс).
-- ----------------------------------------------------------------------------
do $$
declare
  v_gendir uuid;
  v_techdir uuid;
  v_geotech_chief uuid;
  v_party_chief uuid;
  v_lead_geotech_eng uuid;
  v_geotech_eng uuid;
  v_lead_geologist uuid;
  v_geologist uuid;
  v_master_drilling uuid;
  v_machinist uuid;
begin
  insert into org_positions (title, sort_order) values ('Генеральный директор', 0) returning id into v_gendir;
  insert into org_positions (parent_id, title, sort_order) values (v_gendir, 'Технический директор', 0) returning id into v_techdir;

  insert into org_positions (parent_id, title, sort_order) values (v_techdir, 'Главный геотехник', 0) returning id into v_geotech_chief;
  insert into org_positions (parent_id, title, sort_order) values (v_techdir, 'Начальник буровой партии', 1) returning id into v_party_chief;

  insert into org_positions (parent_id, title, sort_order) values (v_geotech_chief, 'Ведущий инженер-геотехник', 0) returning id into v_lead_geotech_eng;
  insert into org_positions (parent_id, title, sort_order) values (v_geotech_chief, 'Инженер-геотехник', 1) returning id into v_geotech_eng;
  insert into org_positions (parent_id, title, sort_order) values (v_geotech_chief, 'Ведущий-геолог', 2) returning id into v_lead_geologist;
  insert into org_positions (parent_id, title, sort_order) values (v_geotech_chief, 'Геолог', 3) returning id into v_geologist;

  insert into org_positions (parent_id, title, sort_order, submits_reports) values (v_lead_geotech_eng, 'Мастер', 0, true);
  insert into org_positions (parent_id, title, sort_order, submits_reports) values (v_geotech_eng, 'Мастер', 0, true);
  insert into org_positions (parent_id, title, sort_order) values (v_lead_geologist, 'Техник-геолог', 0);
  insert into org_positions (parent_id, title, sort_order) values (v_geologist, 'Техник-геолог', 0);

  insert into org_positions (parent_id, title, sort_order, submits_reports) values (v_party_chief, 'Мастер', 0, true) returning id into v_master_drilling;
  insert into org_positions (parent_id, title, sort_order) values (v_master_drilling, 'Машинист буровой установки', 0) returning id into v_machinist;
  insert into org_positions (parent_id, title, sort_order) values (v_master_drilling, 'Водитель Урал-5557', 1);
  insert into org_positions (parent_id, title, sort_order) values (v_machinist, 'Помощник машиниста буровой установки', 0);
end $$;
