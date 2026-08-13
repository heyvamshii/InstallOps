/**
 * Client-side mirror of the locked domain model.
 *
 * Source of truth: `docs/domain-model.md`, enforced by
 * `backend/apps/jobs/constants.py` and `backend/apps/accounts/constants.py`.
 *
 * This copy exists so the UI can render the right controls without a round trip.
 * It is NOT a security boundary — the server rejects anything illegal regardless of
 * what this file says.
 */

export const STAGES = [
  'INTAKE',
  'DESIGN',
  'PERMITTING',
  'INSTALLATION',
  'QA',
  'COMPLETE',
] as const;

export type Stage = (typeof STAGES)[number];

export const ROLES = ['COORDINATOR', 'DESIGNER', 'FIELD_TECH', 'ADMIN'] as const;

export type Role = (typeof ROLES)[number];

export const STAGE_LABEL: Readonly<Record<Stage, string>> = {
  INTAKE: 'Intake',
  DESIGN: 'Design',
  PERMITTING: 'Permitting',
  INSTALLATION: 'Installation',
  QA: 'QA',
  COMPLETE: 'Complete',
};

export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  COORDINATOR: 'Coordinator',
  DESIGNER: 'Designer',
  FIELD_TECH: 'Field Tech',
  ADMIN: 'Admin',
};

/** The only legal edges. COMPLETE is terminal. QA -> INSTALLATION is the rework edge. */
export const ALLOWED_TRANSITIONS: Readonly<Record<Stage, readonly Stage[]>> = {
  INTAKE: ['DESIGN'],
  DESIGN: ['PERMITTING'],
  PERMITTING: ['INSTALLATION'],
  INSTALLATION: ['QA'],
  QA: ['COMPLETE', 'INSTALLATION'],
  COMPLETE: [],
};

/** Role that owns the work while a job sits in each stage. */
export const STAGE_OWNER: Readonly<Record<Stage, Role>> = {
  INTAKE: 'COORDINATOR',
  DESIGN: 'DESIGNER',
  PERMITTING: 'COORDINATOR',
  INSTALLATION: 'FIELD_TECH',
  QA: 'COORDINATOR',
  COMPLETE: 'COORDINATOR',
};

/** Backward edges must carry a reason. */
export function requiresReason(from: Stage, to: Stage): boolean {
  return from === 'QA' && to === 'INSTALLATION';
}

export function isLegalTransition(from: Stage, to: Stage): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Transitions this user may actually perform right now. Admin bypasses ownership. */
export function availableTransitions(
  from: Stage,
  role: Role,
  onHold: boolean,
): readonly Stage[] {
  if (onHold) return [];
  if (role !== 'ADMIN' && STAGE_OWNER[from] !== role) return [];
  return ALLOWED_TRANSITIONS[from];
}

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}
