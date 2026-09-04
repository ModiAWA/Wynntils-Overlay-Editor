const { test, expect } = require('@playwright/test');

const browserErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto('/index.html');
  await expect(page.locator('#contentInput')).not.toHaveValue('');
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) || []).toEqual([]);
});

test('function catalog stays lazy and supports its complete keyboard flow', async ({ page }) => {
  const categories = page.locator('.function-category');
  await expect(categories.first()).toBeVisible();
  expect(await categories.count()).toBeGreaterThan(5);
  await expect(page.locator('.function-result')).toHaveCount(0);

  const expandableIndex = await categories.evaluateAll((nodes) =>
    nodes.findIndex((node) => Number(node.textContent.match(/\((\d+)\)/)?.[1] || 0) > 30),
  );
  expect(expandableIndex).toBeGreaterThanOrEqual(0);
  const expandable = categories.nth(expandableIndex);
  await expandable.locator('summary').click();
  await expect(expandable.locator('.function-result')).toHaveCount(30);
  await expandable.locator('summary').click();
  await expandable.locator('summary').click();
  await expect(expandable.locator('.function-result')).toHaveCount(30);
  await expandable.locator('.show-more-functions').click();
  expect(await expandable.locator('.function-result').count()).toBeGreaterThan(30);

  const search = page.locator('#functionSearch');
  await search.fill('fps');
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#functionResults')).toHaveAttribute('role', 'listbox');
  await expect(page.locator('#functionResults [role="option"]')).not.toHaveCount(0);
  await search.press('ArrowDown');
  const activeId = await search.getAttribute('aria-activedescendant');
  expect(activeId).toBeTruthy();
  await expect(page.locator(`#${activeId}`)).toHaveAttribute('aria-selected', 'true');

  const previousContent = await page.locator('#contentInput').inputValue();
  await search.press('Enter');
  await expect(page.locator('#contentInput')).not.toHaveValue(previousContent);
  await search.press('Escape');
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#functionResults')).toBeHidden();
  expect(
    await page.locator('#functionResults').evaluate((node) => getComputedStyle(node).display),
  ).toBe('none');
});

test('editor exposes a coherent heading and form description tree', async ({ page }) => {
  await expect(page.locator('h1#pageTitle')).toHaveText('Wynntils Overlay Studio');
  await expect(page.locator('#previewTitle, #formTitle, #searchTitle')).toHaveCount(3);
  await expect(page.locator('#configForm')).toHaveAttribute('aria-labelledby', 'formTitle');
  await expect(page.locator('#contentInput')).toHaveAttribute(
    'aria-describedby',
    'contentHelp contentError',
  );
  await expect(page.locator('#functionSearch')).toHaveAccessibleName('用中文描述或函数名搜索');
  await expect(page.locator('#functionSearch')).toHaveAttribute('aria-controls', 'functionResults');
  await expect(page.locator('#fontScaleInput')).toHaveAttribute(
    'aria-describedby',
    'fontScaleHelp fontScaleError',
  );
});

test('preview identifies unsupported simulation values without hiding the result', async ({
  page,
}) => {
  const content = page.locator('#contentInput');
  const status = page.locator('#previewStatus');
  await content.fill('{ability_cooldown("Meteor";true)}');
  await expect(status).toBeVisible();
  await expect(status).toContainText('ability_cooldown');
  await expect(status).toHaveClass(/is-warning/);
  const firstText = await status.textContent();
  await content.fill('{ability_cooldown("Meteor";true)}');
  await expect(status).toBeVisible();
  await expect(status).toHaveText(firstText);

  await page.locator('#languageButton').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(status).toHaveText('Preview contains placeholders for: ability_cooldown');
});

test('lint diagnostics move keyboard focus and selection to the reported range', async ({
  page,
}) => {
  const content = page.locator('#contentInput');
  await content.fill('prefix {not_a_function} suffix');
  await page.locator('#lintContentButton').click();

  const issue = page.locator('#validationMessage .lint-issue-button').first();
  await expect(issue).toBeVisible();
  await issue.focus();
  await issue.press('Enter');
  await expect(content).toBeFocused();
  await expect
    .poll(() =>
      content.evaluate((node) => ({ start: node.selectionStart, end: node.selectionEnd })),
    )
    .toEqual({ start: 8, end: 22 });
});

test('template replacement can be undone and drafts survive reloads', async ({ page }) => {
  const content = page.locator('#contentInput');
  const initialContent = await content.inputValue();

  await page.locator('#templateSelect').selectOption('location');
  await expect(content).not.toHaveValue(initialContent);
  await expect(page.locator('#undoConfigButton')).toBeEnabled();
  await page.locator('#undoConfigButton').click();
  await expect(content).toHaveValue(initialContent);
  await expect(page.locator('#undoConfigButton')).toBeDisabled();

  const draftContent = '&aBrowser draft {fps}';
  await content.fill(draftContent);
  await page.waitForTimeout(400);
  await page.reload();
  await expect(content).toHaveValue(draftContent);
  await expect(page.locator('#toast')).toContainText('草稿');

  await page.setViewportSize({ width: 767, height: 900 });
  const previewBody = page.locator('#previewBody');
  const previewToggle = page.locator('#togglePreviewButton');
  await expect(previewToggle).toBeVisible();
  await previewToggle.click();
  await expect(previewBody).toBeHidden();
  await expect(previewToggle).toHaveAttribute('aria-expanded', 'false');
});

for (const width of [1280, 767, 719, 360]) {
  test(`layout keeps the editor visible without sticky overlap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();

    const form = await page.locator('.form-panel').boundingBox();
    const preview = await page.locator('.preview-panel').boundingBox();
    expect(form).toBeTruthy();
    expect(preview).toBeTruthy();
    if (width > 880) expect(form.x).toBeLessThan(preview.x);
    else expect(preview.y).toBeLessThan(form.y);
    await expect(page.locator('.preview-panel')).toHaveCSS('position', 'sticky');

    const content = page.locator('#contentInput');
    await content.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    const contentBox = await content.boundingBox();
    const stickyBox = await page.locator('.preview-panel').boundingBox();
    expect(contentBox).toBeTruthy();
    expect(stickyBox).toBeTruthy();
    const overlaps =
      contentBox.x < stickyBox.x + stickyBox.width &&
      contentBox.x + contentBox.width > stickyBox.x &&
      contentBox.y < stickyBox.y + stickyBox.height &&
      contentBox.y + contentBox.height > stickyBox.y;
    expect(overlaps).toBe(false);
  });
}
