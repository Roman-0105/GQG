-- ============================================================================
-- 0025: «роль в бригаде» у должности (03.10.2026, по замечанию мастера).
-- В составе бригады (буровик / помощник бурильщика) выпадающий список
-- показывал ВСЕХ работников бригады. Теперь у должности есть необязательная
-- роль в бригаде — буровик или помбур — и в списках предлагаются только
-- работники с соответствующей должностью. Задаётся руководством в
-- «Пользователи → Управление должностями».
-- Идемпотентна.
-- ============================================================================

alter table positions add column if not exists crew_role text;

alter table positions drop constraint if exists positions_crew_role_check;
alter table positions
  add constraint positions_crew_role_check
  check (crew_role is null or crew_role in ('driller', 'assistant_driller'));

comment on column positions.crew_role is
  'Роль должности в буровой бригаде: driller (буровик), assistant_driller (помощник бурильщика), null — не участвует в составе бригады.';

-- Стартовая разметка по названию (только для ещё не размеченных).
update positions set crew_role = 'assistant_driller'
where crew_role is null and (name ilike '%помощник%' or name ilike '%помбур%');

update positions set crew_role = 'driller'
where crew_role is null
  and (name ilike '%машинист%' or name ilike '%буровик%' or name ilike '%бурильщик%');
