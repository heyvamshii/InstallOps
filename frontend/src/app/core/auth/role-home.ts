import { Role } from '../domain/job.model';

/**
 * Where each role lands after signing in.
 *
 * A Field Tech has no use for an org-wide dashboard — their job is the queue of work
 * assigned to them, so that is the first thing they see.
 */
export const ROLE_HOME: Readonly<Record<Role, string>> = {
  COORDINATOR: '/dashboard',
  ADMIN: '/dashboard',
  DESIGNER: '/jobs',
  FIELD_TECH: '/jobs',
};

export function homeFor(role: Role | null): string {
  return role ? ROLE_HOME[role] : '/login';
}
