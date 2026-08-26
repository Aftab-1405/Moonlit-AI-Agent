import assert from 'node:assert/strict';
import test from 'node:test';
import { getWelcomeHeroSx } from './interfaceChrome.js';

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
