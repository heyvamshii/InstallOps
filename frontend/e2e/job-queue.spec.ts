import { expect, test } from '@playwright/test';

import { searchBox, signIn } from './support/api';

/**
 * The table's URL-persisted state, which is the screen's main claim.
 *
 * Assertions wait on rendered state rather than on network responses: a response can
 * land before a listener is attached, which makes response-waiting flaky here.
 */

test('a filtered view survives a reload and is shareable', async ({ page }) => {
  await signIn(page, 'coordinator');
  await page.goto('/jobs');

  // The count reads 0 until the first page lands; waiting for that avoids capturing the
  // placeholder and then comparing against it.
  const count = page.getByTestId('result-count');
  await expect(count).not.toHaveText('0');
  const unfiltered = await count.textContent();

  await page.getByRole('button', { name: 'Permitting', exact: true }).click();
  await expect(page).toHaveURL(/stage=PERMITTING/);
  await expect(count).not.toHaveText(unfiltered ?? '');
  const filtered = await count.textContent();

  await page.reload();
  await expect(page).toHaveURL(/stage=PERMITTING/);
  await expect(count).toHaveText(filtered ?? '');

  // The same URL in a fresh tab shows the same view — that is what "shareable" means.
  const other = await page.context().newPage();
  await other.goto(page.url());
  await expect(other.getByTestId('result-count')).toHaveText(filtered ?? '');
  await other.close();
});

test('the back button steps through filter changes', async ({ page }) => {
  await signIn(page, 'coordinator');
  await page.goto('/jobs');
  await expect(page.getByTestId('result-count')).toBeVisible();

  await page.getByRole('button', { name: 'Intake', exact: true }).click();
  await expect(page).toHaveURL(/stage=INTAKE/);

  await page.getByRole('button', { name: 'QA', exact: true }).click();
  await expect(page).toHaveURL(/stage=QA/);

  await page.goBack();
  await expect(page).toHaveURL(/stage=INTAKE/);
  await expect(page).not.toHaveURL(/stage=QA/);
});

test('paging is server-side and reflected in the URL', async ({ page }) => {
  await signIn(page, 'coordinator');
  await page.goto('/jobs');

  const firstRow = page.getByTestId('job-row').first();
  await expect(firstRow).toBeVisible();
  const firstJobNumber = await firstRow.textContent();

  await page.getByRole('button', { name: /next/i }).click();

  await expect(page).toHaveURL(/page=2/);
  await expect(firstRow).not.toHaveText(firstJobNumber ?? '');
});

test('search narrows the table and is persisted in the URL', async ({ page }) => {
  await signIn(page, 'coordinator');
  await page.goto('/jobs');

  const count = page.getByTestId('result-count');
  await expect(count).not.toHaveText('0');
  const unfiltered = await count.textContent();

  await searchBox(page).fill('Austin');

  await expect(page).toHaveURL(/q=Austin/);
  await expect(count).not.toHaveText(unfiltered ?? '');
});
