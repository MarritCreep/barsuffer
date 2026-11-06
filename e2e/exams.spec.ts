import { expect, test, type Page } from '@playwright/test';

/** Прогноз Open-Meteo подменяется: тесты не ходят в интернет. */
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
  // За десять дней до первого экзамена — отсчёт предсказуем.
  await page.clock.setFixedTime(new Date('2027-01-10T10:00:00'));
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      'barsuffer:plan:v1',
      JSON.stringify({ v: 1, courses: [{ courseId: '63013', color: 0, picks: { lecture: '18' } }] }),
    );
  });
  await page.reload();
});

/** Кнопка «Exams»: на телефоне может прятаться во вкладке «More». */
async function openExams(page: Page) {
  const button = page.getByRole('button', { name: 'Exams', exact: true });
  if (!(await button.isVisible())) await page.getByRole('button', { name: /^More/ }).click();
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Exams' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('exams: add, see gaps and same-day clash, edit, delete, persist', async ({ page }) => {
  let dialog = await openExams(page);
  await expect(dialog.getByText('No exams yet. Suspiciously peaceful.')).toBeVisible();
  await expect(dialog.getByText(/Dates are in Inbar \/ Tomex/)).toBeVisible();

  // Курс из плана выбран по умолчанию.
  const course = dialog.getByLabel('Course');
  await expect(course).toHaveValue('63013');
  await expect(dialog.getByText(/Semester A exam period/)).toBeVisible();
  await dialog.getByLabel('Date', { exact: true }).fill('2027-01-20');
  await dialog.getByLabel('Time (optional)').fill('09:00');
  await dialog.getByRole('button', { name: 'Add exam' }).click();

  await expect(dialog.locator('.exams-countdown')).toContainText('in 10 days');
  await expect(dialog.locator('.exams-item')).toHaveCount(1);

  // Свой экзамен в тот же день — громкое предупреждение.
  await course.selectOption({ label: 'Other…' });
  await dialog.getByLabel('Exam name').fill('Calculus');
  await dialog.getByLabel('Date', { exact: true }).fill('2027-01-20');
  await dialog.getByRole('button', { name: 'Add exam' }).click();
  await expect(dialog.getByText('SAME DAY! Two exams, one brain.')).toBeVisible();

  // Дата вне сессии — мягкая подсказка, но добавить можно.
  await dialog.getByLabel('Exam name').fill('Linear algebra');
  await dialog.getByLabel('Date', { exact: true }).fill('2027-03-15');
  await expect(dialog.getByText(/outside the exam periods/)).toBeVisible();
  await dialog.getByLabel('Date', { exact: true }).fill('2027-01-25');
  await expect(dialog.getByText(/outside the exam periods/)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Add exam' }).click();

  await expect(dialog.locator('.exams-item')).toHaveCount(3);
  await expect(dialog.getByText('4 days to study')).toBeVisible();
  // 0 дней (30) + 4 дня (2) + один день (25) + 3 экзамена × 4 = 69.
  await expect(dialog.locator('.exams-score-num')).toHaveText('69');
  await expect(dialog.getByText(/Coffee IV territory/)).toBeVisible();

  // Переносим Calculus на 23-е: накладки нет, самый тесный промежуток — 1 день.
  await dialog.getByRole('button', { name: 'Edit Calculus' }).click();
  await expect(dialog.getByLabel('Date', { exact: true })).toHaveValue('2027-01-20');
  await dialog.getByLabel('Date', { exact: true }).fill('2027-01-23');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByText('SAME DAY! Two exams, one brain.')).toHaveCount(0);
  await expect(dialog.locator('.exams-gap.is-tightest')).toContainText('1 day to study');
  // 2 дня (12) + 1 день (20) + 3 × 4 = 44.
  await expect(dialog.locator('.exams-score-num')).toHaveText('44');
  await expect(dialog.getByText(/Manageable/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Moed B (0)' }).click();
  await expect(dialog.getByText('No Moed B exams yet.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Moed A (3)' }).click();

  await dialog.getByRole('button', { name: 'Delete Linear algebra' }).click();
  await expect(dialog.locator('.exams-item')).toHaveCount(2);

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();

  // Сохраняется в браузере.
  await page.reload();
  dialog = await openExams(page);
  await expect(dialog.locator('.exams-item')).toHaveCount(2);
  await expect(dialog.getByText('Calculus')).toBeVisible();

  // Клик по фону закрывает окно.
  await page.locator('.modal-backdrop').click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeHidden();
});
