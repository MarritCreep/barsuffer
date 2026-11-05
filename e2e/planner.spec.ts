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

async function seed(page: import('@playwright/test').Page, picks: [string, Record<string, string>][]) {
  await page.evaluate((p) => {
    localStorage.setItem(
      'barsuffer:plan:v1',
      JSON.stringify({ v: 1, courses: p.map(([courseId, pk], i) => ({ courseId, color: i, picks: pk })) }),
    );
  }, picks);
  await page.reload();
}

test('auto-pick asks for required courses first, then applies the best option', async ({ page, isMobile }) => {
  await seed(page, [
    ['63013', { lecture: '18' }],
    ['711140', { lecture: '18' }],
    ['63254', { workshop: '18' }],
  ]);
  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();

  await page.getByRole('button', { name: 'Auto-pick' }).click();
  const dialog = page.getByRole('dialog', { name: /can’t you skip/ });
  const find = dialog.getByRole('button', { name: 'Find best schedules' });
  // Пока ничего не отмечено как обязательное — искать нельзя.
  await expect(find).toBeDisabled();
  await expect(dialog.getByText('Mark at least one required course')).toBeVisible();

  await dialog.getByRole('checkbox').first().check(); // 63013 обязателен
  await expect(find).toBeEnabled();
  await dialog.getByRole('button', { name: 'Take fewer optional courses' }).click(); // 1 из 2
  await expect(dialog.getByText(/Also take\s*1\s*of 2/)).toBeVisible();
  await shot(page, '09-autopick-setup');
  await find.click();

  const results = page.getByRole('dialog', { name: 'Least painful schedules' });
  await expect(results.locator('.ap-card').first().locator('.ap-score')).toHaveText('8');
  await shot(page, '10-autopick-results');
  await results.getByRole('button', { name: 'Use this' }).first().click();

  // Оба курса в воскресенье, 63254 скрыт.
  await expect(page.locator('.misery-score')).toContainText('8');
  await expect(page.locator('.event')).toHaveCount(2);

  // Ctrl+Z возвращает прежнее расписание.
  await page.keyboard.press('Control+z');
  await expect(page.locator('.event')).toHaveCount(3);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.event')).toHaveCount(2);

  if (isMobile) await page.getByRole('button', { name: /^Courses/ }).click();
  await expect(page.getByText('Hidden — not on the grid, not counted')).toBeVisible();
});

test('remove a course from the grid with the × and undo it', async ({ page, isMobile }) => {
  await seed(page, [
    ['63013', { lecture: '18' }],
    ['183138', { lecture: '01' }],
  ]);
  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();

  const block = page.locator('.ev-wrap', { hasText: 'History of Power' });
  await block.locator('.event').click();
  await shot(page, '11-remove-x');
  await block.getByRole('button', { name: /Remove History of Power/ }).click();
  await expect(page.locator('.event', { hasText: 'History of Power' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.event', { hasText: 'History of Power' })).toHaveCount(1);
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
