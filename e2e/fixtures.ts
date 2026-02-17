import { test as base, type Page } from '@playwright/test';

/**
 * Custom test fixture that mocks the auth layer and common
 * background requests (notifications polling).
 *
 * WebAuthn is not testable in headless browsers, so we intercept
 * auth endpoints to simulate an authenticated session.
 */
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    // Catch-all FIRST → checked LAST in LIFO order.
    // Prevents any unmocked API call from hitting the real server
    // (which would return 401 and trigger redirect to /login).
    await page.route('**/api/v1/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // Mock auth status → always authenticated
    // Registered AFTER catch-all so it takes priority (LIFO)
    await page.route('**/api/v1/auth/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true, hasPasskeys: true }),
      }),
    );

    // Mock notifications (polled every minute by Shell nav bar)
    // Registered AFTER catch-all so it takes priority (LIFO)
    await page.route('**/api/v1/notifications/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0 }),
      }),
    );

    await use(page);
  },
});

export { expect } from '@playwright/test';
