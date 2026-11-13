import fs from 'node:fs/promises';
import { connect } from './accent-cdp.mjs';
const c = await connect(),
  checks = [],
  metrics = {};
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
const rangeRect = async (label) => {
  const selector = `input[aria-label="${label}"]`;
  await c.js(
    `document.querySelector('${selector}').scrollIntoView({block:'center',behavior:'instant'})`,
  );
  return c.js(`document.querySelector('${selector}').getBoundingClientRect().toJSON()`);
};
const pointer = async (type, r, f) =>
  c.call('Input.dispatchMouseEvent', {
    type,
    x: r.x + 8 + (r.width - 16) * f,
    y: r.y + r.height / 2,
    button: 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: 1,
  });
const setRange = async (label, f) => {
  const r = await rangeRect(label);
  await pointer('mousePressed', r, f);
  await pointer('mouseReleased', r, f);
  await c.wait(200);
};
try {
  await c.call('Emulation.setDeviceMetricsOverride', {
    width: 1158,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await c.navigate('http://127.0.0.1:5173/tests/fixtures/accent-flow.html');
  await c.until('!!window.accentQA');
  await c.js(`accentQA.set('dark','custom','moonlit','#808080');accentQA.chart(true)`);
  await c.until('window.accentChartReady===true');
  await c.js(`accentQA.appearancePatch({separateModes:true});accentQA.open(true)`);
  await c.wait(250);
  await c.click('input[aria-label="Search settings"]');
  await c.call('Input.insertText', { text: 'font' });
  await c.key('Enter', 'Enter', 13);
  await c.until(`document.activeElement?.getAttribute('aria-label')==='UI font size'`);
  await c.until(`!!document.querySelector('.MuiCollapse-entered')`);
  check('inactive profile selectors use readable profile ink', await c.js(`getComputedStyle(document.querySelector('[role=combobox][aria-label="light accent"]')).color==='rgb(13, 13, 13)'`));
  await c.click('button[aria-label="light custom accent color"]');
  await c.until(`!!document.querySelector('input[aria-label="Hue"]')`);
  await c.wait(200);
  await setRange('Hue', 2 / 3);
  check(
    'hue-only edit keeps gray neutral',
    await c.js(`accentQA.appearance.profiles.light.customAccent==='#808080'`),
  );
  await setRange('Saturation', 0.85);
  await setRange('Brightness', 0.8);
  check(
    'gray-to-blue workflow commits actual saturation/brightness',
    await c.js(
      `(()=>{const x=accentQA.appearance.profiles.light.customAccent;return parseInt(x.slice(5),16)>parseInt(x.slice(1,3),16)*2})()`,
    ),
  );
  const before = await c.js(
    `({appearance:JSON.stringify(accentQA.appearance),active:accentQA.palette.accent.base,preview:getComputedStyle(document.querySelector('[aria-label="light accent preview"] span')).backgroundColor,editor:document.querySelector('.cm-content').textContent})`,
  );
  const r = await rangeRect('Brightness');
  await pointer('mousePressed', r, 0.35);
  await pointer('mouseMoved', r, 0.6);
  await c.wait(120);
  const during = await c.js(
    `(()=>{const group=document.querySelector('[aria-label="light theme settings"]'),sample=group.querySelector('[aria-label="light accent preview"]');return {appearance:JSON.stringify(accentQA.appearance),active:accentQA.palette.accent.base,bg:getComputedStyle(sample.querySelector('span')).backgroundColor,ink:getComputedStyle(sample.querySelector('span')).color,selection:getComputedStyle(sample.querySelector('span'),'::selection').backgroundColor,variable:group.style.getPropertyValue('--profile-selection'),editor:document.querySelector('.cm-content').textContent}})()`,
  );
  check(
    'inactive-profile preview changes bubble without storage/global/editor changes',
    during.bg !== before.preview &&
      during.appearance === before.appearance &&
      during.active === before.active &&
      during.editor === before.editor,
    during,
  );
  await c.key('Escape', 'Escape', 27);
  await pointer('mouseReleased', r, 0.6);
  await c.until(`!document.querySelector('[role=dialog][aria-label="light custom accent picker"]')`);
  check(
    'Escape restores custom preview without committing',
    await c.js(
      `JSON.stringify(accentQA.appearance)===${JSON.stringify(before.appearance)} && getComputedStyle(document.querySelector('[aria-label="light accent preview"] span')).backgroundColor===${JSON.stringify(before.preview)}`,
    ),
  );
  const shot = await c.call('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(
    'docs/accent-flow-qa/custom-profile-preview.png',
    Buffer.from(shot.data, 'base64'),
  );
  // Profile the active profile commit with the transcript, composer, editor and chart mounted.
  await c.click('button[aria-label="dark custom accent color"]');
  await c.until(`!!document.querySelector('input[aria-label="Brightness"]')`);
  await c.wait(200);
  const drag = await rangeRect('Brightness');
  await c.js(
    `(()=>{window.accentPerf={commits:[],frames:[],longTasks:[],writes:[],themes:0};window.perfPalette=accentQA.palette;window.perfRunning=true;const original=Storage.prototype.setItem;window.restoreStorage=()=>{Storage.prototype.setItem=original};Storage.prototype.setItem=function(k,v){accentPerf.writes.push(k);return original.call(this,k,v)};window.perfObserver=new PerformanceObserver(list=>{for(const x of list.getEntries())accentPerf.longTasks.push({start:x.startTime,duration:x.duration})});perfObserver.observe({type:'longtask'});let last=performance.now();const frame=t=>{if(!perfRunning)return;accentPerf.frames.push(t-last);last=t;if(perfPalette!==accentQA.palette){accentPerf.themes++;perfPalette=accentQA.palette}requestAnimationFrame(frame)};requestAnimationFrame(frame)})()`,
  );
  await pointer('mousePressed', drag, 0.2);
  for (let i = 0; i < 100; i++) {
    await pointer('mouseMoved', drag, 0.2 + 0.6 * (i < 50 ? i / 49 : (99 - i) / 49));
    await c.wait(25);
  }
  check(
    'active drag does not write settings/rebuild theme',
    await c.js(`accentPerf.writes.length===0&&accentPerf.themes===0`),
  );
  await c.call('Profiler.enable');
  await c.call('Profiler.start');
  await c.js('accentPerf.release=performance.now()');
  await pointer('mouseReleased', drag, 0.2);
  await c.wait(500);
  const profile = (await c.call('Profiler.stop')).profile;
  await fs.writeFile('docs/accent-flow-qa/final-commit.cpuprofile', JSON.stringify(profile));
  Object.assign(
    metrics,
    await c.js(
      `(()=>{perfRunning=false;perfObserver.disconnect();restoreStorage();const p=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length*.95)]||0;return {...accentPerf,reactP95:p(accentPerf.commits.map(x=>x.duration)),frameP95:p(accentPerf.frames),maxLongTask:Math.max(0,...accentPerf.longTasks.map(x=>x.duration))}})()`,
    ),
  );
  check(
    'active gesture commits once',
    metrics.writes.filter((k) => k !== 'moonlit-appearance-boot-v1').length === 1 &&
      metrics.writes.filter((k) => k === 'moonlit-appearance-boot-v1').length === 1 &&
      metrics.themes === 1,
    { writes: metrics.writes, themes: metrics.themes },
  );
  const nodes = new Map(profile.nodes.map((n) => [n.id, n.callFrame]));
  const times = new Map();
  profile.samples.forEach((id, i) => {
    const f = nodes.get(id),
      key = `${f.functionName || '(anonymous)'} @ ${f.url?.split('?')[0].split('/').slice(-1)[0]}:${f.lineNumber + 1}`;
    times.set(key, (times.get(key) || 0) + profile.timeDeltas[i] / 1000);
  });
  metrics.commitHotspots = [...times].sort((a, b) => b[1] - a[1]).slice(0, 15);
} catch (e) {
  check('runner', false, e.stack);
}
await fs.writeFile(
  'docs/accent-flow-qa/preview-performance.json',
  JSON.stringify({ checks, metrics }, null, 2),
);
console.log(
  JSON.stringify(
    {
      checks,
      metrics: {
        reactP95: metrics.reactP95,
        frameP95: metrics.frameP95,
        maxLongTask: metrics.maxLongTask,
        commitHotspots: metrics.commitHotspots,
      },
    },
    null,
    2,
  ),
);
c.close();
if (checks.some((c) => !c.pass)) process.exitCode = 1;
