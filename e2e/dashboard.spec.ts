import { test, expect } from './fixtures';

/** Helper to mock all dashboard API routes */
async function mockDashboardAPIs(
  page: import('@playwright/test').Page,
  opts: {
    inventory: unknown[];
    stats: { total: number; expiringSoon: number; expired: number; restockNeeded: number };
    actions: { expiring: unknown[]; expired: unknown[]; restock: unknown[] };
  },
) {
  await page.route('**/api/v1/inventory/dashboard', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(opts.stats),
    }),
  );

  await page.route('**/api/v1/inventory/actions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(opts.actions),
    }),
  );

  // Must be registered AFTER sub-path routes (Playwright matches last-registered first)
  await page.route('**/api/v1/inventory', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(opts.inventory),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

test.describe('Dashboard', () => {
  test('shows empty state when no medicines', async ({ authedPage: page }) => {
    await mockDashboardAPIs(page, {
      inventory: [],
      stats: { total: 0, expiringSoon: 0, expired: 0, restockNeeded: 0 },
      actions: { expiring: [], expired: [], restock: [] },
    });

    await page.goto('/');

    await expect(page.getByText('Your cabinet is empty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan Your First Medicine' })).toBeVisible();
    await expect(page.getByText('How it works')).toBeVisible();
  });

  test('shows dashboard with medicines', async ({ authedPage: page }) => {
    const inventory = [
      {
        id: '1',
        cis: '60001111',
        quantity: 2,
        batchNumber: 'LOT1',
        expiryDate: '2027-06-15',
        restockAlert: false,
        medicine: {
          cis: '60001111',
          denomination: 'Doliprane 1000mg',
          pharmaceuticalForm: 'comprimé',
        },
      },
      {
        id: '2',
        cis: '60002222',
        quantity: 1,
        batchNumber: null,
        expiryDate: '2025-01-01',
        restockAlert: true,
        medicine: {
          cis: '60002222',
          denomination: 'Ibuprofen 400mg',
          pharmaceuticalForm: 'gélule',
        },
      },
    ];

    await mockDashboardAPIs(page, {
      inventory,
      stats: { total: 2, expiringSoon: 0, expired: 1, restockNeeded: 1 },
      actions: {
        expiring: [],
        expired: [inventory[1]],
        restock: [inventory[1]],
      },
    });

    await page.goto('/');

    // Stat cards visible (use getByLabel — Playwright API)
    await expect(page.getByLabel('2 Medicines')).toBeVisible();
    await expect(page.getByLabel('1 Expiring')).toBeVisible();
    await expect(page.getByLabel('1 Restock')).toBeVisible();

    // Medicine names visible (Ibuprofen appears in multiple sections, use .first())
    await expect(page.getByText('Doliprane 1000mg')).toBeVisible();
    await expect(page.getByText('Ibuprofen 400mg').first()).toBeVisible();

    // Action needed section
    await expect(page.getByText('Action Needed')).toBeVisible();
  });

  test('search filters medicines', async ({ authedPage: page }) => {
    const inventory = [
      {
        id: '1',
        cis: '60001111',
        quantity: 2,
        batchNumber: null,
        expiryDate: '2027-06-15',
        restockAlert: false,
        medicine: {
          cis: '60001111',
          denomination: 'Doliprane 1000mg',
          pharmaceuticalForm: 'comprimé',
        },
      },
      {
        id: '2',
        cis: '60002222',
        quantity: 1,
        batchNumber: null,
        expiryDate: '2027-12-01',
        restockAlert: false,
        medicine: {
          cis: '60002222',
          denomination: 'Ibuprofen 400mg',
          pharmaceuticalForm: 'gélule',
        },
      },
    ];

    await mockDashboardAPIs(page, {
      inventory,
      stats: { total: 2, expiringSoon: 0, expired: 0, restockNeeded: 0 },
      actions: { expiring: [], expired: [], restock: [] },
    });

    await page.goto('/');
    await expect(page.getByText('Doliprane 1000mg')).toBeVisible();
    await expect(page.getByText('Ibuprofen 400mg')).toBeVisible();

    // Search for Doliprane
    await page.getByPlaceholder(/search/i).fill('doliprane');

    // Only Doliprane visible
    await expect(page.getByText('Doliprane 1000mg')).toBeVisible();
    await expect(page.getByText('Ibuprofen 400mg')).not.toBeVisible();
  });
});
