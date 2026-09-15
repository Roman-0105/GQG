import type { UserRole } from './roles'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
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

export interface CostCategory {
  id: string
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
  rig_number: string | null
  drilling_org_id: string
  coord_wgs84_lat: number | null
  coord_wgs84_lon: number | null
  coord_local_x: number | null
  coord_local_y: number | null
  wellhead_elevation: number | null
  foreman_id: string
  start_date: string | null
  projected_depth: number | null
  angle: number | null
  azimuth: number | null
  status: TaskStatus
  created_by: string
  created_at: string
}

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
  created_by: string
  created_at: string
}

export type ApprovalStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface Report {
  id: string
  drilling_task_id: string | null
  core_description_task_id: string | null
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
  approval_status: ApprovalStatus
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  edit_request_reason: string | null
  edit_unlocked: boolean
  review_comment: string | null
  created_at: string
  updated_at: string
}

export interface ReportCost {
  id: string
  report_id: string
  cost_category_id: string
  quantity: number | null
  amount: number | null
}
