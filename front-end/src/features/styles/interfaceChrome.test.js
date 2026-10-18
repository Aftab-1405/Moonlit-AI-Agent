import assert from 'node:assert/strict';
import test from 'node:test';
import * as interfaceChrome from './interfaceChrome.js';

const { getWelcomeHeroSx } = interfaceChrome;

test('chat stage changes placement without animating the composer grid tracks', () => {
  assert.equal(typeof interfaceChrome.getChatStageLayoutSx, 'function');

  const welcome = interfaceChrome.getChatStageLayoutSx('welcome');
  const active = interfaceChrome.getChatStageLayoutSx('active');

  assert.equal(welcome.gridTemplateRows, 'minmax(0, 1fr) auto minmax(0, 1fr)');
  assert.equal(active.gridTemplateRows, 'minmax(0, 1fr) auto minmax(0, 0fr)');
  assert.equal(welcome.transition, 'none');
  assert.equal(active.transition, welcome.transition);
  assert.deepEqual(welcome.reducedMotion, { transition: 'none' });
  assert.equal(welcome.composer.gridRow, 2);
  assert.equal(active.composer.gridRow, 2);
  assert.equal(welcome.transcript.pointerEvents, 'none');
  assert.equal(active.transcript.pointerEvents, 'auto');
});

test('mobile edge controls cancel their container gutter without changing wider layouts', () => {
  assert.equal(typeof interfaceChrome.getMobileEdgeControlSx, 'function');

  assert.deepEqual(interfaceChrome.getMobileEdgeControlSx('left', 1.25), {
    ml: { xs: -1.25, sm: 0 },
  });
  assert.deepEqual(interfaceChrome.getMobileEdgeControlSx('right', 1), {
    mr: { xs: -1, sm: 0 },
  });
});

test('welcome greeting uses restrained, static type', () => {
  const sx = getWelcomeHeroSx({ typography: { uiDisplaySm: {} } });
  assert.equal(sx.fontSize.md, '1.5rem');
  assert.equal(sx.fontWeight, 400);
  assert.equal(sx.animation, undefined);
  assert.equal(sx.backgroundImage, undefined);
});

test('mindmap viewer dedicates the viewport to a compact header and expanding canvas', () => {
  assert.equal(typeof interfaceChrome.getMindmapViewerLayoutSx, 'function');

  const sx = interfaceChrome.getMindmapViewerLayoutSx();

  assert.equal(sx.paper.height, '100dvh');
  assert.equal(sx.paper.maxHeight, '100dvh');
  assert.deepEqual(sx.header.minHeight, { xs: 64, sm: 68 });
  assert.equal(sx.content.maxWidth, 'none');
  assert.equal(sx.content.flex, 1);
  assert.deepEqual(sx.content.px, { xs: 1, sm: 1.5, md: 2 });
  assert.equal(sx.canvas.flex, 1);
  assert.equal(sx.canvas.minHeight, 0);
});

test('mindmap fit view uses the canvas without crowding nodes at the edges', () => {
  assert.equal(typeof interfaceChrome.getMindmapFitViewOptions, 'function');

  assert.deepEqual(interfaceChrome.getMindmapFitViewOptions(false), { padding: 0.1 });
  assert.deepEqual(interfaceChrome.getMindmapFitViewOptions(true), { padding: 0.18 });
});

test('mindmap wheel gestures zoom without requiring Ctrl while drag gestures pan', () => {
  assert.equal(typeof interfaceChrome.getMindmapInteractionProps, 'function');

  assert.deepEqual(interfaceChrome.getMindmapInteractionProps(false), {
    panOnScroll: false,
    panOnDrag: true,
    zoomOnScroll: true,
    zoomOnPinch: true,
    preventScrolling: true,
  });
  assert.deepEqual(interfaceChrome.getMindmapInteractionProps(true), {
    panOnScroll: false,
    panOnDrag: true,
    zoomOnScroll: false,
    zoomOnPinch: true,
    preventScrolling: true,
  });
});
