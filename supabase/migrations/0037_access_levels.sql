-- ============================================================================
-- 0037. Уровни доступа сотрудников (09.10.2026, этап 1). Применено вручную.
--   1 Начальство (гендир, техдир)                 — полный доступ
--   2 Старший ИТР (главный геотехник, нач. партии) — полный доступ
--   3 Средний ИТР                                  — распределяют людей, без правки БД
--   4 Младший ИТР (мастер, техник-геолог)          — сводки своего профиля
--   5 Рабочие                                      — без входа в платформу
-- Уровень задаёт ДОЛЖНОСТЬ; должность без уровня = 5.
-- ============================================================================

alter table positions add column if not exists level smallint not null default 5;
alter table positions drop constraint if exists positions_level_check;
alter table positions add constraint positions_level_check check (level between 1 and 5);

update positions set level = case
  when lower(name) in ('генеральный директор', 'технический директор') then 1
  when lower(name) in ('главный геотехник', 'начальник буровой партии') then 2
  when lower(name) like 'ведущий%геолог%'
    or lower(name) like 'ведущий инженер%'
    or lower(name) in ('инженер-геотехник', 'геолог') then 3
  when lower(name) in ('мастер', 'техник-геолог') then 4
  else 5
end;

create or replace function is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_role() in ('general_director', 'technical_director', 'developer', 'senior_itr');
$$;

update profiles p set role = 'senior_itr'
from positions pos
where p.position_id = pos.id and pos.level = 2 and p.role = 'party_chief';
