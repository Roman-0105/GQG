-- ============================================================================
-- 0023: закрытие скважины с причиной (03.10.2026, по запросу владельца).
-- «Закрыть скважину» (гендир/техдир/разработчик): причина — достигнута
-- проектная глубина / авария / другое (с пояснением). Скважина получает
-- status = 'completed' (как и раньше при завершении), а причина, пояснение и
-- дата закрытия хранятся в этих полях. По ним на графике рисуется линия
-- закрытия (зелёная сплошная при глубине, красная пунктирная иначе), а в
-- списке скважин — бейдж «Закрыта» соответствующего цвета.
-- Права: update на drilling_tasks уже разрешён management (политика 0002).
-- Идемпотентна.
-- ============================================================================

alter table drilling_tasks add column if not exists closed_reason text;
alter table drilling_tasks add column if not exists closed_note text;
alter table drilling_tasks add column if not exists closed_at date;

alter table drilling_tasks drop constraint if exists drilling_tasks_closed_reason_check;
alter table drilling_tasks
  add constraint drilling_tasks_closed_reason_check
  check (closed_reason is null or closed_reason in ('depth_reached', 'accident', 'other'));

comment on column drilling_tasks.closed_reason is
  'Причина закрытия скважины: depth_reached (достигнута проектная глубина), accident (авария), other (другое, см. closed_note). null — не закрыта с причиной.';
comment on column drilling_tasks.closed_note is 'Пояснение к причине закрытия (обязательно для other).';
comment on column drilling_tasks.closed_at is 'Дата закрытия скважины.';
