import { expect, test } from '@playwright/test';

const SHOTS = process.env.SHOTS_DIR;

async function shot(page: import('@playwright/test').Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: true });
}

/** Прогноз Open-Meteo в тестах подменяется: сухо, без запросов в интернет. */
function forecastBody(date: string, rainyHour?: number) {
  const time = Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);
  return JSON.stringify({
    hourly: {
      time,
      precipitation_probability: time.map((_, h) => (h === rainyHour ? 85 : 5)),
      precipitation: time.map((_, h) => (h === rainyHour ? 1.5 : 0)),
    },
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

test('block personal time, see conflicts, remove the block', async ({ page, isMobile }) => {
  await seed(page, [['63256', { lecture: '18' }]]); // ср 14–16
  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();

  await page.getByRole('button', { name: /What fits on Wed 08:00/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Courses for this time slot' });
  await sheet.getByRole('button', { name: /Block this time/ }).click();
  await sheet.getByRole('textbox', { name: 'What is this time for' }).fill('Work');
  await sheet.getByRole('combobox', { name: 'Block until' }).selectOption({ label: '15:00' });
  await sheet.getByRole('button', { name: 'Block it' }).click();

  await expect(page.locator('.event.busy')).toHaveCount(1);
  await expect(page.locator('.conflicts')).toContainText('your block “Work”');
  await shot(page, '12-block');

  const block = page.locator('.ev-wrap.is-block');
  await block.hover();
  await block.getByRole('button', { name: 'Remove block Work' }).click();
  await expect(page.locator('.event.busy')).toHaveCount(0);
});

test('ghosts show how the suffering index would change', async ({ page, isMobile }) => {
  await seed(page, [['63013', { lecture: '18' }]]); // вт 08–10
  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();
  await page.locator('.event', { hasText: 'Language and Communication' }).click();
  // Группа 19 в воскресенье 12–14 убирает раннюю пару: −6.
  await expect(page.locator('.event.ghost .ev-delta')).toHaveText('−6');
  await shot(page, '13-ghost-delta');
});

test('commute time turns into hours on the road', async ({ page, isMobile }) => {
  await seed(page, [
    ['63013', { lecture: '18' }],
    ['63256', { lecture: '18' }],
  ]); // вт и ср
  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();
  await page.getByRole('button', { name: 'Set your commute time' }).click();
  const input = page.getByRole('spinbutton', { name: 'Commute one way, minutes' });
  await input.fill('45');
  await input.press('Enter');
  // 2 дня × 2 поездки × 45 мин = 3 ч.
  await expect(page.locator('.kpi-commute .kpi-value')).toHaveText('3');
  await page.reload();
  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();
  await expect(page.locator('.kpi-commute .kpi-value')).toHaveText('3');
});

test('auto-pick has adjustable weights', async ({ page, isMobile }) => {
  await seed(page, [['63013', { lecture: '18' }]]);
  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();
  await page.getByRole('button', { name: 'Auto-pick' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Your suffering weights').click();
  const early = dialog.getByRole('slider', { name: /before 09:00/ });
  await early.fill('0');
  await expect(dialog.getByText('Your suffering weights (custom)')).toBeVisible();
  await dialog.getByRole('button', { name: 'Reset' }).click();
  await expect(early).toHaveValue('6');
});

test('today view: classes now and next, or a free day', async ({ page, isMobile }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T12:30:00')); // вторник
  await seed(page, [
    ['63013', { lecture: '18' }], // вт 08–10
    ['183138', { lecture: '01' }], // вт 12–14
    ['63010', { lecture: '18' }], // семестр B — не сегодня
  ]);
  if (isMobile) await page.getByRole('button', { name: 'Today' }).click();
  const today = page.locator('.today');
  await expect(today.locator('.agenda-item.done')).toContainText('Language and Communication');
  await expect(today.locator('.agenda-item.now')).toContainText('1 h 30 min left');
  await shot(page, '14-today');

  await page.clock.setFixedTime(new Date('2026-11-12T09:00:00')); // четверг
  await page.reload();
  if (isMobile) await page.getByRole('button', { name: 'Today' }).click();
  await expect(today.getByText('No classes today. Enjoy!')).toBeVisible();
  await expect(today.getByText(/Next class:/)).toContainText('Language and Communication');
});

test('campus map: route for a day, Run! warning, empty day', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-11T10:00:00')); // среда
  await seed(page, [
    ['63256', { lecture: '18' }], // ср 14–16, здание 105
    ['99003', { lecture: '01' }], // ср 16–18, здание 902 (демо)
  ]);
  await page.getByRole('button', { name: 'Open campus map' }).click();
  const map = page.getByRole('dialog', { name: 'Campus map' });
  await expect(map.locator('.route-stop')).toHaveCount(2);
  await expect(map.locator('.route-leg.run')).toContainText('Run!');
  await expect(map.locator('.map-leg line')).toHaveCount(1);

  // Весь день: ворота → пара 1 → пара 2 → ворота.
  await map.getByRole('combobox', { name: 'Campus gate' }).selectOption('gate-40');
  await expect(map.locator('.route-summary')).toContainText('Gate 40 → 105 → 902 → Gate 40');
  await expect(map.locator('.map-leg line')).toHaveCount(3);
  await expect(map.getByText('Leave via Gate 40')).toBeVisible();
  await shot(page, '15-map');

  await map.getByRole('tab', { name: 'Fri' }).click();
  await expect(map.getByText('No classes on Fri in Semester A.')).toBeVisible();
  await map.getByRole('tab', { name: 'Week' }).click();
  await expect(map.locator('.map-mark')).toHaveCount(2);
  await map.getByRole('button', { name: 'Close map' }).click();
  await expect(map).toHaveCount(0);
});

test('map window can be moved, resized and maximized on desktop', async ({ page, isMobile }) => {
  test.skip(isMobile, 'on phones the map is full screen');
  await page.getByRole('button', { name: 'Open campus map' }).click();
  const map = page.getByRole('dialog', { name: 'Campus map' });
  const before = (await map.boundingBox())!;

  // Перетащить за заголовок.
  const head = map.locator('.map-head');
  const h = (await head.boundingBox())!;
  await page.mouse.move(h.x + 40, h.y + 20);
  await page.mouse.down();
  await page.mouse.move(h.x - 200, h.y - 100, { steps: 5 });
  await page.mouse.up();
  const moved = (await map.boundingBox())!;
  expect(moved.x).toBeLessThan(before.x - 150);
  expect(moved.y).toBeLessThan(before.y - 50);

  // Растянуть за правый нижний угол.
  const grip = (await map.locator('.map-resize').boundingBox())!;
  await page.mouse.move(grip.x + 10, grip.y + 10);
  await page.mouse.down();
  await page.mouse.move(grip.x + 110, grip.y + 60, { steps: 5 });
  await page.mouse.up();
  const resized = (await map.boundingBox())!;
  expect(resized.width).toBeGreaterThan(moved.width + 80);

  // Положение запоминается.
  await map.getByRole('button', { name: 'Close map' }).click();
  await page.getByRole('button', { name: 'Open campus map' }).click();
  const reopened = (await map.boundingBox())!;
  expect(Math.round(reopened.x)).toBe(Math.round(resized.x));

  await map.getByRole('button', { name: 'Maximize map' }).click();
  const max = (await map.boundingBox())!;
  expect(max.width).toBeGreaterThan(1200);
  await map.getByRole('button', { name: 'Restore map size' }).click();
});

test('Wrapped: stories for a semester and the whole year, image export', async ({ page, isMobile }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T10:00:00')); // до семестра — прогноз
  await seed(page, [
    ['63013', { lecture: '18' }], // A: вт 08–10
    ['183138', { lecture: '01' }], // A: вт 12–14 → окно 2 ч
    ['63009', { lecture: '18' }], // B: вт 08–10
  ]);
  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();
  await page.getByRole('button', { name: 'Wrapped' }).click();
  const story = page.getByRole('dialog', { name: 'BarSuffer Wrapped' });
  await expect(story.getByText('It hasn’t started yet. Here’s what’s coming.')).toBeVisible();
  await shot(page, '16-wrapped-intro');

  await story.getByRole('button', { name: 'Next slide' }).click();
  await expect(story.locator('.story-big')).toHaveText('56'); // 14 вторников × 4 часа
  await expect(story.getByText('You will spend')).toBeVisible();

  await story.getByRole('tab', { name: 'Year' }).click();
  await story.getByRole('button', { name: 'Next slide' }).click();
  await expect(story.locator('.story-big')).toHaveText(String(56 + 17 * 2));

  // До последнего слайда и сохранить картинку.
  for (let i = 0; i < 10; i++) {
    const next = story.getByRole('button', { name: 'Next slide' });
    if (await next.isDisabled()) break;
    await next.click();
  }
  await expect(story.getByRole('button', { name: 'Save image' })).toBeVisible();
  await shot(page, '17-wrapped-final');
  const download = page.waitForEvent('download');
  await story.getByRole('button', { name: 'Save image' }).click();
  expect((await download).suggestedFilename()).toBe('barsuffer-wrapped-year.png');

  await page.keyboard.press('Escape');
  await expect(story).toHaveCount(0);
});

test('week insights: heat map, hell day, walking, coffee in the gap', async ({ page, isMobile }) => {
  await seed(page, [
    ['63013', { lecture: '18' }], // вт 08–10, 105
    ['183138', { lecture: '01' }], // вт 12–14, 604
    ['63256', { lecture: '18' }], // ср 14–16, 105
  ]);
  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();
  await expect(page.locator('.day-name.hell')).toContainText('Tue');
  await expect(page.locator('.day-name.hell .day-score')).toContainText('20'); // 8 + 6 + 2×3
  await expect(page.locator('.insights')).toContainText('Tuesday is your hell day');
  await expect(page.locator('.insights')).toContainText('steps');
  await expect(page.locator('.coffee-list li')).toHaveCount(1);
  await expect(page.locator('.coffee-list')).toContainText('for coffee');
  await shot(page, '18-insights');
});

test('today: semester progress and a rain warning', async ({ page, isMobile }) => {
  await page.clock.setFixedTime(new Date('2026-11-11T09:00:00')); // среда
  await page.route('**/api.open-meteo.com/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: forecastBody('2026-11-11', 16) }),
  );
  await seed(page, [
    ['63256', { lecture: '18' }], // ср 14–16, 105
    ['99003', { lecture: '01' }], // ср 16–18, 902
  ]);
  if (isMobile) await page.getByRole('button', { name: 'Today' }).click();
  const today = page.locator('.today');
  await expect(today.locator('.progress')).toContainText('week 5 of 15');
  await expect(today.locator('.rain')).toContainText('Take an umbrella');
  await expect(today.locator('.rain')).toContainText('105 → 902');
  await expect(today).toContainText('Walking today');
  await shot(page, '19-today-rain');
});

// Настоящий PDF из Инбара лежит только локально в _private/ (не в git) — без него тест пропускается.
const INBAR_PDF = 'C:/dev/BarSuffer/_private/Schedule.pdf';

test('import the schedule from an Inbar PDF', async ({ page, isMobile }) => {
  const fs = await import('node:fs');
  test.skip(!fs.existsSync(INBAR_PDF), 'no local Inbar PDF in _private/');
  await page.getByRole('button', { name: /Import from Inbar/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Your schedule from Inbar' });
  await dialog.getByLabel('Inbar schedule PDF').setInputFiles(INBAR_PDF);
  // Сначала проверка: что прочитано и что изменится. План ещё не тронут.
  await expect(dialog.getByText('Check that we read your print correctly')).toBeVisible({ timeout: 15000 });
  await expect(dialog.getByText('print of the whole year')).toBeVisible();
  await expect(dialog.locator('.import-read li')).toHaveCount(17);
  await expect(dialog.getByText('63013-18 · Tue 08:00–10:00 · 105-4 · Elie Friedman')).toBeVisible();
  await expect(dialog.locator('.import-summary')).toContainText('+ 17 added');
  await expect(dialog.locator('.import-errors')).toHaveCount(0);
  await shot(page, '20-import-preview');

  // «Не менять» — ничего не происходит.
  await dialog.getByRole('button', { name: 'Don’t change' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.my-course')).toHaveCount(0);

  // Снова, и теперь применить.
  await page.getByRole('button', { name: /Import from Inbar/ }).click();
  await dialog.getByLabel('Inbar schedule PDF').setInputFiles(INBAR_PDF);
  await dialog.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.locator('.my-course')).toHaveCount(17);

  if (isMobile) await page.getByRole('button', { name: /^Week/ }).click();
  await expect(page.locator('.misery-score')).toContainText('30'); // контрольный пример, семестр A
  // Имя студента из PDF никуда не попало.
  const stored = await page.evaluate(() => localStorage.getItem('barsuffer:plan:v1'));
  expect(stored).not.toMatch(/Tikhaev|Logged/);

  // Отменить импорт кнопкой в уведомлении.
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  if (isMobile) await page.getByRole('button', { name: /^Courses/ }).click();
  await expect(page.locator('.my-course')).toHaveCount(0);
});

test('save the schedule to a file and load it back', async ({ page }) => {
  await seed(page, [
    ['63013', { lecture: '18' }],
    ['183138', { lecture: '01' }],
  ]);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save file' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^barsuffer-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();

  // Как будто браузер очистили.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.my-course')).toHaveCount(0);

  await page.getByLabel('Open a BarSuffer schedule file').setInputFiles(path);
  // Сначала подтверждение, план ещё пустой.
  const confirm = page.getByRole('dialog', { name: 'Load this schedule?' });
  await expect(confirm).toContainText('2 courses');
  await expect(page.locator('.my-course')).toHaveCount(0);
  await confirm.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.locator('.my-course')).toHaveCount(2);
  await expect(page.getByRole('status')).toContainText('Loaded 2 courses');

  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.my-course')).toHaveCount(0);

  // «Не менять» ничего не трогает.
  await page.getByLabel('Open a BarSuffer schedule file').setInputFiles(path);
  await confirm.getByRole('button', { name: 'Don’t change' }).click();
  await expect(page.locator('.my-course')).toHaveCount(0);
});

test('the burning SUFFER button opens the GIF and closes it', async ({ page }) => {
  await page.getByRole('button', { name: 'SUFFER', exact: true }).click();
  const gif = page.getByRole('dialog', { name: 'Welcome home' });
  const img = gif.getByRole('img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await shot(page, '21-suffer');
  await gif.getByRole('button', { name: 'Close' }).click();
  await expect(gif).toHaveCount(0);

  // Esc тоже закрывает.
  await page.getByRole('button', { name: 'SUFFER', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(gif).toHaveCount(0);
});

test('custom colour and shimmering fog: preview, cancel, apply, remembered', async ({ page }) => {
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  const before = await accent();

  // Предпросмотр сразу, «Cancel» возвращает как было.
  await page.getByRole('button', { name: 'Theme and colour' }).click();
  await page.getByRole('button', { name: 'Green' }).click();
  expect(await accent()).toBe('#3fbf5a');
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await accent()).toBe(before);

  // Свой RGB и туман — применить.
  await page.getByRole('button', { name: 'Theme and colour' }).click();
  await page.getByLabel('Pick a colour').fill('#ff3366');
  await page.getByRole('slider', { name: 'Blue channel' }).fill('0');
  await page.getByRole('checkbox', { name: /Shimmering colour/ }).check();
  await page.getByRole('button', { name: 'Apply' }).click();
  expect(await accent()).toBe('#ff3300');
  await expect(page.locator('.fog')).toHaveCount(1);
  await shot(page, '22-fog');

  // Запоминается после перезагрузки.
  await page.reload();
  expect(await accent()).toBe('#ff3300');
  await expect(page.locator('.fog')).toHaveCount(1);
});

test('campus map zooms with the wheel, drags with inertia, resets', async ({ page, isMobile }) => {
  test.skip(isMobile, 'wheel is a desktop gesture; pinch uses the same zoom code');
  await page.getByRole('button', { name: 'Open campus map' }).click();
  const map = page.getByRole('dialog', { name: 'Campus map' });
  const svg = map.locator('svg.map-svg');
  const width = async () => Number((await svg.getAttribute('viewBox'))!.split(' ')[2]);
  const start = await width();

  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(width).toBeLessThan(start * 0.6); // плавно приблизилось

  // Перетаскивание сдвигает карту.
  const x0 = Number((await svg.getAttribute('viewBox'))!.split(' ')[0]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number((await svg.getAttribute('viewBox'))!.split(' ')[0])).toBeLessThan(x0 - 10);

  await map.getByRole('button', { name: 'Reset zoom' }).click();
  await expect.poll(width).toBeGreaterThan(start * 0.98);
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

  await page.getByRole('button', { name: 'Theme and colour' }).click();
  await page.getByRole('tab', { name: 'Light' }).click();
  await page.getByRole('button', { name: 'Apply' }).click();
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
