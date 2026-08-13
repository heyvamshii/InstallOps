/** Wire types for the REST API. Mirrors the DRF serializers in each backend app. */

import { Role, Stage } from './job.model';

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
  phone: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

/** Lean row shape for the table — see JobListSerializer. */
export interface JobRow {
  id: number;
  job_number: string;
  customer_name: string;
  stage: Stage;
  stage_index: number;
  on_hold: boolean;
  priority: Priority;
  site_city: string;
  site_state: string;
  system_size_kw: string | null;
  panel_count: number | null;
  assigned_tech: number | null;
  assigned_tech_name: string;
  target_completion_date: string | null;
  is_overdue: boolean;
  rework_count: number;
  updated_at: string;
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string;
  billing_address: string;
}

export interface StageTransitionRow {
  id: number;
  from_stage: Stage;
  to_stage: Stage;
  actor: number | null;
  actor_name: string;
  reason: string;
  was_forced: boolean;
  created_at: string;
}

export interface ChecklistItem {
  id: number;
  stage: Stage;
  label: string;
  order: number;
  is_done: boolean;
  completed_by: number | null;
  completed_at: string | null;
}

export interface Note {
  id: number;
  body: string;
  author: number | null;
  author_name: string;
  created_at: string;
}

export interface JobDocument {
  id: number;
  kind: string;
  stage: Stage;
  file: string | null;
  original_name: string;
  uploaded_by: number | null;
  created_at: string;
}

export interface JobDetail {
  id: number;
  job_number: string;
  customer: Customer;
  stage: Stage;
  on_hold: boolean;
  hold_reason: string;
  priority: Priority;
  site_address: string;
  site_city: string;
  site_state: string;
  site_postal_code: string;
  system_size_kw: string | null;
  panel_count: number | null;
  battery_count: number;
  roof_type: string;
  utility_company: string;
  ahj: string;
  permit_number: string;
  assigned_designer: number | null;
  assigned_tech: number | null;
  created_by: number | null;
  target_completion_date: string | null;
  rework_count: number;
  is_overdue: boolean;
  /** Computed server-side for the calling user — the authority on which buttons render. */
  available_transitions: Stage[];
  transitions: StageTransitionRow[];
  checklist_items: ChecklistItem[];
  notes: Note[];
  documents: JobDocument[];
  created_at: string;
  updated_at: string;
}

/** Query parameters for the job list. Every one is persisted in the URL. */
export interface JobQuery {
  page: number;
  ordering: string;
  search: string;
  stage: Stage[];
  priority: Priority[];
  assigned_tech: number | null;
  on_hold: boolean | null;
  overdue: boolean | null;
  has_rework: boolean | null;
}

export const DEFAULT_JOB_QUERY: JobQuery = {
  page: 1,
  ordering: '-created_at',
  search: '',
  stage: [],
  priority: [],
  assigned_tech: null,
  on_hold: null,
  overdue: null,
  has_rework: null,
};
