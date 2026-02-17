import { test, expect } from './fixtures';

const mockInventory = [
  {
    id: '1',
    cis: '60001111',
    quantity: 1,
    batchNumber: null,
    expiryDate: '2027-06-15',
    restockAlert: false,
    medicine: {
      cis: '60001111',
      denomination: 'Doliprane 1000mg',
      pharmaceuticalForm: 'comprimé',
    },
  },
];

test.describe('Navigation', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    // Mock dashboard sub-paths first (Playwright matches last-registered first)
    await page.route('**/api/v1/inventory/dashboard', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: 1, expiringSoon: 0, expired: 0, restockNeeded: 0 }),
      }),
    );

    await page.route('**/api/v1/inventory/actions', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ expiring: [], expired: [], restock: [] }),
      }),
    );

    // Inventory list (registered after sub-paths)
    await page.route('**/api/v1/inventory', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockInventory),
      }),
    );

    // Passkeys list — needed when navigating to Settings
    await page.route('**/api/v1/auth/passkeys', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      }),
    );
  });

  test('bottom nav navigates between pages', async ({ authedPage: page }) => {
    await page.goto('/');
    await expect(page.getByText('Your Cabinet')).toBeVisible();

    // Navigate to Settings
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings/);

    // Navigate back Home
    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByText('Your Cabinet')).toBeVisible();
  });

  test('scan button navigates to scan page', async ({ authedPage: page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'Scan' }).click();
    await expect(page).toHaveURL(/\/scan/);
  });

  test('clicking a medicine row navigates to detail', async ({ authedPage: page }) => {
    await page.route('**/api/v1/inventory/1', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockInventory[0]),
      }),
    );

    await page.goto('/');
    await page.getByText('Doliprane 1000mg').click();
    await expect(page).toHaveURL(/\/medicine\/1/);
    await expect(page.getByText('Doliprane 1000mg')).toBeVisible();
  });
});
