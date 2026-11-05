import { expect, test } from '@playwright/test';

const SHOTS = process.env.SHOTS_DIR;

async function shot(page: import('@playwright/test').Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('add a course, pick linked groups, see score and persistence', async ({ page, isMobile }) => {
  await shot(page, '01-empty');

  const search = page.getByRole('searchbox', { name: 'Search courses' });
  await search.fill('political thought a');
  await page.getByRole('button', { name: '+ Add' }).first().click();

  // Режим выбора групп: на сетке видны пунктирные варианты.
  await expect(page.getByText('Choosing groups')).toBeVisible();
  const ghosts = page.locator('.event.ghost');
  await expect(ghosts).toHaveCount(5);
  await shot(page, '02-ghosts');

  // Упражнение 22 привязано к лекции 19 — лекция выбирается сама.
  await page.getByRole('button', { name: /Option:.*Exercise 22/ }).click();
  await expect(page.locator('.event:not(.ghost)')).toHaveCount(2);
  await page.getByRole('button', { name: 'Done' }).click();

  // Добавим второй курс и проверим счёт.
  if (isMobile) await page.getByRole('button', { name: /^Courses/ }).click();
  await search.fill('63013');
  await page.getByRole('button', { name: '+ Add' }).first().click();
  await page.getByRole('button', { name: /Option:.*Lecture 18/ }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  // Вт 08–10 и Чт 10–13: 2 дня × 8 + одно раннее занятие × 6 = 22.
  await expect(page.locator('.misery-score')).toContainText('22');
  await shot(page, '03-two-courses');

  await page.reload();
  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();
  await expect(page.locator('.event')).toHaveCount(3);
});

test('tap an empty cell to see what fits there', async ({ page, isMobile }) => {
  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();

  await page.getByRole('button', { name: /What fits on Wed 14:00/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Courses for this time slot' });
  await expect(sheet.locator('.slot-item')).toHaveCount(2);
  await shot(page, '08-slot');

  await sheet
    .locator('.slot-item', { hasText: 'Citizen Diplomacy' })
    .getByRole('button', { name: '+ Add' })
    .click();
  await expect(page.locator('.event', { hasText: 'Citizen Diplomacy' })).toHaveCount(1);
  // Добавленная группа уходит из списка, оставшаяся помечена как накладка.
  await expect(sheet.locator('.slot-item')).toHaveCount(1);
  await expect(sheet.getByText('Overlaps your schedule')).toBeVisible();

  await page.getByRole('button', { name: /What fits on Fri 12:00/ }).click();
  await expect(sheet.getByText('No courses meet at this time.')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('real sample schedule renders with conflicts, theme toggles', async ({ page, isMobile }) => {
  await page.evaluate(() => {
    const picks: [string, Record<string, string>][] = [
      ['711081', { lecture: '18' }],
      ['711140', { lecture: '18' }],
      ['63254', { workshop: '18' }],
      ['63013', { lecture: '18' }],
      ['71204', { lecture: '18', exercise: '19' }],
      ['183138', { lecture: '01' }],
      ['63011', { lecture: '19' }],
      ['63938', { workshop: '18', other: '19' }],
      ['63256', { lecture: '18' }],
      ['99001', { lecture: '02' }],
    ];
    localStorage.setItem(
      'barsuffer:plan:v1',
      JSON.stringify({ v: 1, courses: picks.map(([courseId, p], i) => ({ courseId, color: i, picks: p })) }),
    );
  });
  await page.reload();
  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();

  // 63011-19 (демо, среда 14–16) пересекается с 63256-18.
  await expect(page.locator('.kpi-warn')).toBeVisible();
  await expect(page.locator('.event.conflict')).toHaveCount(2);
  await page.locator('.misery summary').click();
  await shot(page, '04-full-dark');

  await page.getByRole('button', { name: /Switch to light theme/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await shot(page, '05-full-light');

  await page.getByRole('tab', { name: 'Semester B' }).click();
  await shot(page, '06-sem-b');

  if (isMobile) {
    await page.getByRole('button', { name: /^Courses/ }).click();
    await shot(page, '07-courses-tab');
  }

  // Нет горизонтальной прокрутки страницы.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
