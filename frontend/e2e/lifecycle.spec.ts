import { expect, test } from '@playwright/test';

import { createJobAt, signIn } from './support/api';

/**
 * The stage lifecycle, driven through the UI by the roles that own each stage.
 *
 * Each test creates its own job so the suite does not depend on seeded rows staying in
 * a particular stage.
 */

test('a coordinator moves a new job out of intake', async ({ page }) => {
  const job = await createJobAt('INTAKE');

  await signIn(page, 'coordinator');
  await page.goto(`/jobs/${job.id}`);

  await expect(page.getByRole('heading', { name: job.jobNumber })).toBeVisible();

  await page.getByRole('button', { name: 'Advance to Design' }).click();

  await expect(page.getByText(/moved to design/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Advance to Design' })).toBeHidden();
});

test('a designer advances a job out of design, and a coordinator cannot', async ({ page }) => {
  const job = await createJobAt('DESIGN');

  await signIn(page, 'coordinator');
  await page.goto(`/jobs/${job.id}`);
  // The stage belongs to the Designer, so the Coordinator is offered no move at all.
  await expect(page.getByRole('button', { name: 'Advance to Permitting' })).toBeHidden();

  await signIn(page, 'designer');
  await page.goto(`/jobs/${job.id}`);
  await page.getByRole('button', { name: 'Advance to Permitting' }).click();

  await expect(page.getByText(/moved to permitting/i)).toBeVisible();
});

test('a failed inspection sends the job back to installation with a reason', async ({ page }) => {
  const job = await createJobAt('QA');

  await signIn(page, 'coordinator');
  await page.goto(`/jobs/${job.id}`);

  await page.getByRole('button', { name: 'Fail inspection' }).click();

  const reason = 'Inspection failed: rapid shutdown labelling not per NEC 690.56.';
  await page.getByLabel(/reason for sending this back/i).fill(reason);
  await page.getByRole('button', { name: 'Send back' }).click();

  await expect(page.getByText(/moved to installation/i)).toBeVisible();
  // The reason is recorded in the audit trail, which is the point of requiring it.
  await expect(page.getByText(reason)).toBeVisible();
});

test('failing an inspection without a reason does not move the job', async ({ page }) => {
  const job = await createJobAt('QA');

  await signIn(page, 'coordinator');
  await page.goto(`/jobs/${job.id}`);

  await page.getByRole('button', { name: 'Fail inspection' }).click();
  await page.getByRole('button', { name: 'Send back' }).click();

  await expect(page.getByText(/a specific reason is required/i)).toBeVisible();
  await expect(page.getByText(/moved to installation/i)).toBeHidden();
  // Still at QA, and the form is still open waiting for the reason.
  await expect(page.getByRole('button', { name: 'Fail inspection' })).toBeVisible();
});

test('the history records each move as the job progresses', async ({ page }) => {
  const job = await createJobAt('PERMITTING');

  await signIn(page, 'coordinator');
  await page.goto(`/jobs/${job.id}`);

  const history = page.locator('section.block', { has: page.getByRole('heading', { name: 'History' }) });
  await expect(history.getByText('Intake', { exact: false }).first()).toBeVisible();
  await expect(history.getByText('Permitting', { exact: false }).first()).toBeVisible();
});
