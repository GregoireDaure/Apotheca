import { test, expect } from './fixtures';

test.describe('Login page', () => {
  test('shows login page when not authenticated', async ({ page }) => {
    // Don't mock auth → let real /auth/status 401
    await page.route('**/api/v1/auth/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: false, hasPasskeys: true }),
      }),
    );

    await page.goto('/');
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Apotheca')).toBeVisible();
  });

  test('shows registration form when no passkeys exist', async ({ page }) => {
    await page.route('**/api/v1/auth/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: false, hasPasskeys: false }),
      }),
    );

    await page.goto('/login');
    await expect(page.getByText('Welcome! Set up your passkey')).toBeVisible();
    await expect(page.getByText('Register Passkey')).toBeVisible();
  });

  test('shows sign-in button when passkeys exist', async ({ page }) => {
    await page.route('**/api/v1/auth/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: false, hasPasskeys: true }),
      }),
    );

    await page.goto('/login');
    await expect(page.getByText(/Sign In/i)).toBeVisible();
  });
});
