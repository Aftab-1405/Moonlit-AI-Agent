import assert from 'node:assert/strict';
import test from 'node:test';

const appShellModel = await import('./appShellModel.js').catch(() => ({}));

test('desktop and narrow modes preserve the same shell regions', () => {
  assert.equal(typeof appShellModel.getAppShellLayout, 'function');

  const desktop = appShellModel.getAppShellLayout({
    isNarrowLayout: false,
    sidebarOpen: true,
    canvasOpen: true,
    canvasWidth: 480,
  });
  const narrow = appShellModel.getAppShellLayout({
    isNarrowLayout: true,
    sidebarOpen: true,
    canvasOpen: true,
    canvasWidth: 480,
  });

  assert.deepEqual(desktop.regions, ['sidebar', 'chat', 'workspace']);
  assert.deepEqual(narrow.regions, ['sidebar', 'chat', 'workspace']);
  assert.equal(desktop.sidebarWidth, 344);
  assert.equal(narrow.sidebarWidth, 0);
  assert.equal(desktop.workspacePosition, 'relative');
  assert.equal(narrow.workspacePosition, 'fixed');
});

test('closed narrow workspace remains mounted but moves outside the viewport', () => {
  assert.equal(typeof appShellModel.getAppShellLayout, 'function');

  const layout = appShellModel.getAppShellLayout({
    isNarrowLayout: true,
    sidebarOpen: false,
    canvasOpen: false,
    canvasWidth: 420,
  });

  assert.equal(layout.workspaceWidth, '100%');
  assert.equal(layout.workspaceY, '100%');
  assert.equal(layout.workspaceInteractive, false);
});
