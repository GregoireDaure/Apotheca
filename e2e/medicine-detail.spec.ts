import { test, expect } from './fixtures';

const mockMedicine = {
  id: '1',
  cis: '60001111',
  quantity: 3,
  batchNumber: 'LOT-2025A',
  expiryDate: '2027-06-15',
  restockAlert: false,
  medicine: {
    cis: '60001111',
    denomination: 'Doliprane 1000mg',
    pharmaceuticalForm: 'comprimé pelliculé',
    administrationRoutes: ['orale'],
    composition: [{ substance: 'Paracétamol', dosage: '1000 mg' }],
  },
};

test.describe('Medicine Detail', () => {
  test('shows medicine details', async ({ authedPage: page }) => {
    await page.route('**/api/v1/inventory/1', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMedicine),
      }),
    );

    await page.goto('/medicine/1');

    await expect(page.getByText('Doliprane 1000mg')).toBeVisible();
    await expect(page.getByText('comprimé pelliculé')).toBeVisible();
    await expect(page.getByText('Paracétamol')).toBeVisible();

    // Quantity displayed
    await expect(page.getByText('3', { exact: true }).first()).toBeVisible();
  });

  test('increment and decrement quantity', async ({ authedPage: page }) => {
    let currentQuantity = 3;

    await page.route('**/api/v1/inventory/1', (route) => {
      const method = route.request().method();

      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockMedicine, quantity: currentQuantity }),
        });
      }

      if (method === 'PATCH') {
        const body = route.request().postDataJSON();
        currentQuantity = body.quantity ?? currentQuantity;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockMedicine, quantity: currentQuantity }),
        });
      }

      return route.continue();
    });

    await page.goto('/medicine/1');
    await expect(page.getByText('3', { exact: true }).first()).toBeVisible();

    // Increment
    await page.getByLabel('Increase quantity').click();
    await expect(page.getByText('4', { exact: true }).first()).toBeVisible();

    // Decrement
    await page.getByLabel('Decrease quantity').click();
    await expect(page.getByText('3', { exact: true }).first()).toBeVisible();
  });

  test('shows 404 state for missing medicine', async ({ authedPage: page }) => {
    await page.route('**/api/v1/inventory/missing', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not found' }),
      }),
    );

    await page.goto('/medicine/missing');
    await expect(page.getByText('Medicine not found')).toBeVisible();
    await expect(page.getByText('Back to Cabinet')).toBeVisible();
  });
});
