-- ============================================================================
-- Этап 19 (25.09.2026, по запросу мастера участка через владельца
-- платформы): состав бригады (task_worker_assignments, миграция 0010)
-- умел только "кто СЕЙЧАС в этой роли на этом задании" — без смен и без
-- истории замен. Два реальных сценария не были покрыты:
--  1. На буровой станке две смены с разными людьми в одной и той же роли
--     (буровик смены 1 ≠ буровик смены 2) — сейчас все буровики/помбуры
--     заведения смешивались в один список без различия смены.
--  2. Работника периодически заменяют (временно на подмену или навсегда) —
--     сейчас замена = удалить старую строку и вставить новую, история
--     "кто раньше работал на этом месте" терялась безвозвратно.
--
-- Решение:
--  - shift_number (1|2, nullable) — смена, к которой относится назначение.
--    Заполняется ТОЛЬКО для ролей 'driller'/'assistant_driller' (буровик/
--    помбур) — это единственные роли, где смены реально различаются;
--    'responsible' (керн/распиловка/опробование) остаётся без смены,
--    поведение для него не меняется вообще.
--  - valid_from/valid_to — замена теперь не перезаписывает строку, а
--    "закрывает" старую (valid_to = сегодня) и открывает новую
--    (valid_from = сегодня, valid_to = null). Работает одинаково для
--    временной и постоянной замены — разница только в том, откроется ли
--    потом снова строка на прежнего работника. valid_to = null означает
--    "работает сейчас" — именно так теперь определяется "текущий состав".
-- ============================================================================

alter table task_worker_assignments add column shift_number smallint check (shift_number in (1, 2));
alter table task_worker_assignments add column valid_from date not null default current_date;
alter table task_worker_assignments add column valid_to date;

alter table task_worker_assignments add constraint task_worker_assignments_valid_range check (
  valid_to is null or valid_to >= valid_from
);

-- Старые 4 индекса разрешали ровно одну АКТИВНУЮ строку на (задание, роль,
-- работник) навсегда — теперь тот же работник может законно повторно
-- появиться в истории (закрыли, потом снова назначили), а смена входит в
-- ключ уникальности, чтобы один и тот же буровик мог одновременно числиться
-- в смене 1 одного участка и смене 2 другого станка той же скважины.
-- coalesce(shift_number, 0) — 'responsible' не использует смену вообще,
-- нулём заменяем null, иначе NULL <> NULL сделал бы индекс бесполезным для
-- этой роли (как и раньше объяснялось про num_nonnulls).
drop index task_worker_assignments_drilling_uniq;
drop index task_worker_assignments_core_description_uniq;
drop index task_worker_assignments_core_sawing_uniq;
drop index task_worker_assignments_sampling_uniq;

create unique index task_worker_assignments_drilling_active_uniq
  on task_worker_assignments (drilling_task_id, role, coalesce(shift_number, 0), worker_id)
  where drilling_task_id is not null and valid_to is null;
create unique index task_worker_assignments_core_description_active_uniq
  on task_worker_assignments (core_description_task_id, role, coalesce(shift_number, 0), worker_id)
  where core_description_task_id is not null and valid_to is null;
create unique index task_worker_assignments_core_sawing_active_uniq
  on task_worker_assignments (core_sawing_task_id, role, coalesce(shift_number, 0), worker_id)
  where core_sawing_task_id is not null and valid_to is null;
create unique index task_worker_assignments_sampling_active_uniq
  on task_worker_assignments (sampling_task_id, role, coalesce(shift_number, 0), worker_id)
  where sampling_task_id is not null and valid_to is null;

-- RLS не меняется: task_worker_assignments_own_foreman/_write_management —
-- оба "for all", уже покрывают UPDATE (закрытие valid_to) теми же
-- условиями, что INSERT/DELETE раньше.
