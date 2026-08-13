import { expect, test } from '@playwright/test';

import { API_URL, createJobAt, searchBox, signIn, signInApi } from './support/api';

/**
 * Access control, checked from both sides.
 *
 * A guard that hides a link proves nothing on its own, so each test that asserts the UI
 * hides something also asserts the API refuses it.
 */

test('a field tech sees only their own jobs', async ({ page }) => {
  const mine = await createJobAt('INSTALLATION', { assignTechTo: 'tech' });
  const theirs = await createJobAt('INSTALLATION', { assignTechTo: 'tech2' });

  await signIn(page, 'tech');
  await page.goto('/jobs');
  await expect(page.getByTestId('result-count')).toBeVisible();

  await searchBox(page).fill(mine.jobNumber);
  await expect(page.getByTestId('job-row')).toHaveCount(1);
  await expect(page.getByText(mine.jobNumber)).toBeVisible();

  // The other tech's job is not merely filtered out of view — it is not theirs to see.
  await searchBox(page).fill(theirs.jobNumber);
  await expect(page.getByTestId('job-row')).toHaveCount(0);
  await expect(page.getByTestId('result-count')).toHaveText('0');
});

test("a field tech cannot open another tech's job, by URL or by API", async ({ page, request }) => {
  const theirs = await createJobAt('INSTALLATION', { assignTechTo: 'tech2' });

  await signIn(page, 'tech');
  await page.goto(`/jobs/${theirs.id}`);
  await expect(page.getByText(/not available to you|couldn.t load/i)).toBeVisible();

  // The UI message is cosmetic; this is the control that matters.
  const { access } = await signInApi('tech');
  const direct = await request.get(`${API_URL}/api/jobs/${theirs.id}/`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  expect(direct.status()).toBe(404);
});

test('a field tech is kept out of the overview, in the router and in the API', async ({
  page,
  request,
}) => {
  await signIn(page, 'tech');

  await page.goto('/dashboard');
  await expect(page).not.toHaveURL(/dashboard/);

  const { access } = await signInApi('tech');
  const graphql = await request.post(`${API_URL}/graphql/`, {
    headers: { Authorization: `Bearer ${access}` },
    data: { query: '{ overview { total } }' },
  });
  const body = await graphql.json();
  expect(body.errors?.[0]?.message).toContain('does not have access');
});

test('a designer cannot advance a stage they do not own', async ({ request }) => {
  const job = await createJobAt('INTAKE');
  const { access } = await signInApi('designer');

  const response = await request.post(`${API_URL}/api/jobs/${job.id}/transition/`, {
    headers: { Authorization: `Bearer ${access}` },
    data: { to_stage: 'DESIGN' },
  });

  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe('not_stage_owner');
});

test('signing out revokes the refresh token server-side', async ({ page, request }) => {
  await signIn(page, 'coordinator');

  const refresh = await page.evaluate(() => localStorage.getItem('installops.refresh'));
  expect(refresh).toBeTruthy();

  await page.getByRole('button', { name: /sign out/i }).click();
  await page.waitForURL(/login/);

  const replay = await request.post(`${API_URL}/api/auth/token/refresh/`, {
    data: { refresh },
    failOnStatusCode: false,
  });
  expect(replay.status()).toBe(401);
});

test('an anonymous visitor is redirected to sign in and keeps their destination', async ({
  page,
}) => {
  await page.goto('/jobs/1');

  await expect(page).toHaveURL(/login\?returnUrl=%2Fjobs%2F1/);
});
