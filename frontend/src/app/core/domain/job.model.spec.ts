import {
  ALLOWED_TRANSITIONS,
  ROLES,
  STAGES,
  Stage,
  availableTransitions,
  isLegalTransition,
  requiresReason,
  stageIndex,
} from './job.model';

/**
 * These mirror `backend/apps/jobs/tests/test_transitions.py`. If the two ever disagree,
 * the UI is offering a control the server will reject — which is exactly the bug this
 * duplicated enum could introduce.
 */

describe('the transition graph', () => {
  it('moves forward one stage at a time', () => {
    expect(isLegalTransition('INTAKE', 'DESIGN')).toBe(true);
    expect(isLegalTransition('DESIGN', 'PERMITTING')).toBe(true);
    expect(isLegalTransition('PERMITTING', 'INSTALLATION')).toBe(true);
    expect(isLegalTransition('INSTALLATION', 'QA')).toBe(true);
    expect(isLegalTransition('QA', 'COMPLETE')).toBe(true);
  });

  it('refuses to skip stages', () => {
    expect(isLegalTransition('INTAKE', 'PERMITTING')).toBe(false);
    expect(isLegalTransition('INTAKE', 'COMPLETE')).toBe(false);
    expect(isLegalTransition('DESIGN', 'INSTALLATION')).toBe(false);
  });

  it('allows exactly one backward edge, QA to Installation', () => {
    const backward = STAGES.flatMap((from) =>
      ALLOWED_TRANSITIONS[from]
        .filter((to) => stageIndex(to) < stageIndex(from))
        .map((to) => `${from}->${to}`),
    );

    expect(backward).toEqual(['QA->INSTALLATION']);
  });

  it('treats COMPLETE as terminal', () => {
    expect(ALLOWED_TRANSITIONS.COMPLETE).toEqual([]);
    for (const stage of STAGES) {
      expect(isLegalTransition('COMPLETE', stage)).toBe(false);
    }
  });

  it('requires a reason only for the rework edge', () => {
    expect(requiresReason('QA', 'INSTALLATION')).toBe(true);
    expect(requiresReason('QA', 'COMPLETE')).toBe(false);
    expect(requiresReason('INSTALLATION', 'QA')).toBe(false);
  });
});

describe('availableTransitions', () => {
  it('offers the move only to the role that owns the current stage', () => {
    expect(availableTransitions('DESIGN', 'DESIGNER', false)).toEqual(['PERMITTING']);
    expect(availableTransitions('DESIGN', 'COORDINATOR', false)).toEqual([]);
    expect(availableTransitions('DESIGN', 'FIELD_TECH', false)).toEqual([]);
  });

  it('lets an Admin act on a stage they do not own', () => {
    expect(availableTransitions('INSTALLATION', 'ADMIN', false)).toEqual(['QA']);
  });

  it('offers both the pass and the rework edge from QA', () => {
    expect(availableTransitions('QA', 'COORDINATOR', false)).toEqual([
      'COMPLETE',
      'INSTALLATION',
    ]);
  });

  it('offers nothing at all while a job is on hold, including to an Admin', () => {
    for (const role of ROLES) {
      expect(availableTransitions('INTAKE', role, true)).toEqual([]);
    }
  });

  it('offers nothing from COMPLETE to any role', () => {
    for (const role of ROLES) {
      expect(availableTransitions('COMPLETE', role, false)).toEqual([]);
    }
  });
});

describe('stageIndex', () => {
  it('orders the stages as the pipeline renders them', () => {
    const indexes = STAGES.map((stage: Stage) => stageIndex(stage));
    expect(indexes).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
