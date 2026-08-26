import assert from 'node:assert/strict';
import test from 'node:test';
import * as timelineShared from './timelineShared.js';

test('timeline node position centers the icon within each responsive title row', () => {
  assert.equal(typeof timelineShared.getTimelineNodeTopSx, 'function');

  assert.deepEqual(
    timelineShared.getTimelineNodeTopSx({
      mobileTitleMinHeight: 44,
      desktopTitleMinHeight: 32,
      itemPadding: 4,
    }),
    { xs: 26, md: 20 },
  );
});
