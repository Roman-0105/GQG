-- ============================================================================
-- 0026: запланированные скважины (04.10.2026).
-- Скважину можно запланировать, ещё не зная организацию, станок, бригадира и
-- дату начала: у запланированного задания (status = 'planned') эти поля
-- могут быть пустыми. Когда бурение запускается, их нужно назначить —
-- проверяется на уровне БД: для любого статуса кроме 'planned' организация
-- бурения и бригадир обязательны. Права доступа не меняются: запланированные
-- скважины видит и правит только руководство (у них нет foreman_id, а мастер
-- видит только задания, где он бригадир).
-- Идемпотентна.
-- ============================================================================

alter table drilling_tasks alter column foreman_id drop not null;
alter table drilling_tasks alter column drilling_org_id drop not null;

alter table drilling_tasks drop constraint if exists drilling_tasks_assigned_when_started;
alter table drilling_tasks
  add constraint drilling_tasks_assigned_when_started
  check (
    status = 'planned'
    or (foreman_id is not null and drilling_org_id is not null)
  );

comment on constraint drilling_tasks_assigned_when_started on drilling_tasks is
  'Запланированной скважине бригадир и организация не нужны; для запущенной (любой статус кроме planned) — обязательны.';
