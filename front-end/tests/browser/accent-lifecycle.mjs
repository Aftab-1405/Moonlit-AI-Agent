import fs from 'node:fs/promises';
import { connect } from './accent-cdp.mjs';
await fs.mkdir('qa-output/accent-flow-qa', { recursive: true });
const c = await connect(),
  checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
let second, target;
try {
  await c.call('Emulation.setDeviceMetricsOverride', {
    width: 1158,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await c.navigate('http://127.0.0.1:5173/tests/fixtures/accent-flow.html');
  await c.until('!!window.accentQA');
  await c.js(`accentQA.set('dark','purple');accentQA.chart(true)`);
  await c.until('window.accentChartReady===true');
  await c.js(
    `window.retainedEditor=document.querySelector('.cm-editor');window.retainedChart=document.querySelector('perspective-viewer');null`,
  );
  await c.js(`retainedChart.restore({plugin:'Y Bar',group_by:['region'],columns:['sales']})`);
  await c.click('.cm-content');
  await c.key('End', 'End', 35);
  await c.call('Input.insertText', { text: ' -- local edit' });
  const code = await c.js(`document.querySelector('.cm-content').textContent`);
  await c.click('textarea[aria-label="Message Moonlit"]');
  await c.call('Input.insertText', { text: 'Retained fixture draft' });
  await c.js(`accentQA.set('light','blue')`);
  await c.until(`accentQA.palette.mode==='light'`);
  await c.wait(350);
  check(
    'mode/accent retain editor and chart instances',
    await c.js(
      `retainedEditor===document.querySelector('.cm-editor')&&retainedChart===document.querySelector('perspective-viewer')`,
    ),
  );
  check(
    'mode/accent retain code and composer draft',
    await c.js(
      `document.querySelector('.cm-content').textContent===${JSON.stringify(code)}&&document.querySelector('textarea[aria-label="Message Moonlit"]').value==='Retained fixture draft'`,
    ),
  );
  const config = await c.js(`retainedChart.save()`);
  check(
    'chart plugin/grouping retained',
    config.plugin === 'Y Bar' && config.group_by[0] === 'region',
    config,
  );
  await c.js(
    `accentQA.appearancePatch({uiFontSize:16,contentFontSize:20,codeFontSize:18,reducedMotion:'on'})`,
  );
  await c.wait(300);
  const sizes = await c.js(
    `({ui:getComputedStyle(document.documentElement).fontSize,content:getComputedStyle(document.querySelector('[data-testid=user-message]')).fontSize,code:getComputedStyle(document.querySelector('.cm-content')).fontSize,motion:document.documentElement.getAttribute('data-moonlit-reduced-motion')})`,
  );
  check(
    'content/code font sizes reach actual consumers',
    sizes.content === '20px' && sizes.code === '18px',
    sizes,
  );
  check('explicit reduced motion applied', sizes.motion === 'true');
  await c.js(`accentQA.appearancePatch({reducedMotion:'system'})`);
  await c.call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await c.until(`document.documentElement.getAttribute('data-moonlit-reduced-motion')==='true'`);
  await c.call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await c.until(`document.documentElement.getAttribute('data-moonlit-reduced-motion')==='false'`);
  check('system reduced-motion listener updates', true);
  await c.js(`accentQA.appearancePatch({mode:'system'})`);
  await c.call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' }],
  });
  await c.until(`accentQA.palette.mode==='dark'`);
  await c.call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }],
  });
  await c.until(`accentQA.palette.mode==='light'`);
  check('System mode follows OS changes', true);
  target = (
    await c.call('Target.createTarget', {
      url: 'http://127.0.0.1:5173/tests/fixtures/accent-flow.html',
    })
  ).targetId;
  second = await connect(target);
  await second.until('!!window.accentQA');
  check(
    'new tab loads stored profile',
    await second.js(
      `accentQA.appearance.profiles.light.accent==='blue' && accentQA.appearance.codeFontSize===18`,
    ),
  );
  await second.js(`accentQA.set('dark','purple')`);
  await c.until(
    `accentQA.appearance.mode==='dark'&&accentQA.appearance.profiles.dark.accent==='purple'`,
  );
  check(
    'cross-tab appearance sync preserves existing editor/draft',
    await c.js(
      `retainedEditor===document.querySelector('.cm-editor')&&document.querySelector('textarea[aria-label="Message Moonlit"]').value==='Retained fixture draft'`,
    ),
  );
  await second.call('Page.reload');
  await second.wait(300);
  await second.until(`!!window.accentQA&&accentQA.appearance.profiles.dark.accent==='purple'`);
  check('reload retains committed profile', true);
} catch (e) {
  check('runner', false, e.stack);
}
if (second) second.close();
if (target) await c.call('Target.closeTarget', { targetId: target });
await fs.writeFile('qa-output/accent-flow-qa/lifecycle.json', JSON.stringify(checks, null, 2));
console.log(JSON.stringify(checks, null, 2));
c.close();
if (checks.some((c) => !c.pass)) process.exitCode = 1;
