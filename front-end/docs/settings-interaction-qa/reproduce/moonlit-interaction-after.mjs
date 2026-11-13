import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {call,js,wait,shot,load,click,key,ws,events} from './moonlit-interaction-cdp.mjs';
const out={checks:[],advanced:{},picker:[],icons:[],performance:{}};
const check=(label,condition,details)=>{out.checks.push({label,pass:!!condition,details});assert.ok(condition,label+': '+JSON.stringify(details));};
const rect=selector=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
const mouse=async(type,x,y,pressed=false)=>call('Input.dispatchMouseEvent',{type,x,y,button:pressed?'left':'none',buttons:pressed?1:0,...(type==='mousePressed'||type==='mouseReleased'?{button:'left',clickCount:1}:{})});
const advance=()=>js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Advanced').click()`);
const set=async expr=>{await js(`qa.setAppearance(${expr})`);await wait(250);};
const darkDefaults='{...qa.defaults,mode:"dark"}';
const closePicker=async()=>{await key('Escape');await wait(350);check('Escape closes picker',await js('!document.querySelector("[role=dialog]")'));};
const pickerValue=()=>js(`document.querySelector('[role="dialog"] input[aria-label$="picker hex"]').value`);
async function keyboardValue(label,value){await js(`document.querySelector('input[aria-label=${JSON.stringify(label)}]').focus()`);await key('Home');await key('ArrowRight');check('Native keyboard equivalent advances '+label,await js(`document.querySelector('input[aria-label=${JSON.stringify(label)}]').value==='1'`));const r=await rect('input[aria-label="'+label+'"]');const x=r.x+8+(r.width-16)*value/(label==='Hue'?359:100);await mouse('mousePressed',x,r.y+r.height/2,true);await mouse('mouseReleased',x,r.y+r.height/2);await wait(80);}
async function planeDrag(fx,fy,release=true){const r=await rect('[aria-label="Saturation and brightness plane"]');await mouse('mousePressed',r.x+r.width*.1,r.y+r.height*.9,true);await mouse('mouseMoved',r.x+r.width*fx,r.y+r.height*fy,true);await wait(80);if(release){await mouse('mouseReleased',r.x+r.width*fx,r.y+r.height*fy);await wait(200);}return r;}
await load();await wait(1500);await set(darkDefaults);

try {
for(const mode of ['light','dark']) {
 await set(`{...qa.defaults,mode:${JSON.stringify(mode)}}`);
 for(const expanded of [false,true]) {
  if(await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Advanced').getAttribute('aria-expanded')`)!==String(expanded))await advance();await wait(250);
  const r=await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Advanced');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const measure=()=>js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Advanced'),s=getComputedStyle(b),g=document.querySelector('[data-appearance-group]');return {bounds:b.getBoundingClientRect().toJSON(),group:g.getBoundingClientRect().toJSON(),color:s.color,background:s.backgroundColor,radius:s.borderRadius,outline:s.outline,focus:b.matches(':focus-visible')}})()`);
  const states={};
  await mouse('mouseMoved',1100,10);await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Advanced').blur()`);await wait(50);states.normal=await measure();await shot(`after-${mode}-${expanded?'expanded':'collapsed'}-normal`);
  await mouse('mouseMoved',r.x,r.y);await wait(70);states.hover=await measure();await shot(`after-${mode}-${expanded?'expanded':'collapsed'}-hover`);
  await mouse('mousePressed',r.x,r.y,true);await wait(30);states.pressed=await measure();await shot(`after-${mode}-${expanded?'expanded':'collapsed'}-pressed`);
  // Release away from button to avoid toggling while capturing the same expanded state.
  await mouse('mouseMoved',1100,10,true);await mouse('mouseReleased',1100,10);await key('Tab');await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Advanced').focus()`);states.focus=await measure();await shot(`after-${mode}-${expanded?'expanded':'collapsed'}-focus`);
  for(const state of ['hover','pressed','focus']) check(`${mode}/${expanded}/${state} has stable disclosure bounds`,JSON.stringify(states[state].bounds)===JSON.stringify(states.normal.bounds),states[state].bounds);
  check(`${mode}/${expanded} focus has outline`,states.focus.outline.includes('2px'),states.focus);
  out.advanced[mode+'-'+expanded]=states;
 }
 // Reset is a separate region and cannot toggle the expanded disclosure.
 const was=await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Advanced').getAttribute('aria-expanded')`);
 await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Reset to default')?.click()`);await wait(150);
 check('Reset does not toggle Advanced',await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Advanced').getAttribute('aria-expanded')`)===was);
}
await set(darkDefaults);await shot('after-icons-desktop');
out.icons=await js(`[...document.querySelectorAll('nav[aria-label="Settings sections"] button')].map(b=>({label:b.textContent,icon:b.querySelector('svg')?.getAttribute('data-testid'),hidden:b.querySelector('svg')?.getAttribute('aria-hidden'),bounds:b.querySelector('svg')?.getBoundingClientRect().toJSON(),fill:getComputedStyle(b.querySelector('svg')).fill}))`);
check('Four semantic navigation glyphs are distinct',new Set(out.icons.map(x=>x.icon||x.label)).size===4,out.icons);
check('Navigation glyphs decorative',out.icons.every(x=>x.hidden==='true'),out.icons);
await click('input[aria-label="Search settings"]');await call('Input.insertText',{text:'font'});await wait(150);await shot('after-search-icons');
check('Search results use appearance icon',await js(`[...document.querySelectorAll('nav[aria-label="Search results"] button')].every(b=>b.querySelector('svg')?.getAttribute('data-testid')==='PaletteOutlinedIcon')`));
await click('button[aria-label="Clear search"]');await wait(100);
// Each neutral can retain a blue hue with zero writes until chroma is selected.
for(const hex of ['#000000','#FFFFFF','#808080','#FF0000','#CC9999']) {
 await set(`{...qa.defaults,mode:'dark',profiles:{...qa.defaults.profiles,dark:{...qa.defaults.profiles.dark,surface:${JSON.stringify(hex)},custom:true}}}`);
 await click('button[aria-label="Background color"]');await wait(250);check('Picker opens '+hex,await js('!!document.querySelector("input[aria-label=Hue]")'));await js('resetPerf()');
 await keyboardValue('Hue',240);
 const hue=await js('({hex:qa.settings.appearance.profiles.dark.surface,hue:document.querySelector("input[aria-label=Hue]").value,writes:perfMetrics.writes})');
 if(['#000000','#FFFFFF','#808080'].includes(hex))check('Hue-only neutral edit writes nothing '+hex,hue.hex===hex&&hue.writes===0,hue);
 if(hex==='#CC9999') { check('Pastel saturation survives hue change',await pickerValue()==='#9999CC',await pickerValue()); }
 else if(hex==='#FF0000') check('Saturated red becomes blue',await pickerValue()==='#0000FF',await pickerValue());
 await planeDrag(1,0);
 const result=await pickerValue();check('Blue obtainable from '+hex,result==='#0000FF',result);
 out.picker.push({start:hex,hue,result,writes:await js('perfMetrics.writes')});await shot('after-picker-'+hex.slice(1));await closePicker();
}

// A gesture previews once per frame, persists only on release, clamps outside and keeps the pointer captured.
await set(darkDefaults);await click('button[aria-label="Background color"]');await wait(350);await keyboardValue('Hue',240);await js('resetPerf()');
let r=await planeDrag(.5,.5,false);
check('Dragging previews without persistence',await js('perfMetrics.writes===0 && qa.settings.appearance.profiles.dark.surface==="#000000"'));
check('Pointer capture is active',await js(`document.querySelector('[aria-label="Saturation and brightness plane"]').hasPointerCapture(1)`));
await mouse('mouseMoved',r.x+r.width+30,r.y-30,true);await mouse('mouseReleased',r.x+r.width+30,r.y-30);await wait(200);
check('Outside plane drag clamps to blue once',await js('qa.settings.appearance.profiles.dark.surface==="#0000FF" && perfMetrics.writes===1'),await js('({surface:qa.settings.appearance.profiles.dark.surface,writes:perfMetrics.writes})'));
await closePicker();
// Escape must win over any late pointer release or blur.
await set(darkDefaults);await click('button[aria-label="Foreground color"]');await wait(350);await js('resetPerf()');r=await planeDrag(.8,.2,false);await key('Escape');await mouse('mouseReleased',r.x+r.width*.8,r.y+r.height*.2);await js('document.activeElement?.blur()');await wait(200);
check('Escape cancellation cannot be recommitted',await js('perfMetrics.writes===0 && qa.settings.appearance.profiles.dark.ink==="#EDEDED"'));
// Profile previews match commit and leave the active mode and other profile untouched.
await set(`{...qa.defaults,mode:'dark',separateModes:true,profiles:{light:{...qa.defaults.profiles.light,accent:'custom'},dark:qa.defaults.profiles.dark}}`);
await click('button[aria-label="light custom accent color"]');await wait(350);await js('resetPerf()');r=await planeDrag(.8,.2,false);
const preview=await js(`({style:document.querySelector('section[aria-label="light theme settings"]').getAttribute('style'),other:document.querySelector('section[aria-label="dark theme settings"]').getAttribute('style'),mode:qa.theme.mode,writes:perfMetrics.writes})`);
await mouse('mouseReleased',r.x+r.width*.8,r.y+r.height*.2);await wait(200);
check('Inactive accent preview equals committed card and preserves active mode',await js(`document.querySelector('section[aria-label="light theme settings"]').getAttribute('style')===${JSON.stringify(preview.style)} && qa.theme.mode==='dark' && !qa.settings.appearance.profiles.light.custom`),preview);
await closePicker();
// Account changes discard open picker and late gesture events.
await click('button[aria-label="light background color"]');await wait(350);check('Background picker opens after accent',await js('!!document.querySelector("[role=dialog]")'));r=await planeDrag(.5,.5,false);await js('changeAccount("interaction-qa-other")');await wait(250);await mouse('mouseReleased',r.x+r.width*.5,r.y+r.height*.5);await wait(100);
check('Account switch discards picker draft',await js('!document.querySelector("[role=dialog]") && qa.settings.appearance.profiles.light.surface==="#FCFCFC"'));
await js('changeAccount("interaction-qa")');await wait(150);
// Companion controls in both modes and Default/Purple/White accents.
for(const mode of ['light','dark'])for(const accent of ['default','purple','white']) {
 await set(`{...qa.defaults,mode:${JSON.stringify(mode)},profiles:{light:{...qa.defaults.profiles.light,accent:${JSON.stringify(accent)}},dark:{...qa.defaults.profiles.dark,accent:${JSON.stringify(accent)}}}}`);
 await click(`div[role="combobox"][aria-label="${mode} accent"]`);await wait(120);await shot(`after-${mode}-${accent}-accent-menu`);await key('Escape');await wait(350);
 await click('button[aria-label="Import theme"]');await wait(350);check(`${mode}/${accent} import opens`,await js('!!document.querySelector("[role=dialog]")'));await key('Escape');await wait(350);
}
// Coarse-pointer targets, mobile drawer and touch plane with no page scroll.
await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await set(darkDefaults);await wait(200);await shot('after-mobile');
check('Mobile has no horizontal overflow',await js('innerWidth===390 && document.documentElement.scrollWidth===390 && Math.round(visualViewport.width)===390'));
await click('button[aria-label="Show settings navigation"]');await wait(300);await shot('after-mobile-navigation');await click('button[aria-label="Hide settings navigation"]');await wait(300);
await click('button[aria-label="Background color"]');await wait(200);await keyboardValue('Hue',240);r=await rect('[aria-label="Saturation and brightness plane"]');const scroll=await js('document.querySelector("main").scrollTop');await js('resetPerf()');
await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+10,y:r.y+r.height-10,id:1}]});await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width-1,y:r.y+1,id:1}]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(200);await shot('after-mobile-touch-picker');
check('Touch gesture commits once without scrolling',await js(`perfMetrics.writes===1 && document.querySelector('main').scrollTop===${scroll}`),await js('({writes:perfMetrics.writes,hex:qa.settings.appearance.profiles.dark.surface})'));
await closePicker();
await call('Emulation.setTouchEmulationEnabled',{enabled:false});await call('Emulation.setDeviceMetricsOverride',{width:1158,height:928,deviceScaleFactor:1,mobile:false});
} catch(e) {out.error=e.stack;console.error(e);}
await fs.writeFile('docs/settings-interaction-qa/browser-checks.json',JSON.stringify(out,null,2));let stream;if(stream){let data='';while(true){const chunk=await call('IO.read',{handle:stream,size:65536});data+=chunk.data;if(chunk.eof)break;}await fs.writeFile('docs/settings-interaction-qa/interaction-trace.json',data);await call('IO.close',{handle:stream});}
await fs.writeFile('docs/settings-interaction-qa/browser-checks.json',JSON.stringify(out,null,2));console.log(JSON.stringify({checks:out.checks,error:out.error},null,2));ws.close();if(out.error)process.exitCode=1;
