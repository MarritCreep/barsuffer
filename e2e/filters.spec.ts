import { expect, test } from '@playwright/test';

function forecastBody(date: string) {
  const time = Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);
  return JSON.stringify({ hourly: { time, precipitation_probability: time.map(() => 5), precipitation: time.map(() => 0) } });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api.open-meteo.com/**', (route) => route.fulfill({ contentType: 'application/json', body: forecastBody('2000-01-01') }));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('filters in the course list: category, building, day and time; remembered', async ({ page }) => {
  const list = page.locator('.results .result');
  const total = await list.count();
  await page.getByRole('button', { name: 'Filters' }).click();

  await page.getByRole('button', { name: /^Olamot/ }).click();
  await expect(list).toHaveCount(1);
  await expect(list.first()).toContainText('Campus Sprint Demo');
  await expect(page.getByRole('button', { name: /^Filters/ })).toContainText('1');

  await page.getByRole('button', { name: /^Olamot/ }).click();
  await page.getByRole('button', { name: /^Online \(Zoom\)/ }).click();
  await expect(list).toHaveCount(1);
  await expect(list.first()).toContainText('Academic Writing Practicum');

  // День + время: лекции в среду с 16:00 до 18:00.
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(list).toHaveCount(total);
  await page.getByRole('group', { name: /Course day/ }).getByRole('button', { name: /^Wed/ }).click();
  await page.getByLabel('Course time: from').selectOption({ label: '16:00' });
  await page.getByLabel('Course time: to').selectOption({ label: '18:00' });
  await expect(list.filter({ hasText: 'Campus Sprint Demo' })).toHaveCount(1);
  const narrowed = await list.count();
  expect(narrowed).toBeLessThan(total);

  await page.reload();
  await expect(page.locator('.course-filters')).toBeVisible();
  await expect(list).toHaveCount(narrowed);
});

test('tap a grid cell: fill the filters first, then see only what fits that hour', async ({ page, isMobile }) => {
  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();
  await page.getByRole('button', { name: /What fits on Sun 13:00/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Courses for this time slot' });
  await expect(sheet.getByText('Filter courses for Sunday 13:00–14:00')).toBeVisible();
  // Семестр, день и время задаёт клетка — этих групп в фильтре нет.
  await expect(sheet.getByRole('group', { name: /Course day/ })).toHaveCount(0);

  const showAll = await sheet.getByRole('button', { name: /^Show \d+ course/ }).textContent();
  const all = Number(showAll!.match(/\d+/)![0]);
  expect(all).toBeGreaterThan(1);

  await sheet.getByRole('button', { name: /^General course/ }).click();
  await sheet.getByRole('button', { name: 'Show 1 course' }).click();
  await expect(sheet.locator('.slot-item')).toHaveCount(1);
  await expect(sheet.locator('.slot-item')).toContainText('Academic Writing Practicum');
  await expect(sheet.getByText('1 filter on')).toBeVisible();

  // Фильтр запоминается для следующих клеток; «Show all» его снимает.
  await sheet.getByRole('button', { name: 'Change filters' }).click();
  await sheet.getByRole('button', { name: `Show all (${all})` }).click();
  await expect(sheet.locator('.slot-item')).toHaveCount(all);
});
