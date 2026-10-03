-- ============================================================================
-- 0022: «направление» должности (03.10.2026, по замечанию владельца).
-- В списках выбора ответственных (геологи, мастера бурения) показывались ВСЕ
-- пользователи с ролью «Ответственный». Теперь у каждой должности есть
-- направление — бурение / геология / прочее, и формы показывают только людей
-- нужного направления. Направление редактируется руководством в
-- «Пользователи → Управление должностями».
-- Идемпотентна.
-- ============================================================================

alter table positions add column if not exists work_area text not null default 'other';

alter table positions drop constraint if exists positions_work_area_check;
alter table positions
  add constraint positions_work_area_check check (work_area in ('drilling', 'geology', 'other'));

comment on column positions.work_area is
  'Направление должности: drilling (бурение), geology (геология), other. Используется для фильтрации списков выбора ответственных.';

-- Стартовая разметка по названию — только для ещё не размеченных должностей.
update positions set work_area = 'geology'
where work_area = 'other' and name ilike '%геолог%';

update positions set work_area = 'drilling'
where work_area = 'other'
  and (name ilike '%мастер%' or name ilike '%буров%' or name ilike '%машинист%'
       or name ilike '%помощник%' or name ilike '%бурильщик%');
