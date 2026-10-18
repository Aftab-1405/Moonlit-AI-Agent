import assert from 'node:assert/strict';
import test from 'node:test';
import { getPopoverSectionLabelSx } from '../../../styles/shared.js';

const theme = {
  typography: {
    uiNavItem: {
      fontFamily: 'Inter, sans-serif',
      fontSize: '0.875rem',
      lineHeight: 1.3,
      letterSpacing: 0,
    },
    uiCaptionMd: {
      fontFamily: 'Inter, sans-serif',
      fontSize: '0.8125rem',
      lineHeight: 1.45,
      letterSpacing: 0,
    },
  },
};

test('popover section labels use sentence-case interface typography', () => {
  const sx = getPopoverSectionLabelSx(theme);

  assert.equal(sx.fontFamily, 'Inter, sans-serif');
  assert.equal(sx.fontSize, '0.8125rem');
  assert.equal(sx.letterSpacing, 0);
  assert.equal(sx.textTransform, undefined);
});
