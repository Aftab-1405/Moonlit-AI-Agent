import assert from 'node:assert/strict';
import test from 'node:test';
import * as interfaceChrome from './interfaceChrome.js';

const { getWelcomeHeroSx } = interfaceChrome;

test('conversation panel shrinks to the mobile viewport instead of clipping its children', () => {
  assert.equal(typeof interfaceChrome.getChatConversationPanelSx, 'function');

  const sx = interfaceChrome.getChatConversationPanelSx();

  assert.equal(sx.width, '100%');
  assert.equal(sx.maxWidth, '100%');
  assert.equal(sx.minWidth, 0);
});

test('mobile welcome layout centers the greeting above a bottom composer without suggestions', () => {
  const sx = interfaceChrome.getWelcomeLayoutSx();

  assert.deepEqual(sx.outer.alignItems, { xs: 'stretch', sm: 'safe center' });
  assert.deepEqual(sx.content.height, { xs: '100%', sm: 'auto' });
  assert.deepEqual(sx.hero.flex, { xs: 1, sm: '0 0 auto' });
  assert.equal(sx.composer.flexShrink, 0);
  assert.deepEqual(sx.suggestions.display, { xs: 'none', sm: 'block' });
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

test('welcome greeting stays on one line without overflowing its available width', () => {
  const sx = getWelcomeHeroSx({
    typography: {
      uiDisplaySm: {
        fontSize: { xs: '1.75rem', md: '2rem' },
        lineHeight: 1.125,
      },
    },
  });

  assert.equal(sx.whiteSpace, 'nowrap');
  assert.equal(sx.overflow, 'hidden');
  assert.equal(sx.textOverflow, 'ellipsis');
  assert.match(sx.fontSize.xs, /^clamp\(/);
});

test('welcome greeting uses a measured shimmer and becomes static for reduced motion', () => {
  const sx = getWelcomeHeroSx(
    {
      typography: { uiDisplaySm: {} },
      palette: {
        mode: 'dark',
        text: { primary: '#f5f5f5', secondary: '#a3a3a3' },
      },
    },
    'welcome-shimmer',
  );

  assert.equal(sx.animation, 'welcome-shimmer 3.2s linear infinite');
  assert.match(sx.backgroundImage, /^linear-gradient\(/);
  assert.match(sx.backgroundImage, /#a3a3a3/);
  assert.equal(sx.backgroundClip, 'text');
  assert.equal(sx.WebkitTextFillColor, 'transparent');
  assert.equal(sx['@media (prefers-reduced-motion: reduce)'].animation, 'none');
  assert.equal(sx['@media (prefers-reduced-motion: reduce)'].WebkitTextFillColor, 'currentColor');
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
