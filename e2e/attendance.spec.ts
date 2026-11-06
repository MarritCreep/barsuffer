import { expect, test, type Page } from '@playwright/test';

/** Прогноз Open-Meteo в тестах подменяется: сухо, без запросов в интернет. */
function forecastBody(date: string) {
  const time = Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);
  return JSON.stringify({
    hourly: { time, precipitation_probability: time.map(() => 5), precipitation: time.map(() => 0) },
  });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api.open-meteo.com/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: forecastBody('2000-01-01') }),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function seed(page: Page, picks: [string, Record<string, string>][]) {
  await page.evaluate((p) => {
    localStorage.setItem(
      'barsuffer:plan:v1',
      JSON.stringify({ v: 1, courses: p.map(([courseId, pk], i) => ({ courseId, color: i, picks: pk })) }),
    );
  }, picks);
  await page.reload();
}

/** Кнопка «Attendance»; на телефоне она может прятаться во вкладке «More». */
async function openAttendance(page: Page, isMobile: boolean) {
  const button = page.getByRole('button', { name: 'Attendance', exact: true });
  if (isMobile && !(await button.isVisible())) await page.getByRole('button', { name: /^More/ }).click();
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Attendance & reserve duty' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('attendance: mark absences, reserve duty, rules, persistence', async ({ page, isMobile }) => {
  await page.clock.setFixedTime(new Date('2026-11-11T10:00:00')); // среда
  await seed(page, [
    ['63013', { lecture: '18' }], // вт 08–10: 14 встреч в семестре A
    ['711140', { lecture: '18' }], // пн 14–16: 14 понедельников, 7 декабря — Ханука → 13
  ]);

  let dialog = await openAttendance(page, isMobile);
  const lang = () => dialog.locator('.att-course', { hasText: 'Language and Communication' });
  const admin = () => dialog.locator('.att-course', { hasText: 'Intro to Public Administration' });

  // 80% по умолчанию: из 14 можно пропустить 2, из 13 — тоже 2.
  await expect(lang().locator('.att-status')).toHaveText('Missed 0 of 14 · can miss 2 more');
  await expect(admin().locator('.att-status')).toHaveText('Missed 0 of 13 · can miss 2 more');

  // Список дат: Ханука отменяет пару и подписана.
  await admin().getByText('Dates (14)').click();
  await expect(admin().locator('.att-date.cancelled')).toHaveCount(1);
  await expect(admin().locator('.att-date.cancelled')).toContainText('Hanukkah break');

  // Два пропуска — лимит исчерпан.
  await admin().locator('.att-date', { hasText: '12 Oct' }).getByRole('checkbox', { name: 'Missed' }).check();
  await admin().locator('.att-date', { hasText: '19 Oct' }).getByRole('checkbox', { name: 'Missed' }).check();
  await expect(admin().locator('.att-status')).toHaveText('Missed 2 of 13 · can miss 0 more');
  await expect(admin().locator('.att-group')).toHaveClass(/att-tight/);
  await expect(admin().getByText('On thin ice')).toBeVisible();

  // Милуим 15–21 ноября: пн 16 и вт 17 ноября.
  await dialog.getByLabel('From', { exact: true }).fill('2026-11-15');
  await dialog.getByLabel('To', { exact: true }).fill('2026-11-21');
  await dialog.getByRole('button', { name: 'Add reserve duty' }).click();
  await expect(dialog.locator('.att-period')).toHaveCount(1);
  await expect(dialog.getByText('You’ll miss 2 classes on 2 days.')).toBeVisible();
  await expect(admin().locator('.att-status')).toHaveText('Missed 3 of 13 · 1 over the limit');
  await expect(admin().locator('.att-group')).toHaveClass(/att-over/);
  await expect(lang().locator('.att-status')).toHaveText('Missed 1 of 14 · can miss 1 more');
  await expect(admin().locator('.att-date', { hasText: '16 Nov' })).toContainText('Reserve duty');
  await expect(dialog.getByText(/special rights/)).toBeVisible();

  // Правило курса: без обязательной посещаемости.
  await lang()
    .getByRole('combobox', { name: 'Attendance rule for Language and Communication' })
    .selectOption('none');
  await expect(lang().locator('.att-status')).toHaveText('Missed 1 of 14 · no attendance requirement');

  // Оламот — не больше 2 пропусков.
  await admin()
    .getByRole('combobox', { name: /Attendance rule for Intro to Public Administration/ })
    .selectOption('olamot');
  await expect(admin().locator('.att-status')).toHaveText('Missed 3 of 13 · 1 over the limit');

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);

  // Всё сохраняется в браузере.
  await page.reload();
  dialog = await openAttendance(page, isMobile);
  await expect(admin().locator('.att-status')).toHaveText('Missed 3 of 13 · 1 over the limit');
  await expect(lang().locator('.att-status')).toHaveText('Missed 1 of 14 · no attendance requirement');

  // Убрать милуим — остаются только ручные пропуски.
  await dialog.getByRole('button', { name: /^Remove reserve duty/ }).click();
  await expect(dialog.getByText('No reserve duty added. May it stay that way.')).toBeVisible();
  await expect(admin().locator('.att-status')).toHaveText('Missed 2 of 13 · can miss 0 more');

  // Семестр B: курсов нет — дружелюбная пустота.
  await dialog.getByRole('tab', { name: 'Sem B' }).click();
  await expect(dialog.getByText(/No classes in Semester B yet/)).toBeVisible();

  // Клик по фону закрывает окно.
  await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(dialog).toHaveCount(0);
});
