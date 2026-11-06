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

async function seedPlan(page: Page, ids: string[]) {
  await page.evaluate((list) => {
    localStorage.setItem(
      'barsuffer:plan:v1',
      JSON.stringify({ v: 1, courses: list.map((courseId, i) => ({ courseId, color: i, picks: { lecture: '18' } })) }),
    );
  }, ids);
  await page.reload();
}

/** Кнопка «Degree» может жить в меню «More» на телефоне. */
async function openDegree(page: Page) {
  const button = page.getByRole('button', { name: 'Degree', exact: true });
  if (!(await button.isVisible())) {
    const more = page.getByRole('button', { name: /^More/ });
    if (await more.isVisible()) await more.click();
  }
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Degree progress' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('degree: defaults, courses from the schedule, saved between visits', async ({ page }) => {
  await seedPlan(page, ['63013', '711140']);
  let dialog = await openDegree(page);

  // Стандарт: 128 נ״ז, Оламот 20, английский с Advanced A.
  await expect(dialog.getByText(/0\s*of 128 credits/)).toBeVisible();
  await expect(dialog.getByRole('progressbar', { name: 'Olamot' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Advanced A: not yet' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Advanced B: not yet' })).toBeVisible();

  await dialog.getByRole('tab', { name: 'Courses' }).click();
  await dialog.getByRole('button', { name: 'Add courses from my schedule' }).click();
  await expect(dialog.getByText('Added 2 courses from your schedule')).toBeVisible();
  await expect(dialog.locator('.dg-course')).toHaveCount(2);

  // Повторно ничего не дублируется.
  await dialog.getByRole('button', { name: 'Add courses from my schedule' }).click();
  await expect(dialog.getByText('Everything from your schedule is already here.')).toBeVisible();
  await expect(dialog.locator('.dg-course')).toHaveCount(2);

  // Один курс сдан.
  await dialog
    .locator('.dg-course', { hasText: 'Language and Communication' })
    .getByRole('checkbox', { name: 'Done' })
    .check();

  await dialog.getByRole('tab', { name: 'Overview' }).click();
  await expect(dialog.getByText(/4\s*of 128 credits/)).toBeVisible();
  await expect(dialog.getByText('2 done')).toBeVisible();
  await expect(dialog.getByText('2 this year')).toBeVisible();

  // Закрыть крестиком, открыть после перезагрузки — всё на месте.
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  dialog = await openDegree(page);
  await expect(dialog.getByText(/4\s*of 128 credits/)).toBeVisible();

  // Закрытие по клику на фон.
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
});

test('degree: settings drive levels, exemptions and warnings', async ({ page }) => {
  const dialog = await openDegree(page);
  await dialog.getByRole('tab', { name: 'Settings' }).click();

  await dialog.getByLabel('Year of study').selectOption('2');
  await dialog.getByLabel('Psychometric / Amiranet English score').fill('125');
  await expect(dialog.getByText('That’s Advanced B.')).toBeVisible();
  await expect(dialog.getByLabel('Starting level')).toHaveValue('advB');

  await dialog.getByLabel('Olamot track').selectOption('exempt');
  await expect(dialog.getByText(/second BA after a Bar-Ilan BA/i)).toBeVisible();

  await dialog.getByText('Ways to be exempt').click();
  await expect(dialog.getByText('Bagrut in Hebrew expression: 76 or more')).toBeVisible();

  await dialog.getByRole('tab', { name: 'Overview' }).click();
  await expect(dialog.getByText('Exempt', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Advanced B: not yet' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Advanced A/ })).toHaveCount(0);
  await expect(dialog.getByText('0 of 1 done')).toBeVisible(); // 120–133 → один курс EMI
  await expect(dialog.getByText(/English has to be finished by the end of year 2/)).toBeVisible();
  await expect(dialog.getByText(/Hebrew expression is meant for year 1/)).toBeVisible();

  // Освобождение от הבעה עברית убирает предупреждение.
  await dialog.getByRole('tab', { name: 'Settings' }).click();
  await dialog.getByRole('radio', { name: 'Exempt' }).check();
  await dialog.getByRole('tab', { name: 'Overview' }).click();
  await expect(dialog.getByText(/Hebrew expression is meant for year 1/)).toHaveCount(0);
});

test('degree: add, edit and delete courses by hand, then celebrate', async ({ page }) => {
  const dialog = await openDegree(page);

  await dialog.getByRole('tab', { name: 'Settings' }).click();
  await dialog.getByLabel('Total credits for the degree').fill('6');
  await dialog.getByLabel('Olamot track').selectOption('exempt');
  await dialog.getByLabel('Starting level').selectOption('advB');
  await dialog.getByRole('checkbox', { name: 'Advanced B' }).check();
  await dialog.getByRole('radio', { name: 'Done' }).check();

  await dialog.getByRole('tab', { name: 'Courses' }).click();
  await dialog.getByRole('button', { name: '+ Add a course' }).click();
  const form = dialog.getByRole('form', { name: 'New course' });
  await form.getByLabel('Course name').fill('Intro to Suffering');
  await form.getByLabel('Credits').fill('4');
  await form.getByLabel('Status').selectOption('done');
  await form.getByLabel('Taught in English (EMI)').check();
  await form.getByRole('button', { name: 'Save' }).click();

  await dialog.getByRole('button', { name: '+ Add a course' }).click();
  await dialog.getByRole('form', { name: 'New course' }).getByLabel('Course name').fill('Delete me');
  await dialog.getByRole('form', { name: 'New course' }).getByRole('button', { name: 'Save' }).click();
  await expect(dialog.locator('.dg-course')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Delete Delete me' }).click();
  await expect(dialog.locator('.dg-course')).toHaveCount(1);

  // Ещё не всё: 4 из 6.
  await dialog.getByRole('tab', { name: 'Overview' }).click();
  await expect(dialog.getByText('Complete!')).toHaveCount(0);

  await dialog.getByRole('tab', { name: 'Courses' }).click();
  await dialog.getByRole('button', { name: 'Edit Intro to Suffering' }).click();
  const edit = dialog.getByRole('form', { name: 'Edit Intro to Suffering' });
  await edit.getByLabel('Credits').fill('6');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.locator('.dg-course', { hasText: 'Intro to Suffering' })).toContainText('6 credits');

  await dialog.getByRole('tab', { name: 'Overview' }).click();
  await expect(dialog.getByText('Complete!')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'olamot.biu.ac.il' })).toHaveAttribute('target', '_blank');
});
