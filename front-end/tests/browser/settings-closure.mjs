import fs from 'node:fs/promises';
import { connect } from './accent-cdp.mjs';
await fs.mkdir('qa-output/accent-flow-qa', { recursive: true });
const c = await connect(),
  checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
try {
  await c.navigate('http://127.0.0.1:5173/tests/fixtures/accent-flow.html');
  await c.until('!!window.accentQA');
  for (const width of [1158, 767, 768, 390]) {
    await c.call('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await c.js('accentQA.open(false)');
    await c.wait(100);
    await c.js('accentQA.open(true)');
    await c.wait(350);
    const mobile = width < 768;
    check(
      `${width} navigation breakpoint`,
      await c.js(`!!document.querySelector('[aria-label="Show settings navigation"]')===${mobile}`),
    );
    for (const method of ['click', 'enter', 'enter']) {
      if (mobile) {
        await c.click('[aria-label="Show settings navigation"]');
        await c.until(
          `!!document.querySelector('.MuiDrawer-paper input[aria-label="Search settings"]')`,
        );
      }
      const search = 'input[aria-label="Search settings"]';
      await c.click(search);
      await c.key('a', 'KeyA', 65, 2);
      await c.call('Input.insertText', { text: 'font' });
      await c.until(`!!document.querySelector('nav[aria-label="Search results"] button')`);
      if (method === 'click') await c.click('nav[aria-label="Search results"] button');
      else await c.key('Enter', 'Enter', 13);
      await c.until(`document.activeElement?.getAttribute('aria-label')==='UI font size'`);
      await c.until(
        `!!document.querySelector('.MuiCollapse-entered input[aria-label="UI font size"]') && !document.querySelector('.MuiDrawer-paper')`,
      );
      check(
        `${width} ${method} repeated font search focuses revealed input`,
        await c.js(
          `!!document.querySelector('.MuiCollapse-entered input[aria-label="UI font size"]') && !document.querySelector('.MuiDrawer-paper')`,
        ),
      );
    }
    if (mobile) {
      await c.click('[aria-label="Show settings navigation"]');
      await c.wait(250);
      await c.key('Escape', 'Escape', 27);
      await c.until(`!document.querySelector('.MuiDrawer-paper')`);
      check(
        `${width} drawer Escape retains Settings`,
        await c.js(
          `!document.querySelector('section[aria-label="Settings"]').hidden && document.activeElement?.getAttribute('aria-label')==='Show settings navigation'`,
        ),
      );
    }
    check(
      `${width} no horizontal overflow`,
      await c.js(`document.documentElement.scrollWidth<=innerWidth`),
    );
  }
  await c.call('Emulation.setDeviceMetricsOverride', {width:1158,height:1000,deviceScaleFactor:1,mobile:false});
  await c.until(`!!document.querySelector('input[aria-label="Search settings"]')`);
  if (await c.js(`!!document.querySelector('[aria-label="Clear search"]')`)) await c.click('[aria-label="Clear search"]');
  await c.until(`!!document.querySelector('button[aria-current="page"]')`);
  for (const mode of ['light','dark']) {
    const samples=[];
    for (const accent of ['purple','blue']) {
      await c.js(`accentQA.set('${mode}','${accent}')`);
      await c.until(`accentQA.palette.mode==='${mode}'&&accentQA.appearance.profiles.${mode}.accent==='${accent}'`);
      await c.wait(300);
      samples.push(await c.js(`(()=>{const s=getComputedStyle(document.querySelector('button[aria-current="page"]'));return {color:s.color,bg:s.backgroundColor}})()`));
    }
    check(`${mode} actual selected Settings navigation remains neutral across accents`, JSON.stringify(samples[0])===JSON.stringify(samples[1]) && samples.every(s=>{const n=s.color.match(/\d+/g);return n[0]===n[1]&&n[1]===n[2]}), samples);
  }
} catch (e) {
  check('runner', false, e.stack);
}
await fs.writeFile('qa-output/accent-flow-qa/settings-closure.json', JSON.stringify(checks, null, 2));
console.log(JSON.stringify(checks, null, 2));
c.close();
if (checks.some((c) => !c.pass)) process.exitCode = 1;
