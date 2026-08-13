import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ChecklistItem,
  Customer,
  JobDetail,
  JobQuery,
  JobRow,
  Note,
  Paginated,
  User,
} from '../domain/api.model';
import { Stage } from '../domain/job.model';

/** Only non-default values reach the query string, so URLs stay readable and shareable. */
export function toHttpParams(query: JobQuery): HttpParams {
  let params = new HttpParams().set('page', query.page);

  if (query.ordering) params = params.set('ordering', query.ordering);
  if (query.search.trim()) params = params.set('search', query.search.trim());
  for (const stage of query.stage) params = params.append('stage', stage);
  for (const priority of query.priority) params = params.append('priority', priority);
  if (query.assigned_tech !== null) {
    params = params.set('assigned_tech', query.assigned_tech);
  }
  if (query.on_hold !== null) params = params.set('on_hold', query.on_hold);
  if (query.overdue !== null) params = params.set('overdue', query.overdue);
  if (query.has_rework !== null) params = params.set('has_rework', query.has_rework);

  return params;
}

@Injectable({ providedIn: 'root' })
export class JobsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api`;

  list(query: JobQuery): Observable<Paginated<JobRow>> {
    return this.http.get<Paginated<JobRow>>(`${this.base}/jobs/`, {
      params: toHttpParams(query),
    });
  }

  /** Count-only probe: page size still applies, but we only read `count`. */
  count(query: Partial<JobQuery> & { page: number }): Observable<Paginated<JobRow>> {
    return this.http.get<Paginated<JobRow>>(`${this.base}/jobs/`, {
      params: toHttpParams({ ...EMPTY_QUERY, ...query }),
    });
  }

  get(id: number): Observable<JobDetail> {
    return this.http.get<JobDetail>(`${this.base}/jobs/${id}/`);
  }

  create(payload: Record<string, unknown>): Observable<JobDetail> {
    return this.http.post<JobDetail>(`${this.base}/jobs/`, payload);
  }

  update(id: number, payload: Record<string, unknown>): Observable<JobDetail> {
    return this.http.patch<JobDetail>(`${this.base}/jobs/${id}/`, payload);
  }

  transition(id: number, toStage: Stage, reason = ''): Observable<JobDetail> {
    return this.http.post<JobDetail>(`${this.base}/jobs/${id}/transition/`, {
      to_stage: toStage,
      reason,
    });
  }

  setHold(id: number, onHold: boolean, reason = ''): Observable<JobDetail> {
    return this.http.post<JobDetail>(`${this.base}/jobs/${id}/hold/`, {
      on_hold: onHold,
      reason,
    });
  }

  addNote(id: number, body: string): Observable<Note> {
    return this.http.post<Note>(`${this.base}/jobs/${id}/notes/`, { body });
  }

  toggleChecklistItem(itemId: number): Observable<ChecklistItem> {
    return this.http.post<ChecklistItem>(
      `${this.base}/checklist-items/${itemId}/toggle/`,
      {},
    );
  }

  customers(search = ''): Observable<Paginated<Customer>> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get<Paginated<Customer>>(`${this.base}/customers/`, { params });
  }

  users(role?: string): Observable<User[]> {
    let params = new HttpParams();
    if (role) params = params.set('role', role);
    return this.http.get<User[]>(`${environment.apiBaseUrl}/api/auth/users/`, { params });
  }
}

const EMPTY_QUERY: JobQuery = {
  page: 1,
  ordering: '',
  search: '',
  stage: [],
  priority: [],
  assigned_tech: null,
  on_hold: null,
  overdue: null,
  has_rework: null,
};
