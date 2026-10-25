import assert from 'node:assert/strict';
import test from 'node:test';
import { getResponsivePillIconButtonSx } from '../features/styles/interfaceChrome.js';
import { BUTTON_TOUCH_QUERY, HOVER_CAPABLE_QUERY } from './mediaQueries.js';
import { getUtilityIconButtonSx } from './shared.js';

const theme = {
  palette: {
    text: { primary: '#ededed', secondary: '#cdcdcd' },
    action: { hover: '#303030', selected: '#414141' },
    layer: { medium: '#414141' },
    border: { idle: '#333', hover: '#444', focus: '#fff' },
  },
  shape: { radius: { pill: '999px' } },
  transitions: { create: () => 'none', duration: { shorter: 100 } },
};

test('utility icon controls retain hover feedback and exclude disabled controls', () => {
  const sx = getUtilityIconButtonSx(theme);
  const hover = sx[HOVER_CAPABLE_QUERY]['&:hover:not(:disabled):not(.Mui-disabled)'];
  assert.equal(hover.backgroundColor, theme.palette.action.hover);
  assert.equal(hover.color, theme.palette.text.primary);
  assert.equal(sx['&:hover'], undefined);
});

test('compact chat buttons keep a touch-sized hit area on wide touch displays', () => {
  const sx = getResponsivePillIconButtonSx(theme, { desktopSize: 30 });
  assert.equal(sx.width.md, 30);
  assert.equal(sx[BUTTON_TOUCH_QUERY].minWidth, 44);
  assert.equal(sx[BUTTON_TOUCH_QUERY].minHeight, 44);
});
