export async function connect(targetId) {
  const tabs = await (await fetch('http://127.0.0.1:9333/json')).json();
  const ws = new WebSocket(
    tabs.find((t) => (targetId ? t.id === targetId : t.type === 'page')).webSocketDebuggerUrl,
  );
  await new Promise((r) => {
    ws.onopen = r;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      pending.get(m.id)?.(m);
      pending.delete(m.id);
    }
  };
  const call = async (method, params = {}) => {
    const result = await new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
    if (result.error) throw Error(JSON.stringify(result.error));
    return result.result;
  };
  const js = async (expression) => {
    const r = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description);
    return r.result?.value;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (expression) => {
    for (let i = 0; i < 200; i++) {
      if (await js(expression)) return;
      await wait(100);
    }
    throw Error('Not ready: ' + expression);
  };
  const click = async (selector) => {
    await js(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`,
    );
    await wait(80);
    const r = await js(
      `document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`,
    );
    for (const type of ['mousePressed', 'mouseReleased'])
      await call('Input.dispatchMouseEvent', {
        type,
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        button: 'left',
        buttons: type === 'mousePressed' ? 1 : 0,
        clickCount: 1,
      });
  };
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp'])
      await call('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers });
  };
  const navigate = async (url) => {
    const nav = await call('Page.navigate', { url });
    for (let i = 0; i < 200; i++) {
      await wait(100);
      const tree = await call('Page.getFrameTree');
      if (
        tree.frameTree.frame.loaderId === nav.loaderId &&
        (await js('document.readyState === "complete"'))
      )
        return;
    }
    throw Error('Navigation timed out');
  };
  await call('Runtime.enable');
  await call('Page.enable');
  return { call, js, wait, until, click, key, navigate, close: () => ws.close() };
}
