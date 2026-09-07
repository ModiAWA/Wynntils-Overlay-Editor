const path = require('node:path');
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
  await expect(page.locator('h1#pageTitle')).toHaveText('Wynntils Overlay Editor');
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
  await expect(page.locator('#wynntils-overlay-editor')).toHaveAttribute('lang', 'en');
  await expect(status).toHaveText('Preview contains placeholders for: ability_cooldown');
});

test('preview grows for long content and scales long lines into the frame', async ({ page }) => {
  const content = page.locator('#contentInput');
  const frame = page.locator('.preview-frame');
  const canvas = page.locator('#overlayPreview');
  const baseHeight = (await frame.boundingBox()).height;

  await content.fill(Array.from({ length: 30 }, (_, index) => `Line ${index} {fps}`).join('\n'));
  await expect.poll(async () => (await frame.boundingBox()).height).toBeGreaterThan(baseHeight);
  const expanded = await frame.boundingBox();
  const expandedCanvas = await canvas.boundingBox();
  expect(expandedCanvas.height).toBe(expanded.height);

  await content.fill('A'.repeat(500));
  await expect(frame).not.toHaveClass(/is-fit-scaled/);

  await page.locator('#advancedSettings').evaluate((node) => {
    node.open = true;
  });
  await page.locator('#fitTextInput').evaluate((node) => node.click());
  await expect(page.locator('#fitTextInput')).toBeChecked();
  await expect(frame).toHaveClass(/is-fit-scaled/);
  await page.setViewportSize({ width: 700, height: 900 });
  await page.waitForTimeout(50);
  const mobile = await frame.boundingBox();
  expect(mobile.width).toBeLessThanOrEqual(700);
  expect(
    await page.locator('#wynntils-overlay-editor').evaluate((node) => node.scrollWidth),
  ).toBeLessThanOrEqual(700);
});

test('host integration exposes the language API and accepts an external control', async ({
  page,
}) => {
  await expect(page.locator('#wynntils-overlay-editor')).toBeVisible();
  await expect(page.locator('#wynntils-overlay-editor')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('[data-editor-language-control]')).toHaveCount(1);
  const apiKeys = await page.evaluate(() => Object.keys(window.WynntilsOverlayEditor).sort());
  expect(apiKeys).toEqual(['getLanguage', 'refresh', 'setLanguage', 'toggleLanguage']);

  await page.evaluate(() => {
    document.documentElement.lang = 'fr';
    const mount = document.createElement('div');
    mount.dataset.editorLanguageControl = '';
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'hostLanguageButton';
    button.textContent = 'host';
    button.addEventListener('click', () => window.WynntilsOverlayEditor.toggleLanguage());
    mount.append(button);
    document.body.prepend(mount);
  });
  await page.locator('#hostLanguageButton').click();
  await expect(page.locator('#wynntils-overlay-editor')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  expect(await page.evaluate(() => window.WynntilsOverlayEditor.getLanguage())).toBe('en');
  expect(await page.evaluate(() => window.WynntilsOverlayEditor.setLanguage('invalid'))).toBe('en');
  await page.evaluate(() => window.WynntilsOverlayEditor.setLanguage('zh'));
  await expect(page.locator('#wynntils-overlay-editor')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test('standalone editor background covers the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1600 });
  const appearance = await page.locator('#wynntils-overlay-editor').evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      minHeight: Number.parseFloat(style.minHeight),
      backgroundImage: style.backgroundImage,
    };
  });
  expect(appearance.minHeight).toBeGreaterThanOrEqual(1600);
  expect(appearance.backgroundImage).not.toBe('none');
});

test('host theme variables propagate through editor surfaces and text', async ({ page }) => {
  const values = await page.evaluate(() => {
    const root = document.querySelector('#wynntils-overlay-editor');
    root.style.setProperty('--woe-surface', 'rgb(1, 2, 3)');
    root.style.setProperty('--woe-input', 'rgb(4, 5, 6)');
    root.style.setProperty('--woe-text', 'rgb(7, 8, 9)');
    root.style.setProperty('--woe-accent', 'rgb(10, 11, 12)');
    root.style.setProperty('--woe-dialog', 'rgb(13, 14, 15)');
    return {
      panel: getComputedStyle(document.querySelector('.form-panel')).backgroundColor,
      input: getComputedStyle(document.querySelector('#templateSelect')).backgroundColor,
      dialog: getComputedStyle(document.querySelector('.ai-dialog')).backgroundColor,
      text: getComputedStyle(document.querySelector('.field-label')).color,
      accent: getComputedStyle(document.querySelector('.language-button')).color,
    };
  });
  expect(values).toEqual({
    panel: 'rgb(1, 2, 3)',
    input: 'rgb(4, 5, 6)',
    dialog: 'rgb(13, 14, 15)',
    text: 'rgb(7, 8, 9)',
    accent: 'rgb(10, 11, 12)',
  });
});

test('assetBase reroutes bundled font requests for host deployments', async ({ page }) => {
  const assetRequests = [];
  const fontAssetDirectory = path.join(__dirname, '../../assets/fonts');
  await page.route('**/overlay/assets/fonts/*.png*', (route) => {
    const filename = path.basename(new URL(route.request().url()).pathname);
    return route.fulfill({ path: path.join(fontAssetDirectory, filename) });
  });
  page.on('request', (request) => {
    if (request.url().includes('/overlay/assets/fonts/')) assetRequests.push(request.url());
  });
  await page.evaluate(() => {
    window.WynntilsOverlayEditorConfig.assetBase = '/overlay';
    return window.WynntilsOverlayEditor.refresh();
  });
  await expect
    .poll(() => assetRequests.some((url) => url.includes('/overlay/assets/fonts/five.png?v=')))
    .toBe(true);
  expect(
    await page.evaluate(() =>
      window.WynntilsCanvasRenderer.resolveAssetPath('assets/fonts/five.png'),
    ),
  ).toContain('/overlay/assets/fonts/five.png');
});

test('preview height remains bounded for large valid input', async ({ page }) => {
  const frame = page.locator('.preview-frame');
  await page.locator('#contentInput').fill(`A${'\n'.repeat(4095)}`);
  await expect.poll(async () => (await frame.boundingBox()).height).toBeLessThanOrEqual(2048);
});

test('preview explains when simulated output is truncated without invalidating content', async ({
  page,
}) => {
  await page.locator('#contentInput').fill('x'.repeat(5000));
  await expect(page.locator('#previewStatus')).toContainText('4096');
  await expect(page.locator('#previewStatus')).toContainText('实际');
  await expect(page.locator('#validationMessage')).toContainText('可以复制');
});

test('editor grid follows its host container width', async ({ page }) => {
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'narrow-host';
    host.style.width = '400px';
    host.style.position = 'absolute';
    host.style.left = '-10000px';
    const editor = document.querySelector('#wynntils-overlay-editor');
    host.append(editor);
    document.body.append(host);
  });
  await expect(page.locator('.editor-grid')).toHaveCSS('grid-template-columns', '368px');
  await expect(page.locator('.editor-grid')).toHaveCSS(
    'grid-template-areas',
    '"preview" "form" "search"',
  );
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
    await expect(page.locator('.preview-panel')).toHaveCSS(
      'position',
      width > 880 ? 'sticky' : 'relative',
    );

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

for (const width of [1440, 768, 700]) {
  test(`host layout remains responsive and body remains scrollable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.reload();
    const boxes = await page.evaluate(() => {
      const form = document.querySelector('.form-panel').getBoundingClientRect();
      const preview = document.querySelector('.preview-panel').getBoundingClientRect();
      return {
        form,
        preview,
        bodyOverflow: getComputedStyle(document.body).overflow,
        rootWidth: document.querySelector('#wynntils-overlay-editor').getBoundingClientRect().width,
      };
    });
    expect(boxes.rootWidth).toBeLessThanOrEqual(width);
    expect(boxes.bodyOverflow).not.toBe('hidden');
    if (width >= 880) expect(boxes.form.x).toBeLessThan(boxes.preview.x);
    else expect(boxes.preview.y).toBeLessThan(boxes.form.y);
  });
}
