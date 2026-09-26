import type { UserRole } from './roles'

// Справочник названий должностей (25.09.2026) — отдельно от profiles.role
// (роль = права доступа в системе, должность = название для оргструктуры/
// учёта, не влияет на права). Управляется из "Пользователи".
export interface Position {
  id: string
  name: string
}

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  // Должность и "кому подчиняется" (25.09.2026, см. CLAUDE.md — переход
  // оргструктуры на person-centric модель) — ровно один из
  // reports_to_profile_id/reports_to_worker_id заполнен или ни одного
  // (человек может быть на вершине иерархии).
  position_id: string | null
  reports_to_profile_id: string | null
  reports_to_worker_id: string | null
  // Ссылка на строку workers, если логин выдан существующему работнику из
  // реестра ("Выдать доступ", 25.09.2026, миграция 0018) — не переносит
  // историю, только связывает "это тот же человек" для отображения.
  person_id: string | null
  created_at: string
}

export type SiteStatus = 'active' | 'closed'

export interface Site {
  id: string
  name: string
  status: SiteStatus
  created_by: string
  created_at: string
}

export type TaskStatus = 'planned' | 'in_progress' | 'suspended' | 'completed'

export interface DrillingOrganization {
  id: string
  name: string
  is_own: boolean
}

// Станок навсегда закреплён за одной организацией (своей или подрядчика) —
// решение 19.09.2026, передавать между организациями не нужно.
export interface DrillingRig {
  id: string
  organization_id: string
  rig_number: string
  model: string | null
  drilling_type: string | null
}

// Справочник состава буровых бригад — БЕЗ входа в приложение (в отличие
// от profiles/party_chief), только для учёта и распределения по
// бригадирам (assigned_foreman_id ссылается на profiles с ролью
// party_chief). Решение 19.09.2026.
export interface Worker {
  id: string
  full_name: string
  organization_id: string
  // Бригада для распределения по ЗАДАНИЯМ (task_worker_assignments) — НЕ
  // то же самое, что "руководитель" в оргструктуре ниже: геолог может не
  // входить ни в одну буровую бригаду, но иметь начальника в оргструктуре.
  assigned_foreman_id: string | null
  // Должность и "кому подчиняется" (25.09.2026) — тот же смысл, что у
  // Profile выше; "position" (свободный текст) заменена на position_id
  // (справочник, см. Position) в миграции 0016.
  position_id: string | null
  reports_to_profile_id: string | null
  reports_to_worker_id: string | null
  // NULL = активен, дата = когда заархивирован (23.09.2026) — мягкое
  // скрытие из активных списков назначения, история (task_worker_
  // assignments) не теряется.
  archived_at: string | null
}

// Учётное распределение конкретных работников по ролям на задании
// (20.09.2026) — не влияет на согласование/права подачи сводок, только
// "кто по факту делал". Ровно один из 4 *_task_id заполнен (как в Report).
export type WorkerRole = 'driller' | 'assistant_driller' | 'responsible'

export interface TaskWorkerAssignment {
  id: string
  drilling_task_id: string | null
  core_description_task_id: string | null
  core_sawing_task_id: string | null
  sampling_task_id: string | null
  role: WorkerRole
  worker_id: string
  // Смена (25.09.2026, миграция 0019) — заполнена только для 'driller'/
  // 'assistant_driller' (буровик/помбур), для 'responsible' всегда null —
  // эта роль смены не различает.
  shift_number: 1 | 2 | null
  // Замена = закрыть старую строку (valid_to) + открыть новую, а не
  // перезаписать — иначе история "кто раньше работал" терялась бы.
  // valid_to = null означает "работает сейчас".
  valid_from: string
  valid_to: string | null
}

export interface CostCategory {
  id: string
  name: string
}

export interface CostItem {
  id: string
  category_id: string
  name: string
  unit: string | null
}

export interface DrillingTaskDiameter {
  id: string
  drilling_task_id: string
  depth_from: number
  depth_to: number
  diameter: number
}

export interface DrillingTask {
  id: string
  site_id: string
  well_number: string
  drilling_rig_id: string | null
  drilling_org_id: string
  coord_wgs84_lat: number | null
  coord_wgs84_lon: number | null
  coord_local_x: number | null
  coord_local_y: number | null
  wellhead_elevation: number | null
  foreman_id: string
  start_date: string | null
  projected_depth: number | null
  planned_daily_meters: number | null
  angle: number | null
  azimuth: number | null
  status: TaskStatus
  description: string | null
  created_by: string
  created_at: string
}

export type DocumentationType = 'geological' | 'geotechnical'

export interface CoreDescriptionTask {
  id: string
  site_id: string
  drilling_task_id: string | null
  external_well_number: string | null
  external_drilling_org_id: string | null
  external_coord_wgs84_lat: number | null
  external_coord_wgs84_lon: number | null
  external_coord_local_x: number | null
  external_coord_local_y: number | null
  external_wellhead_elevation: number | null
  external_projected_depth: number | null
  external_angle: number | null
  external_azimuth: number | null
  assigned_party_chief_id: string | null
  shift_enabled: boolean
  documentation_type: DocumentationType
  description: string | null
  created_by: string
  created_at: string
}

// Распиловка керна — только своя скважина, ответственный не назначается
// отдельно (foreman_id связанного drilling_task), см. миграцию 0007.
export interface CoreSawingTask {
  id: string
  site_id: string
  drilling_task_id: string
  description: string | null
  created_by: string
  created_at: string
}

// Опробование — своя или скважина подрядчика, ответственный назначается
// явно всегда (в отличие от CoreDescriptionTask).
export interface SamplingTask {
  id: string
  site_id: string
  drilling_task_id: string | null
  external_well_number: string | null
  external_drilling_org_id: string | null
  assigned_party_chief_id: string
  description: string | null
  created_by: string
  created_at: string
}

export type ApprovalStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface Report {
  id: string
  drilling_task_id: string | null
  core_description_task_id: string | null
  core_sawing_task_id: string | null
  sampling_task_id: string | null
  site_id: string
  author_id: string
  report_date: string
  shift_number: 1 | 2 | null
  hours_worked: number | null
  drilling_meters: number | null
  core_description_interval_from: number | null
  core_description_interval_to: number | null
  photofixation_interval_from: number | null
  photofixation_interval_to: number | null
  sawn_meters: number | null
  samples_taken: number | null
  samples_submitted: number | null
  approval_status: ApprovalStatus
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  edit_request_reason: string | null
  edit_unlocked: boolean
  review_comment: string | null
  shift_notes: string | null
  created_at: string
  updated_at: string
}

export interface ReportCost {
  id: string
  report_id: string
  cost_item_id: string
  quantity: number | null
  amount: number | null
}
