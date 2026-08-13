import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { userMessageFrom } from '../../../core/api/api-error';
import { JobsApi } from '../../../core/api/jobs.api';
import { AuthService } from '../../../core/auth/auth.service';
import { ChecklistItem, JobDetail as JobDetailDto } from '../../../core/domain/api.model';
import { STAGES, STAGE_LABEL, Stage, requiresReason } from '../../../core/domain/job.model';

interface Banner {
  kind: 'error' | 'ok';
  text: string;
}

@Component({
  selector: 'app-job-detail',
  imports: [RouterLink, ReactiveFormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './job-detail.html',
  styleUrl: './job-detail.scss',
})
export class JobDetail {
  private readonly api = inject(JobsApi);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  /** Bound from the route via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly stages = STAGES;
  protected readonly stageLabel = STAGE_LABEL;

  protected readonly job = signal<JobDetailDto | null>(null);
  protected readonly loadError = signal('');
  protected readonly banner = signal<Banner | null>(null);
  /** Guards the two mutations that change job state: advance and hold. */
  protected readonly pending = signal(false);
  private readonly inFlightItems = signal<ReadonlySet<number>>(new Set());

  /** Set when a transition needs a reason before it can be sent. */
  protected readonly reasonFor = signal<Stage | null>(null);
  protected readonly reasonControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(8)],
  });
  protected readonly noteControl = new FormControl('', { nonNullable: true });
  protected readonly holdReasonControl = new FormControl('', { nonNullable: true });
  protected readonly showHoldForm = signal(false);

  protected readonly canHold = computed(() => this.auth.hasAnyRole(['COORDINATOR', 'ADMIN']));

  protected readonly currentStageItems = computed<ChecklistItem[]>(() => {
    const job = this.job();
    if (!job) return [];
    return job.checklist_items
      .filter((item) => item.stage === job.stage)
      .sort((a, b) => a.order - b.order);
  });

  protected readonly checklistProgress = computed(() => {
    const items = this.currentStageItems();
    if (!items.length) return { done: 0, total: 0, percent: 0 };
    const done = items.filter((item) => item.is_done).length;
    return { done, total: items.length, percent: Math.round((done / items.length) * 100) };
  });

  constructor() {
    /**
     * Reload whenever the route's id changes.
     *
     * The router reuses this component instance when navigating job → job, so a
     * one-shot load in the constructor would leave job 5's data on screen under job
     * 7's URL.
     */
    effect(() => {
      const jobId = Number(this.id());
      if (!Number.isFinite(jobId)) return;

      this.job.set(null);
      this.banner.set(null);
      this.api
        .get(jobId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (job) => {
            this.job.set(job);
            this.loadError.set('');
          },
          error: (error: unknown) => this.loadError.set(userMessageFrom(error)),
        });
    });
  }

  protected stageIndexOf(stage: Stage): number {
    return STAGES.indexOf(stage);
  }

  protected isReached(stage: Stage): boolean {
    const job = this.job();
    return job ? this.stageIndexOf(stage) <= this.stageIndexOf(job.stage) : false;
  }

  protected labelForTransition(to: Stage): string {
    const job = this.job();
    if (job && requiresReason(job.stage, to)) return 'Fail inspection';
    return `Advance to ${STAGE_LABEL[to]}`;
  }

  protected startTransition(to: Stage): void {
    const job = this.job();
    if (!job) return;

    if (requiresReason(job.stage, to)) {
      this.reasonControl.reset('');
      this.reasonFor.set(to);
      return;
    }
    this.advance(to);
  }

  protected confirmReason(): void {
    const to = this.reasonFor();
    if (!to || this.reasonControl.invalid) {
      this.reasonControl.markAsTouched();
      return;
    }
    this.advance(to, this.reasonControl.value);
    this.reasonFor.set(null);
  }

  protected cancelReason(): void {
    this.reasonFor.set(null);
  }

  /**
   * Optimistic stage change.
   *
   * The UI moves immediately, then reconciles with the server's response. On failure it
   * restores the exact snapshot taken before the change — not a re-fetch, so a rollback
   * works even when the network is what failed.
   */
  protected advance(to: Stage, reason = ''): void {
    const snapshot = this.job();
    if (!snapshot || this.pending()) return;

    this.pending.set(true);
    this.banner.set(null);
    this.job.set({ ...snapshot, stage: to, available_transitions: [] });

    this.api
      .transition(snapshot.id, to, reason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.job.set(fresh);
          this.pending.set(false);
          this.banner.set({ kind: 'ok', text: `Moved to ${STAGE_LABEL[fresh.stage]}.` });
        },
        error: (error: unknown) => {
          this.rollbackTo(snapshot);
          this.pending.set(false);
          this.banner.set({ kind: 'error', text: userMessageFrom(error) });
        },
      });
  }

  protected toggleHold(): void {
    const job = this.job();
    if (!job || this.pending()) return;

    if (!job.on_hold && !this.showHoldForm()) {
      this.showHoldForm.set(true);
      return;
    }

    const reason = job.on_hold ? '' : this.holdReasonControl.value.trim();
    if (!job.on_hold && !reason) return;

    const snapshot = job;
    this.pending.set(true);
    this.job.set({ ...job, on_hold: !job.on_hold, hold_reason: reason });
    this.showHoldForm.set(false);

    this.api
      .setHold(job.id, !snapshot.on_hold, reason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.job.set(fresh);
          this.pending.set(false);
          this.holdReasonControl.reset('');
        },
        error: (error: unknown) => {
          this.rollbackTo(snapshot);
          this.pending.set(false);
          this.banner.set({ kind: 'error', text: userMessageFrom(error) });
        },
      });
  }

  /**
   * Checklist toggles patch a single item rather than swapping the whole job.
   *
   * Restoring a whole-job snapshot here was a real bug: a checklist request that failed
   * while a stage transition was in flight would put the job back to its pre-transition
   * stage, silently undoing a change the server had already accepted.
   */
  protected toggleChecklistItem(item: ChecklistItem): void {
    if (this.inFlightItems().has(item.id)) return;

    const desired = !item.is_done;
    this.patchChecklistItem(item.id, desired);
    this.inFlightItems.update((ids) => new Set(ids).add(item.id));

    this.api
      .toggleChecklistItem(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.patchChecklistItem(fresh.id, fresh.is_done);
          this.clearInFlight(item.id);
        },
        error: (error: unknown) => {
          this.patchChecklistItem(item.id, !desired);
          this.clearInFlight(item.id);
          this.banner.set({ kind: 'error', text: userMessageFrom(error) });
        },
      });
  }

  private patchChecklistItem(itemId: number, isDone: boolean): void {
    const current = this.job();
    if (!current) return;

    this.job.set({
      ...current,
      checklist_items: current.checklist_items.map((candidate) =>
        candidate.id === itemId ? { ...candidate, is_done: isDone } : candidate,
      ),
    });
  }

  private clearInFlight(itemId: number): void {
    this.inFlightItems.update((ids) => {
      const next = new Set(ids);
      next.delete(itemId);
      return next;
    });
  }

  /** Restore a snapshot only if it is still the job on screen. */
  private rollbackTo(snapshot: JobDetailDto): void {
    const current = this.job();
    if (current?.id === snapshot.id) this.job.set(snapshot);
  }

  protected addNote(): void {
    const job = this.job();
    const body = this.noteControl.value.trim();
    if (!job || !body) return;

    this.noteControl.reset('');
    this.api
      .addNote(job.id, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (note) => {
          const current = this.job();
          // Only append if we are still on the job the note was written against.
          if (current?.id === job.id) {
            this.job.set({ ...current, notes: [note, ...current.notes] });
          }
        },
        error: (error: unknown) => {
          this.noteControl.setValue(body);
          this.banner.set({ kind: 'error', text: userMessageFrom(error) });
        },
      });
  }

  protected dismissBanner(): void {
    this.banner.set(null);
  }
}
