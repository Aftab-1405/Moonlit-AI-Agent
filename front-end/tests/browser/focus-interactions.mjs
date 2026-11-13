// Run from the frontend root against tests/focus.vite.config.mjs and a dedicated Chrome CDP port.
import fs from 'node:fs/promises';
await fs.mkdir('qa-output/interaction-focus-qa', { recursive: true });
const label=process.argv[2] || 'after';
const tabs=await(await fetch('http://127.0.0.1:9333/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}};
const call=async(method,params={})=>{const r=await new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});if(r.error)throw Error(JSON.stringify(r.error));return r.result;};
const js=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result?.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async expression=>{for(let i=0;i<150;i++){if(await js(expression))return;await wait(100);}throw Error('Not ready: '+expression);};
const mouse=(type,x,y,pressed=false)=>call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:pressed?1:0,clickCount:1});
const key=async(k,code=k)=>{const vk={Tab:9,Escape:27,Enter:13,' ':32,ArrowDown:40,ArrowRight:39}[k]||0;await call('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:vk,...(k==='Enter'?{text:'\r'}:k===' '?{text:' '}: {})});await call('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:vk});};
const rect=async selector=>{await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);await wait(80);return js(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);};
const click=async selector=>{const r=await rect(selector);await mouse('mouseMoved',r.x+r.width/2,r.y+r.height/2);await mouse('mousePressed',r.x+r.width/2,r.y+r.height/2,true);await mouse('mouseReleased',r.x+r.width/2,r.y+r.height/2);await wait(180);};
const shot=async name=>{const {data}=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(`qa-output/interaction-focus-qa/${label}-${name}.png`,Buffer.from(data,'base64'));};
const checks=[];const check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
const measure=selector=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),root=e.closest('.MuiInputBase-root')||e,field=root.querySelector('fieldset'),s=getComputedStyle(root),i=getComputedStyle(e),a=getComputedStyle(root,'::after');return {active:document.activeElement===e,expanded:e.getAttribute('aria-expanded'),hover:root.matches(':hover'),border:field?[getComputedStyle(field).borderTopWidth,getComputedStyle(field).borderTopStyle,getComputedStyle(field).borderTopColor].join(' '):'',outline:s.outlineWidth+' '+s.outlineStyle,inputOutline:i.outlineWidth+' '+i.outlineStyle,shadow:s.boxShadow,background:s.backgroundColor,underline:a.borderBottomWidth+' '+a.borderBottomStyle,focused:root.classList.contains('Mui-focused'),modality:document.documentElement.getAttribute('data-moonlit-input-modality')}})()`);
async function field(name,selector,{dropdown=false,underline=false}={}){
 await js('document.activeElement?.blur()');await mouse('mouseMoved',5,5);await wait(180);const idle=await measure(selector),r=await rect(selector);await mouse('mouseMoved',r.x+r.width/2,r.y+r.height/2);await wait(180);const hover=await measure(selector);await click(selector);const focused=await measure(selector),expected=focused.hover?hover:idle;
 check(name+' click adds no border/ring',(focused.focused||focused.active||focused.expanded==='true')&&focused.border===expected.border&&focused.outline.includes('none')&&focused.inputOutline.includes('none')&&focused.shadow==='none'&&(!underline||focused.underline.startsWith('0px')), {idle,hover,focused});
 if(name.includes('actual Appearance'))await shot(name.split(' ')[0]+'-appearance-pointer-open');
 if(dropdown){await key('Escape');await wait(350);}else{await key('Tab');await wait(70);}
}
try{
await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1158,height:1100,deviceScaleFactor:1,mobile:false});
const url='http://127.0.0.1:5173/tests/fixtures/focus-interactions.html',nav=await call('Page.navigate',{url});
for(let i=0;i<200;i++){await wait(100);const t=await call('Page.getFrameTree');if(t.frameTree.frame.loaderId===nav.loaderId&&await js('document.readyState==="complete" && !!window.focusQA'))break;}
await until('!!window.focusQA && !!document.querySelector("#focus-start")');await wait(500);
for(const mode of ['light','dark']){
 await js(`focusQA.mode(${JSON.stringify(mode)})`);await wait(350);
 for(const [name,selector,opts]of [
  ['global search','input[aria-label="Global search"]',{}],['auth helper','input[aria-label="Auth field"]',{}],
  ['global dropdown','[role=combobox][aria-label="Global select"]',{dropdown:true}],['preference dropdown','[role=combobox][aria-label="Preference select"]',{dropdown:true}],
  ['autocomplete','input[role=combobox]',{dropdown:true}],['standard/database field','input[aria-label="Database standard"]',{underline:true}],['filled field','input[aria-label="Filled field"]',{underline:true}],
  ['borderless search','input[aria-label="Borderless search"]',{}],['custom native input','input[aria-label="Native hex"]',{}],['validation','input[aria-label="Invalid field"]',{}],
 ])await field(mode+' '+name,selector,opts);
 // Actual pointer focus must not acquire the keyboard indicator while typing.
 await click('input[aria-label="Global search"]');await call('Input.insertText',{text:'search draft'});await call('Input.dispatchKeyEvent',{type:'keyDown',key:'x',code:'KeyX',windowsVirtualKeyCode:88,text:'x'});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'x',code:'KeyX',windowsVirtualKeyCode:88});check(mode+' typing retains pointer origin',await js('document.documentElement.getAttribute("data-moonlit-input-modality")==="pointer"'));
 await key('Tab');await js(`document.querySelector('input[aria-label="Global search"]').focus()`);const keyboard=await measure('input[aria-label="Global search"]');check(mode+' keyboard field focus visible',keyboard.outline.includes('solid')&&keyboard.outline.startsWith('2px'),keyboard);
 await key('Tab');await js('document.querySelector("#focus-start").focus()');let button=await measure('#focus-start');check(mode+' keyboard action focus visible',button.outline.includes('solid'),button);await click('#focus-start');button=await measure('#focus-start');check(mode+' click clears stale action focus ring',button.outline.includes('none')&&button.shadow==='none',button);
 const dots='button[aria-label="Options for Focus conversation"]',r=await rect(dots);await mouse('mouseMoved',r.x+r.width/2,r.y+r.height/2);await wait(200);let s=await measure(dots);check(mode+' conversation ellipsis has no round hover fill',s.background==='transparent'||s.background.endsWith(', 0)'),s);await shot(mode+'-conversation-hover');await mouse('mousePressed',r.x+r.width/2,r.y+r.height/2,true);s=await measure(dots);check(mode+' conversation ellipsis has no pressed fill',s.background==='transparent'||s.background.endsWith(', 0)'),s);await mouse('mouseReleased',r.x+r.width/2,r.y+r.height/2);await wait(250);s=await measure(dots);check(mode+' conversation menu actually opens',await js(`document.querySelector('button[aria-label="Options for Focus conversation"]').getAttribute('aria-expanded')==='true' && !!document.querySelector('[role=menu]')`));check(mode+' open ellipsis stays transparent',s.background==='transparent'||s.background.endsWith(', 0)'),s);check(mode+' pointer-opened menu has no focus ring',await js(`[...document.querySelectorAll('[role=menuitem]')].every(e=>getComputedStyle(e).outlineStyle==='none')`));await key('Escape');await wait(350);s=await measure(dots);check(mode+' keyboard menu return focus visible',s.outline.includes('solid'),s);
 await click('input[aria-label="Global search"]');await shot(mode+'-search-click');
 // Real settings controls include their component-specific style overrides.
 await js('focusQA.open("general")');await until(`document.querySelector('h1#settings-section-title')?.textContent==='General'`);await field(mode+' actual General select','#setting-responseStyle',{dropdown:true});await field(mode+' actual Settings search','input[aria-label="Search settings"]');await js('focusQA.open("appearance")');await until(`document.querySelector('h1#settings-section-title')?.textContent==='Appearance'`);await field(mode+' actual Appearance select',`[role=combobox][aria-label="${mode} theme preset"]`,{dropdown:true});await shot(mode+'-appearance-keyboard-return');
 const radio=`input[type=radio][value="${mode}"]`;
 await click(radio);
 const choice=await js(`(()=>{const e=document.querySelector(${JSON.stringify(radio)}).closest('.MuiFormControlLabel-root');return {checked:document.querySelector(${JSON.stringify(radio)}).checked,offset:getComputedStyle(e).outlineOffset}})()`);
 check(mode+' mode choice retains selection without pointer focus accent',choice.checked&&choice.offset==='2px',choice);
 await js('focusQA.open("controls")');await wait(200);
}
// Ordinary selected states and slider feedback remain usable.
await click('input[aria-label="Checked state"]');check('checkbox still selects',await js(`document.querySelector('input[aria-label="Checked state"]').checked`));
await click('input[aria-label="Switch state"]');check('switch still selects',await js(`document.querySelector('input[aria-label="Switch state"]').checked`));
const slider=await rect('input[aria-label="Control slider"]');await mouse('mousePressed',slider.x+slider.width*.7,slider.y+slider.height/2,true);await wait(70);check('slider has no pointer activation halo',await js(`getComputedStyle(document.querySelector('input[aria-label="Control slider"]').closest('.MuiSlider-root').querySelector('.MuiSlider-thumb')).boxShadow==='none'`));await mouse('mouseReleased',slider.x+slider.width*.7,slider.y+slider.height/2);
// Real composer model popover and SQL editor.
await click('button[aria-label^="Select model"]');await until(`!!document.querySelector('button[aria-label="Choose a model"]')`);await click('button[aria-label="Choose a model"]');await until(`!!document.querySelector('input[aria-label="Search models"]')`);await field('actual composer model search','input[aria-label="Search models"]');await key('Escape');await wait(350);
await click('.cm-content');check('SQL editor pointer focus has no extra outline',await js(`getComputedStyle(document.querySelector('.cm-editor')).outlineStyle==='none'`));
await js('focusQA.open("auth")');await until(`!!document.querySelector('input[type=email]')`);await field('actual authentication email','input[type=email]');await js('focusQA.open("controls")');await wait(200);
await js('focusQA.open("database")');await until(`!!document.querySelector('input[name=host]')`);await field('actual database Host','input[name=host]',{underline:true});await key('Escape');await wait(350);
}catch(e){checks.push({name:'runner',pass:false,error:e.stack});}
await fs.writeFile(`qa-output/interaction-focus-qa/${label}.json`,JSON.stringify(checks,null,2));console.log(JSON.stringify({label,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass)},null,2));ws.close();if(checks.some(c=>!c.pass))process.exitCode=1;
