import assert from 'node:assert/strict';
import test from 'node:test';
import { hexToHsl, hslToHex, hexToHsv, hsvToHex } from './colorModel.js';
test('color channels round trip for gray, pastel, black, white and saturated colors', () => {
  for (const hex of ['#808080', '#D1B4E8', '#000000', '#FFFFFF', '#00FF00', '#A67DF2', '#123456'])
    assert.equal(hslToHex(hexToHsl(hex)), hex);
  const pastel = hexToHsl('#D1B4E8');
  assert.ok(pastel.s < 1);
  assert.equal(hexToHsl(hslToHex({ ...pastel, h: 220 })).s.toFixed(2), pastel.s.toFixed(2));
  const gray = hexToHsl('#808080');
  assert.equal(hslToHex({ ...gray, h: 240 }), '#808080');
});
test('HSV round trips neutrals and pastels without assigning chroma to hue-only neutral edits', () => {
  for (const hex of ['#000000', '#FFFFFF', '#808080', '#FF0000', '#0000FF', '#D1B4E8'])
    assert.equal(hsvToHex(hexToHsv(hex)), hex);
  assert.equal(hsvToHex({ h: 240, s: 0, v: 0.5 }), '#808080');
  assert.equal(hsvToHex({ h: 240, s: 1, v: 1 }), '#0000FF');
  assert.equal(hsvToHex({ h: 240, s: 0.25, v: 0.8 }), '#9999CC');
});
