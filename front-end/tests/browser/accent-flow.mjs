import fs from 'node:fs/promises';
import { connect } from './accent-cdp.mjs';
const phase = process.argv[2] || 'after';
const out = 'docs/accent-flow-qa';
await fs.mkdir(out, { recursive: true });
const c = await connect();
const checks = [],
  samples = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
try {
  await c.call('Emulation.setDeviceMetricsOverride', {
    width: 1158,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await c.navigate('http://127.0.0.1:5173/tests/fixtures/accent-flow.html');
  await c.until('!!window.accentQA && !!document.querySelector(".cm-content")');
  await c.click('textarea[aria-label="Message Moonlit"]');
  await c.call('Input.insertText', { text: 'Synthetic draft — never submitted' });
  for (const mode of ['light', 'dark'])
    for (const accent of ['purple', 'blue']) {
      await c.js(`accentQA.set('${mode}', '${accent}')`);
      await c.until(
        `accentQA.palette.mode==='${mode}' && accentQA.appearance.profiles.${mode}.accent==='${accent}'`,
      );
      await c.wait(500);
      const sample = await c.js(`(() => {
      const style = (e, pseudo) => { const s = getComputedStyle(e, pseudo); return { bg:s.backgroundColor, color:s.color, fill:s.fill, opacity:s.opacity }; };
      const q = s => document.querySelector(s);
      return {
        mode:'${mode}', accent:'${accent}', palette:accentQA.palette,
        switchTrack:style(q('.MuiSwitch-track')), switchThumb:style(q('.MuiSwitch-thumb')),
        checkbox:style(q('.MuiCheckbox-root')), checkboxSvg:style(q('.MuiCheckbox-root svg')),
        checkboxMarks:[...q('.MuiCheckbox-root svg').children].map(e=>({tag:e.tagName, ...style(e)})),
        radio:style(q('.MuiRadio-root')), radioMark:style(q('.MuiRadio-root [data-accent-mark]') || q('.MuiRadio-root svg')),
        slider:style(q('.MuiSlider-track')), sliderThumb:style(q('.MuiSlider-thumb')), sliderRail:style(q('.MuiSlider-rail')),
        bubble:style(q('[data-testid=user-message]').parentElement), child:style(q('[data-testid=user-message]')),
        assistant:style(q('[data-testid=assistant-text-chunk] p')), link:style(q('[data-testid=assistant-text-chunk] a')),
        selection:['#prose','#selection-input','[data-testid=user-message]'].map(s=>style(q(s),'::selection')),
        send:style(q('button[aria-label="Send message"]')), sendDisabled:q('button[aria-label="Send message"]').disabled,
        neutral:style([...document.querySelectorAll('button')].find(e=>e.textContent==='Neutral action')),
        syntax:[...q('.cm-line').querySelectorAll('span')].map(e=>({text:e.textContent,color:getComputedStyle(e).color})),
        statuses:[...q('#status-controls').querySelectorAll('[data-status]')].map(e=>({status:e.dataset.status,track:style(e.querySelector('.MuiSwitch-track')),thumb:style(e.querySelector('.MuiSwitch-thumb')),checkbox:style(e.querySelector('.MuiCheckbox-root')),marks:[...e.querySelectorAll('[data-accent-mark]')].map(m=>style(m))})),
        disabled:[...q('#disabled-controls').querySelectorAll('.MuiSwitch-track,.MuiSwitch-thumb,.MuiCheckbox-root,.MuiRadio-root')].map(e=>style(e)),
      };
    })()`);
      samples.push(sample);
      if (phase === 'after') {
        const rgb = (hex) =>
          'rgb(' +
          hex
            .slice(1)
            .match(/../g)
            .map((v) => parseInt(v, 16))
            .join(', ') +
          ')';
        const p = sample.palette;
        check(
          `${mode}/${accent} filled switch pair`,
          sample.switchTrack.bg === rgb(p.accent.main) &&
            sample.switchThumb.bg === rgb(p.accent.contrastText),
          sample.switchTrack,
        );
        check(
          `${mode}/${accent} user bubble and child pair`,
          sample.bubble.bg === rgb(p.userMessage.background) &&
            sample.child.color === rgb(p.userMessage.foreground),
          sample.bubble,
        );
        check(
          `${mode}/${accent} selection changes on prose/input/bubble`,
          sample.selection.every(
            (s) =>
              s.bg !== (mode === 'dark' ? 'rgba(237, 237, 237, 0.2)' : 'rgba(13, 13, 13, 0.2)'),
          ) && sample.selection.every((s) => s.bg === sample.selection[0].bg),
          sample.selection,
        );
        check(
          `${mode}/${accent} enabled Send`,
          !sample.sendDisabled &&
            sample.send.bg === rgb(p.composerAction.background) &&
            sample.send.color === rgb(p.composerAction.foreground),
          sample.send,
        );
        check(
          `${mode}/${accent} assistant and links neutral`,
          sample.assistant.color === rgb(p.text.primary) &&
            sample.link.color === rgb(p.text.primary),
        );
        check(
          `${mode}/${accent} actual checkbox fill/mark`,
          sample.checkboxMarks[0].fill === rgb(p.accent.main) &&
            sample.checkboxMarks[1].fill === rgb(p.accent.contrastText),
        );
        check(
          `${mode}/${accent} actual radio fill/mark`,
          sample.radio.color === rgb(p.accent.main) &&
            sample.radioMark.fill === rgb(p.accent.contrastText),
        );
        check(
          `${mode}/${accent} slider retains distinct roles`,
          sample.slider.color === rgb(p.accent.foreground) &&
            sample.sliderThumb.bg === rgb(p.accent.foreground) &&
            sample.sliderRail.color === rgb(p.text.disabled),
        );
        for (const s of sample.statuses)
          check(
            `${mode}/${accent} ${s.status} explicit controls and marks`,
            s.track.bg === rgb(p[s.status].main) &&
              s.thumb.bg === rgb(p[s.status].contrastText) &&
              s.checkbox.color === rgb(p[s.status].main) &&
              s.marks.every((m) => m.fill === rgb(p[s.status].contrastText)),
            s,
          );
        await c.js(
          `window.accentEditor = document.querySelector('.cm-editor'); window.accentContent = document.querySelector('.cm-content'); null`,
        );
        await c.click('.cm-content');
        await c.key('a', 'KeyA', 65, 2);
        await c.wait(100);
        const editor = await c.js(
          `(()=>{const s=document.querySelector('.cm-line span');return {color:getComputedStyle(s).color,selected:getComputedStyle(s,'::selection').color,selection:document.querySelector('.cm-selectionBackground') && getComputedStyle(document.querySelector('.cm-selectionBackground')).backgroundColor}})()`,
        );
        check(
          `${mode}/${accent} editor selection keeps syntax`,
          editor.color === editor.selected && !!editor.selection,
          editor,
        );
        await c.key('ArrowRight', 'ArrowRight', 39);
        await c.js('window.getSelection().removeAllRanges()');
        await c.js('accentQA.disabled(true)');
        await c.wait(350);
        check(
          `${mode}/${accent} disabled Send stays neutral`,
          await c.js(
            `document.querySelector('button[aria-label="Send message"]').disabled && getComputedStyle(document.querySelector('button[aria-label="Send message"]')).backgroundColor!==${JSON.stringify(sample.send.bg)}`,
          ),
        );
        await c.js('accentQA.streaming(true)');
        await c.until(`document.querySelector('button[aria-label="Stop generating response"]') && getComputedStyle(document.querySelector('button[aria-label="Stop generating response"]')).color===${JSON.stringify(rgb(p.error.main))}`);
        check(
          `${mode}/${accent} streaming Stop keeps error tone`,
          await c.js(
            `getComputedStyle(document.querySelector('button[aria-label="Stop generating response"]')).color===${JSON.stringify(rgb(p.error.main))}`,
          ),
        );
        await c.js('accentQA.streaming(false);accentQA.disabled(false)');
        await c.wait(350);
        check(
          `${mode}/${accent} draft/editor preserved`,
          await c.js(
            `document.querySelector('textarea[aria-label="Message Moonlit"]').value==='Synthetic draft — never submitted' && window.accentEditor===document.querySelector('.cm-editor') && window.accentContent===document.querySelector('.cm-content')`,
          ),
        );
      }
      await c.js('window.scrollTo(0,0)');
      const shot = await c.call('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(`${out}/${phase}-${mode}-${accent}.png`, Buffer.from(shot.data, 'base64'));
      if (phase === 'after') {
        await c.js(
          `(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('[data-testid=user-message]'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range)})()`,
        );
        const selectedShot = await c.call('Page.captureScreenshot', { format: 'png' });
        await fs.writeFile(
          `${out}/${phase}-${mode}-${accent}-selection.png`,
          Buffer.from(selectedShot.data, 'base64'),
        );
        await c.js('window.getSelection().removeAllRanges()');
      }
    }
  if (phase === 'after') {
    for (const mode of ['light', 'dark']) {
      const [purple, blue] = samples.filter((s) => s.mode === mode);
      check(
        `${mode} disabled controls and neutral action invariant`,
        JSON.stringify(purple.disabled) === JSON.stringify(blue.disabled) &&
          JSON.stringify(purple.neutral) === JSON.stringify(blue.neutral),
      );
      check(
        `${mode} accent does not change syntax`,
        JSON.stringify(purple.syntax) === JSON.stringify(blue.syntax),
      );
    }
    for (const operation of ['append', 'prepend']) {
      await c.js(`accentQA.${operation}()`);
      await c.wait(200);
      check(
        `${operation} history uses current bubble roles`,
        await c.js(
          `Array.from(document.querySelectorAll('[data-testid=user-message]')).every(e=>getComputedStyle(e.parentElement).backgroundColor==='rgb(23, 62, 118)' && getComputedStyle(e).color==='rgb(246, 250, 254)')`,
        ),
      );
    }
    const userArticle = 'article[aria-label="Your message"]';
    const r = await c.js(
      `document.querySelector('${userArticle}').getBoundingClientRect().toJSON()`,
    );
    await c.call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
    });
    await c.wait(300);
    check(
      'user Copy hover remains visible and neutral',
      await c.js(
        `getComputedStyle(document.querySelector('${userArticle} .msg-actions-row')).opacity==='1' && ['rgb(205, 205, 205)','rgb(237, 237, 237)'].includes(getComputedStyle(document.querySelector('${userArticle} button')).color)`,
      ),
    );
    check(
      'user URLs preserve plain-text rendering',
      await c.js(
        `!document.querySelector('[data-testid=user-message] a') && [...document.querySelectorAll('[data-testid=user-message]')].some(e=>e.textContent.includes('https://example.com'))`,
      ),
    );
  }
} catch (e) {
  check('runner', false, e.stack);
}
await fs.writeFile(`${out}/${phase}.json`, JSON.stringify({ checks, samples }, null, 2));
console.log(
  JSON.stringify(
    {
      phase,
      passed: checks.filter((c) => c.pass).length,
      failed: checks.filter((c) => !c.pass),
      samples: samples.length,
    },
    null,
    2,
  ),
);
c.close();
if (checks.some((c) => !c.pass)) process.exitCode = 1;
