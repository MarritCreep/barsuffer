import { expect, test, type Page } from '@playwright/test';

/** Сухой прогноз без запросов в интернет. */
function forecastBody(date: string) {
  const time = Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);
  return JSON.stringify({
    hourly: { time, precipitation_probability: time.map(() => 5), precipitation: time.map(() => 0), temperature_2m: time.map(() => 24) },
  });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api.open-meteo.com/**', (route) => route.fulfill({ contentType: 'application/json', body: forecastBody('2000-01-01') }));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function openTool(page: Page, isMobile: boolean, name: string) {
  if (isMobile) await page.getByRole('button', { name: /^More/ }).click();
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name }).click();
}

async function loadSample(page: Page, isMobile: boolean) {
  await openTool(page, isMobile, 'Tour');
  await page.getByRole('button', { name: 'Try a sample schedule' }).click();
  await expect(page.getByText('Sample schedule loaded.')).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
}

test('language switch: Russian and Hebrew (RTL), remembered after reload', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');
  await expect(page.getByRole('combobox', { name: 'Язык' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Мои курсы' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page.getByRole('combobox', { name: 'Язык' }).selectOption('he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('לא רשמי').first()).toBeVisible();
  // Названия курсов не переводятся.
  await page.getByRole('searchbox').fill('63013');
  await expect(page.getByText('Language and Communication')).toBeVisible();
  // Ничего не вылезает за экран и в RTL.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('tour with a sample schedule, then calendar export', async ({ page, isMobile }) => {
  await openTool(page, isMobile, 'Tour');
  await expect(page.getByRole('dialog', { name: 'Getting started' })).toBeVisible();
  await page.getByRole('button', { name: 'Take a quick tour' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 5 of 5')).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('dialog', { name: 'Getting started' })).toHaveCount(0);

  await loadSample(page, isMobile);
  await openTool(page, isMobile, 'Calendar');
  const dialog = page.getByRole('dialog', { name: 'Add to your calendar' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/events in the file/)).toBeVisible();
  // Ханука и пост 10 Тевета выпадают на пары семестра A.
  await expect(dialog.getByText(/fall on holidays and are left out/)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download .ics' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^barsuffer-sem-[ab]\.ics$/);
  const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  expect(text).toContain('BEGIN:VCALENDAR');
  expect(text).toContain('TZID=Asia/Jerusalem');
  expect(text).toMatch(/SUMMARY:.+— Lecture \d+/);
});

test('share a link with a friend and compare free time', async ({ page, browser, isMobile }) => {
  await loadSample(page, isMobile);
  await openTool(page, isMobile, 'Friends');
  const dialog = page.getByRole('dialog', { name: 'Friends' });
  await dialog.getByLabel('Your name (optional)').fill('Dana');
  const link = await dialog.getByLabel('Your link').inputValue();
  expect(link).toContain('#friend=');

  // Друг открывает ссылку в своём браузере, где своё (пустое) расписание.
  const ctx = await browser.newContext();
  const friend = await ctx.newPage();
  await friend.route('**/api.open-meteo.com/**', (route) => route.fulfill({ contentType: 'application/json', body: forecastBody('2000-01-01') }));
  await friend.goto(link.replace(/^https?:\/\/[^/]+/, 'http://localhost:4173'));
  const compare = friend.getByRole('dialog', { name: 'Friends' });
  await expect(compare.getByText('You vs Dana')).toBeVisible();
  await expect(compare.getByText('Opened from a link.')).toBeVisible();
  await expect(friend).not.toHaveURL(/#friend=/);
  await compare.getByRole('button', { name: 'Save Dana' }).click();
  await expect(compare.getByText('Saved — Dana will be here next time.')).toBeVisible();
  await ctx.close();
});
