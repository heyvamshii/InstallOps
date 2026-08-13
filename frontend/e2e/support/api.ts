import { APIRequestContext, Page, request } from '@playwright/test';

export const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:8000';
export const DEMO_PASSWORD = process.env['E2E_PASSWORD'] ?? 'InstallOps!2026';

export type DemoUser = 'coordinator' | 'designer' | 'tech' | 'admin';

export interface Tokens {
  access: string;
  refresh: string;
}

export async function signInApi(username: DemoUser): Promise<Tokens> {
  const context = await request.newContext();
  const response = await context.post(`${API_URL}/api/auth/token/`, {
    data: { username, password: DEMO_PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(
      `Could not sign in as ${username} (${response.status()}). Is the API seeded? ` +
        'Run: python backend/manage.py seed_demo --flush',
    );
  }
  const body = (await response.json()) as Tokens;
  return body;
}

async function authed(username: DemoUser): Promise<APIRequestContext> {
  const { access } = await signInApi(username);
  return request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${access}` },
  });
}

/**
 * Create a job through the API and walk it to the stage a test needs.
 *
 * Tests build their own fixtures rather than reaching for seeded rows, so a test can
 * mutate its job freely without breaking the next one.
 */
export async function createJobAt(
  stage: 'INTAKE' | 'DESIGN' | 'PERMITTING' | 'INSTALLATION' | 'QA',
  options: { assignTechTo?: DemoUser } = {},
): Promise<{ id: number; jobNumber: string }> {
  const coordinator = await authed('coordinator');

  const customers = await coordinator.get('/api/customers/?page=1');
  const customerId = (await customers.json()).results[0].id;

  let techId: number | null = null;
  if (options.assignTechTo) {
    const users = await coordinator.get('/api/auth/users/?role=FIELD_TECH');
    const match = (await users.json()).find(
      (user: { username: string }) => user.username === options.assignTechTo,
    );
    techId = match?.id ?? null;
  }

  const created = await coordinator.post('/api/jobs/', {
    data: {
      customer: customerId,
      site_address: '119 Playwright Way',
      site_city: 'Fremont',
      site_state: 'CA',
      site_postal_code: '94536',
      assigned_tech: techId,
      priority: 'NORMAL',
    },
  });
  if (!created.ok()) throw new Error(`Job creation failed: ${created.status()}`);

  const job = await created.json();

  /**
   * Setup transitions are performed by the admin.
   *
   * Admin can force a move it does not own and sees every job, so setup works whether or
   * not a field tech is assigned. Role-specific behaviour is what the tests themselves
   * drive through the UI — this is only about arriving at a starting stage.
   */
  const path: Record<string, string[]> = {
    INTAKE: [],
    DESIGN: ['DESIGN'],
    PERMITTING: ['DESIGN', 'PERMITTING'],
    INSTALLATION: ['DESIGN', 'PERMITTING', 'INSTALLATION'],
    QA: ['DESIGN', 'PERMITTING', 'INSTALLATION', 'QA'],
  };

  const admin = await authed('admin');
  for (const toStage of path[stage]) {
    const moved = await admin.post(`/api/jobs/${job.id}/transition/`, {
      data: { to_stage: toStage },
    });
    if (!moved.ok()) {
      throw new Error(
        `Setup transition to ${toStage} failed: ${moved.status()} ${await moved.text()}`,
      );
    }
  }

  return { id: job.id, jobNumber: job.job_number };
}

/** The table's search box. */
export function searchBox(page: Page) {
  return page.getByPlaceholder(/job number, customer/i);
}

/** Sign out through the UI, so a test can switch roles mid-flow. */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.waitForURL(/login/);
}

/** Sign in through the real login form — the flow a user actually takes. */
export async function signIn(page: Page, username: DemoUser): Promise<void> {
  await page.goto('/login');

  // The guest guard bounces an authenticated visitor away from /login, so a test that
  // switches roles has to sign out first. Detected from stored session state rather than
  // the URL, which may still be mid-redirect at this point.
  const hasSession = await page.evaluate(() => !!localStorage.getItem('installops.refresh'));
  if (hasSession) await signOut(page);

  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Wait for the job list request the UI just triggered to come back. */
export async function waitForJobs(page: Page): Promise<void> {
  await page.waitForResponse(
    (response) => response.url().includes('/api/jobs/?') && response.status() === 200,
  );
}
