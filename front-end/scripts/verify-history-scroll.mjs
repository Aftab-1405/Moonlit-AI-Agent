/** Real-browser regression over synthetic data; no account or database access. */
import assert from 'node:assert/strict';

const playwright = await import(
  process.env.MOONLIT_PLAYWRIGHT_PATH || process.argv[2] || 'playwright'
);
const { chromium } = playwright.default || playwright;
const base = process.env.MOONLIT_TEST_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname));
console.log('Launching synthetic browser check');
const browser = await chromium.launch({
  headless: true,
  timeout: 15000,
  executablePath: process.env.MOONLIT_CHROME_PATH || '/usr/bin/google-chrome',
});
try {
  const width = Number(process.argv[3] || 1000);
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  let releaseHistory;
  let historyRequests = 0;
  const total = 96;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('get_all_user_conversations')) {
      return route.fulfill({ json: { status: 'success', conversations: [] } });
    }
    if (url.pathname.includes('get_conversation/')) {
      const id = url.pathname.split('/').at(-1);
      const end = url.searchParams.has('before')
        ? Number(url.searchParams.get('before').slice(1))
        : id === 'other'
          ? 3
          : total;
      const start = Math.max(0, end - Number(url.searchParams.get('limit') || 30));
      if (url.searchParams.has('before')) {
        historyRequests++;
        await new Promise((resolve) => {
          releaseHistory = resolve;
        });
      }
      return route.fulfill({
        json: {
          status: 'success',
          conversation: {
            id,
            title: 'Synthetic transcript',
            first_user_message: 'Message 0',
            messages: Array.from({ length: end - start }, (_, i) => ({
              id: `${id}-${start + i}`,
              sender: 'user',
              content: `Message ${start + i}: ${'Variable-height transcript content. '.repeat(1 + ((start + i) % 6))}`,
            })),
            pagination: { has_more: start > 0, before: start ? `b${start}` : null },
          },
        },
      });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto(`${base}/tests/fixtures/history-scroll.html`);
  console.log('Fixture opened');
  const scroller = page.locator('[data-chat-scroll-container]');
  await page.locator('[data-message-id="demo-95"]').waitFor();
  console.log('Latest messages mounted');
  const atBottom = () =>
    scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 3);
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-chat-scroll-container]');
    return el && el.scrollHeight - el.scrollTop - el.clientHeight < 3;
  });
  assert.equal(await page.getByRole('navigation', { name: 'Transcript pages' }).count(), 0);
  // Read near the top and move further while the history request is pending.
  await scroller.evaluate((el) => {
    el.scrollTop = 100;
  });
  await page.waitForFunction(() =>
    document.querySelector('[role="status"]')?.textContent.includes('Loading older'),
  );
  assert.equal(historyRequests, 1);
  await scroller.evaluate((el) => {
    el.scrollTop = 250;
  });
  const anchor = await scroller.evaluate((el) => {
    const top = el.getBoundingClientRect().top;
    const node = [...el.querySelectorAll('[data-message-id]')].find(
      (node) => node.getBoundingClientRect().bottom > top,
    );
    return { id: node.dataset.messageId, offset: node.getBoundingClientRect().top - top };
  });
  releaseHistory();
  await page.locator('[data-message-id="demo-36"]').waitFor();
  await page.waitForFunction(
    () => !document.querySelector('[data-chat-scroll-container]').dataset.historyPrepending,
  );
  const offset = await page
    .locator(`[data-message-id="${anchor.id}"]`)
    .evaluate(
      (node) =>
        node.getBoundingClientRect().top -
        node.closest('[data-chat-scroll-container]').getBoundingClientRect().top,
    );
  assert.ok(
    Math.abs(offset - anchor.offset) < 3,
    `Prepend moved anchor ${offset - anchor.offset}px`,
  );
  // Reach the oldest page without skipping/duplicating messages or fetching forever.
  for (const firstId of ['demo-6', 'demo-0']) {
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.getByRole('status').filter({ hasText: 'Loading older messages' }).waitFor();
    releaseHistory();
    await page.locator(`[data-message-id="${firstId}"]`).waitFor();
    await page.waitForFunction(
      () => !document.querySelector('[data-chat-scroll-container]').dataset.historyPrepending,
    );
  }
  assert.equal(await page.locator('[data-message-id^="demo-"]').count(), 96);
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.equal(historyRequests, 3);
  // Streaming below the reader does not steal the scroll position.
  const beforeStream = await scroller.evaluate((el) => el.scrollTop);
  await page.getByRole('button', { name: 'Append reply', exact: true }).click();
  await page.getByText('Live reply', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Stream token', exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-message-id^="live-"]')?.textContent.includes('Another streaming'),
  );
  assert.ok(
    Math.abs((await scroller.evaluate((el) => el.scrollTop)) - beforeStream) < 3,
    'Streaming stole reading position',
  );
  // Explicit jump and subsequent tokens follow the bottom.
  await page.getByRole('button', { name: 'Jump to latest', exact: true }).click();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-chat-scroll-container]');
    return el.scrollHeight - el.scrollTop - el.clientHeight < 3;
  });
  await page.getByRole('button', { name: 'Stream token', exact: true }).click();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-chat-scroll-container]');
    return el.scrollHeight - el.scrollTop - el.clientHeight < 3;
  });
  assert.equal(await atBottom(), true);
  // A different conversation must not inherit the old scroll position or history.
  await page.getByRole('button', { name: 'Other conversation', exact: true }).click();
  await page.locator('[data-message-id="other-2"]').waitFor();
  assert.equal(await page.locator('[data-message-id^="demo-"]').count(), 0);
  assert.equal(await page.locator('[data-message-id^="live-"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: 'passed',
        viewportWidth: width,
        historyRequests,
        anchorDriftPx: offset - anchor.offset,
        checks: [
          'continuous transcript',
          'cursor fetch',
          'prepend anchor',
          'scroll during fetch',
          'history exhaustion',
          'uninterrupted streaming',
          'jump to latest',
          'session switch',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
