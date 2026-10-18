import assert from 'node:assert/strict';
import test from 'node:test';

const dashboardModel = await import('./dashboardModel.js').catch(() => ({}));

test('normalizes missing and unknown dashboard sections to overview', () => {
  assert.equal(typeof dashboardModel.normalizeDashboardSection, 'function');
  assert.equal(dashboardModel.normalizeDashboardSection(), 'overview');
  assert.equal(dashboardModel.normalizeDashboardSection('unknown'), 'overview');
});

test('preserves every supported dashboard section', () => {
  assert.deepEqual(
    ['overview', 'usage', 'account'].map(dashboardModel.normalizeDashboardSection),
    ['overview', 'usage', 'account'],
  );
});

test('plans immediate dashboard navigation while chat is idle', () => {
  assert.equal(typeof dashboardModel.getDashboardNavigationPlan, 'function');
  assert.deepEqual(dashboardModel.getDashboardNavigationPlan({ isStreaming: false }), {
    requiresConfirmation: false,
    destination: '/dashboard/overview',
  });
});

test('requires confirmation before leaving an active stream', () => {
  assert.deepEqual(dashboardModel.getDashboardNavigationPlan({ isStreaming: true }), {
    requiresConfirmation: true,
    destination: '/dashboard/overview',
  });
});

test('opens the dashboard immediately from an idle chat', () => {
  const events = [];

  dashboardModel.requestDashboardNavigation({
    isStreaming: false,
    navigate: (destination) => events.push(['navigate', destination]),
    stopStreaming: () => events.push(['stop']),
    openConfirmation: () => events.push(['confirm']),
  });

  assert.deepEqual(events, [['navigate', '/dashboard/overview']]);
});

test('stops an active stream only after dashboard navigation is confirmed', async () => {
  const events = [];
  let confirm;

  dashboardModel.requestDashboardNavigation({
    isStreaming: true,
    navigate: (destination) => events.push(['navigate', destination]),
    stopStreaming: async () => events.push(['stop']),
    openConfirmation: (request) => {
      assert.equal(request.open, true);
      events.push(['confirm']);
      confirm = request.onConfirm;
    },
  });

  assert.deepEqual(events, [['confirm']]);
  await confirm();
  assert.deepEqual(events, [
    ['confirm'],
    ['stop'],
    ['navigate', '/dashboard/overview'],
  ]);
});
