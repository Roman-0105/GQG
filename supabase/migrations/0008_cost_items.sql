-- ============================================================================
-- Этап 8: двухуровневые статьи затрат (19.09.2026, по запросу заказчика).
-- Раньше cost_categories была плоским списком ("ГСМ", "Коронки",
-- "Материалы (прочее)"), и единица измерения была на самой категории.
-- Теперь категория — верхний уровень (просто название, без единицы), а
-- единица измерения и конкретная позиция ("вид затрат") — на новой
-- дочерней таблице cost_items. В сводке затраты теперь выбираются в два
-- шага: категория -> вид затрат внутри неё.
--
-- Существующие категории переносятся 1:1 в виды затрат (каждая старая
-- категория становится и категорией, и одним видом затрат внутри себя же,
-- с тем же названием/единицей) — старые данные report_costs не теряются.
-- Дальше владелец обычным образом заводит новые виды через экран
-- "Статьи затрат" (UsersList-подобный, доступен только management).
-- ============================================================================

create table cost_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references cost_categories(id) on delete cascade,
  name text not null,
  unit text,
  created_at timestamptz not null default now(),
  unique (category_id, name)
);

insert into cost_items (category_id, name, unit)
select id, name, unit from cost_categories;

alter table report_costs add column cost_item_id uuid references cost_items(id);

update report_costs rc
set cost_item_id = ci.id
from cost_items ci
where ci.category_id = rc.cost_category_id
  and ci.name = (select cc.name from cost_categories cc where cc.id = rc.cost_category_id);

alter table report_costs alter column cost_item_id set not null;
alter table report_costs drop column cost_category_id;

alter table cost_categories drop column unit;

alter table cost_items enable row level security;

create policy "cost_items_select_all"
  on cost_items for select
  using (auth.uid() is not null);

create policy "cost_items_write_management"
  on cost_items for all
  using (is_management())
  with check (is_management());
