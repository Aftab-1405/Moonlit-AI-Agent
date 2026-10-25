/** Run against local Vite only. Uses an already-installed Playwright, never installs dependencies. */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.MOONLIT_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.MOONLIT_TEST_URL || 'http://localhost:5173';
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname),
  'Only local synthetic fixtures are allowed',
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.MOONLIT_CHROME_PATH ? { executablePath: process.env.MOONLIT_CHROME_PATH } : {}),
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/tests/fixtures/perspective-engine.html`);
  await page.waitForFunction(() => window.engineReady);
  const metrics = await page.evaluate(async () => {
    const { createPerspectiveSession, createPerspectiveWorker, buildPerspectiveData } =
      window.analysis;
    const workerStarted = performance.now();
    const owner = await createPerspectiveWorker();
    const workerInitMs = performance.now() - workerStarted;
    const viewer = document.querySelector('perspective-viewer');
    const timings = [];
    let releaseClient;
    let clientStarted;
    const began = new Promise((resolve) => {
      clientStarted = resolve;
    });
    const session = createPerspectiveSession({
      viewer,
      createClient: () => {
        clientStarted();
        return new Promise((resolve) => {
          releaseClient = () => resolve(owner);
        });
      },
      onMetrics: (value) => timings.push(value),
    });
    const obsolete = session.load({
      schema: { n: 'integer' },
      columnar: { n: [1] },
      key: 'obsolete',
    });
    await began;
    const latest = session.load({ schema: { n: 'integer' }, columnar: { n: [2] }, key: 'latest' });
    releaseClient();
    if ((await obsolete) !== false || (await latest) !== true)
      throw Error('Worker initialization supersession failed');
    if ((await (await viewer.getView()).to_json())[0].n !== 2)
      throw Error('Obsolete snapshot rendered');
    await session.load({
      schema: { n: 'integer' },
      columnar: { n: [] },
      key: 'empty',
      fallbackConfig: { plugin: 'Datagrid' },
    });
    if ((await (await viewer.getView()).to_json()).length !== 0)
      throw Error('Empty result retained old rows');
    // Different analyses must not inherit filters; corrupt saved settings recover.
    const scopeFixture = {
      schema: { n: 'integer' },
      columnar: { n: [1, 2, 3] },
      fallbackConfig: { plugin: 'Datagrid' },
    };
    await session.load({ ...scopeFixture, key: 'scope-a' });
    await session.action((element) => element.restore({ filter: [['n', '>', 1]] }));
    await session.load({ ...scopeFixture, key: 'scope-a' });
    if ((await (await viewer.getView()).to_json()).length !== 2)
      throw Error('Compatible rerun lost filter');
    await session.load({ ...scopeFixture, key: 'scope-b' });
    if (
      (await viewer.save()).filter.length ||
      (await (await viewer.getView()).to_json()).length !== 3
    )
      throw Error('Unrelated analysis inherited filter');
    let invalidConfig = 0;
    await session.load({
      ...scopeFixture,
      key: 'scope-c',
      config: { filter: [['missing', '>', 1]] },
      onInvalidConfig: () => invalidConfig++,
    });
    if (
      invalidConfig !== 1 ||
      (await viewer.save()).filter.length ||
      (await (await viewer.getView()).to_json()).length !== 3
    )
      throw Error('Invalid saved filter did not recover');
    const source = {
      columns: ['id', 'amount', 'when', 'day', 'nullable'],
      column_metadata: [
        { key: 'id', label: 'id', perspective_type: 'string', encoding: 'integer-string' },
        { key: 'amount', label: 'amount', perspective_type: 'string', encoding: 'decimal-string' },
        {
          key: 'when',
          label: 'when',
          perspective_type: 'string',
          encoding: 'iso8601',
          timezone: 'naive',
        },
        { key: 'day', label: 'day', perspective_type: 'date', encoding: 'iso8601' },
        { key: 'nullable', label: 'nullable', perspective_type: 'boolean' },
      ],
      rows: [
        ['9007199254740993', '1.00000000000000000001', '2026-10-23T12:34:56', '2026-10-23', null],
      ],
    };
    const initial = buildPerspectiveData(source);
    await session.load({ ...initial, key: 'source', fallbackConfig: { plugin: 'Datagrid' } });
    const view = await viewer.getView();
    const values = await view.to_json();
    if (
      values[0].id !== '9007199254740993' ||
      values[0].amount !== '1.00000000000000000001' ||
      values[0].when !== '2026-10-23T12:34:56' ||
      values[0].day !== Date.UTC(2026, 9, 23)
    )
      throw Error('Exact or temporal value changed');
    // The borrowed viewer view belongs to the viewer; never delete it directly.
    const typed = buildPerspectiveData({
      columns: ['left', 'right', 'wide', 'aware', 'empty'],
      column_metadata: [
        { label: 'id', perspective_type: 'integer' },
        { label: 'id', perspective_type: 'integer' },
        { label: 'Long column label '.repeat(12), perspective_type: 'float' },
        { label: 'aware', perspective_type: 'string', encoding: 'iso8601', timezone: 'offset' },
        { label: 'empty', perspective_type: 'boolean' },
      ],
      rows: [[2147483647, -2147483648, 2147483648, '2026-10-23T12:34:56.123456+05:30', null]],
    });
    await session.load({ ...typed, key: 'typed', fallbackConfig: { plugin: 'Datagrid' } });
    const typedRows = await (await viewer.getView()).to_json();
    const typedValues = Object.values(typedRows[0]);
    if (
      typedValues[0] !== 2147483647 ||
      typedValues[1] !== -2147483648 ||
      typedValues[2] !== 2147483648 ||
      typedValues[3] !== '2026-10-23T12:34:56.123456+05:30' ||
      typedValues[4] !== null
    )
      throw Error('Typed or duplicate columns changed');
    const analysis = buildPerspectiveData({
      columns: ['group', 'bucket', 'amount'],
      rows: [
        ['A', 'x', 1],
        ['A', 'y', 2],
        ['B', 'x', 3],
      ],
    });
    await session.load({ ...analysis, key: 'analysis', fallbackConfig: { plugin: 'Datagrid' } });
    await session.action(async (element) => {
      await element.restore({
        plugin: 'Datagrid',
        group_by: ['group'],
        split_by: ['bucket'],
        columns: ['amount'],
        aggregates: { amount: 'sum' },
        filter: [['amount', '>', 1]],
      });
      await element.flush();
      const pivot = await (await element.getView()).to_json();
      if (pivot[0]['x|amount'] !== 3 || pivot[0]['y|amount'] !== 2)
        throw Error('Filtered pivot totals incorrect');
      await element.restore({
        group_by: [],
        split_by: [],
        filter: [],
        sort: [['amount', 'desc']],
        expressions: { double_amount: '"amount" * 2' },
        columns: ['amount', 'double_amount'],
      });
      await element.flush();
      const expression = await (await element.getView()).to_json();
      if (expression[0].amount !== 3 || expression[0].double_amount !== 6)
        throw Error('Sort/expression incorrect');
      await element.restore({
        plugin: 'Y Bar',
        group_by: ['group'],
        sort: [],
        columns: ['amount'],
      });
      await element.flush();
      if ((await element.save()).plugin !== 'Y Bar' || !(await element.getPlugin()).isConnected)
        throw Error('Chart plugin not rendered');
    });
    // Same schema reruns preserve the active analysis configuration.
    await session.load({ ...analysis, key: 'analysis', fallbackConfig: { plugin: 'Datagrid' } });
    if ((await viewer.save()).plugin !== 'Y Bar') throw Error('Rerun lost chart settings');
    const results = [];
    for (const [name, rows, cols] of [
      ['narrow', 10000, 2],
      ['wide', 2000, 60],
      ['numeric', 10000, 4],
      ['text-heavy', 2000, 8],
    ]) {
      const data = {
        columns: Array.from({ length: cols }, (_, i) => `column_${i}`),
        rows: Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) =>
            name === 'text-heavy'
              ? `fixture-${r}-${c}-${'x'.repeat(512)}`
              : name === 'numeric'
                ? r + c / 10
                : r + c,
          ),
        ),
      };
      const serialized = JSON.stringify(data);
      const parseStart = performance.now();
      const parsed = JSON.parse(serialized);
      const transformStart = performance.now();
      const built = buildPerspectiveData(parsed);
      const loadStart = performance.now();
      await session.load({ ...built, key: name, fallbackConfig: { plugin: 'Datagrid' } });
      const usable = performance.now();
      const tables = await owner.client.get_hosted_table_names();
      if (tables.length !== 1) throw Error(`Retained ${tables.length} tables after ${name}`);
      results.push({
        name,
        rows,
        columns: cols,
        payload_bytes: new TextEncoder().encode(serialized).length,
        parse_ms: transformStart - parseStart,
        transformation_ms: loadStart - transformStart,
        perspective_load_ms: usable - loadStart,
      });
    }
    for (let i = 0; i < 12; i++) {
      const built = buildPerspectiveData({ columns: [i % 2 ? 'a' : 'b'], rows: [[i]] });
      await session.load({ ...built, key: String(i), fallbackConfig: { plugin: 'Datagrid' } });
      if ((await owner.client.get_hosted_table_names()).length !== 1)
        throw Error('Obsolete table retained');
    }
    await session.dispose();
    return {
      fixtures: results,
      workerInitMs,
      engineTimings: timings,
      exactValues: true,
      typedColumns: true,
      analysisFeatures: true,
      schemaChanges: 12,
    };
  });
  await page.waitForTimeout(100);
  assert.deepEqual(errors, []);
  // 4.5.1's charts package intentionally retains one shared renderer until
  // page teardown; result/session workers must still be gone.
  assert.deepEqual(
    await Promise.all(page.workers().map((worker) => worker.evaluate(() => self.name))),
    ['viewer-charts'],
  );
  await page.goto(`${base}/tests/fixtures/perspective-component.html`);
  await page.waitForFunction(() => window.componentFixtureReady);
  await page.evaluate(() => window.showSnapshot({ columns: ['x'], rows: [[9007199254740992]] }));
  await page.getByRole('button', { name: 'Retry analysis' }).waitFor();
  await page.evaluate(() =>
    window.showSnapshot({
      columns: ['x'],
      rows: [[42]],
      column_metadata: [{ key: 'x', label: 'x', perspective_type: 'integer' }],
      result_metadata: {
        execution_id: 'fixture-export',
        completeness: 'truncated',
        effective_limit: 1,
        returned_rows: 1,
      },
    }),
  );
  await page.getByRole('button', { name: 'Retry analysis' }).click();
  await page.waitForFunction(() => window.fixtureState.ready);
  const componentMetrics = await page.evaluate(() => window.fixtureState.metrics);
  await page.evaluate(async () => {
    await window.dashboardRef.current.applyConfig({ settings: true });
    const viewer = document.querySelector('perspective-viewer');
    await viewer.flush();
    for (const id of ['export', 'copy']) {
      const button = viewer.shadowRoot.querySelector(`#${id}`);
      if (!button || getComputedStyle(button.parentElement).display !== 'none')
        throw Error('Raw export bypass remains visible');
    }
    if (!viewer.shadowRoot.querySelector('#reset')) throw Error('Analysis controls removed');
  });
  const downloads = [];
  const exported = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('View export did not produce both files')),
      10000,
    );
    page.on('download', (download) => {
      downloads.push(download);
      if (downloads.length === 2) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  await page.evaluate(() => window.dashboardRef.current.download());
  await exported;
  const sidecar = downloads.find((download) =>
    download.suggestedFilename().endsWith('.metadata.json'),
  );
  assert.ok(sidecar, 'View export must include provenance');
  const stream = await sidecar.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const provenance = JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(provenance.result_metadata.execution_id, 'fixture-export');
  assert.equal(provenance.result_metadata.completeness, 'truncated');
  assert.equal(provenance.view_config.plugin, 'Datagrid');
  const visualizationFiles = Promise.all([
    page.waitForEvent('download', {
      predicate: (download) => download.suggestedFilename().endsWith('-visualization.png'),
    }),
    page.waitForEvent('download', {
      predicate: (download) =>
        download.suggestedFilename().endsWith('-visualization.metadata.json'),
    }),
  ]);
  await page.evaluate(async () => {
    await window.dashboardRef.current.applyConfig({
      plugin: 'Y Bar',
      group_by: ['x'],
      columns: ['x'],
    });
    await window.dashboardRef.current.exportVisualization();
  });
  const [chartFile] = await visualizationFiles;
  assert.equal(chartFile.suggestedFilename(), 'query-fixture-export-truncated-visualization.png');
  await page.evaluate(() => window.closeSnapshot());
  await page.waitForTimeout(300);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    await Promise.all(page.workers().map((worker) => worker.evaluate(() => self.name))),
    ['viewer-charts'],
    'Only the library shared chart renderer may remain',
  );
  console.log(
    JSON.stringify(
      {
        ...metrics,
        componentMetrics,
        componentRetry: true,
        exportMetadata: true,
        chartExport: true,
        sharedChartWorkerUntilNavigation: true,
        remainingResultWorkers: page.workers().filter((worker) => !worker.url().startsWith('blob:'))
          .length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
