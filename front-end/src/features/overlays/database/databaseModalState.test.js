import assert from 'node:assert/strict';
import test from 'node:test';
import { getConnectedActionDisabledSx, getConnectionActionState } from './databaseModalState.js';

test('database connection action uses primary styling until connection succeeds', () => {
  assert.deepEqual(getConnectionActionState({ loading: false, connected: false }), {
    label: 'Connect',
    tone: 'primary',
    disabled: false,
  });
  assert.deepEqual(getConnectionActionState({ loading: true, connected: false }), {
    label: 'Connecting',
    tone: 'primary',
    disabled: true,
  });
  assert.deepEqual(getConnectionActionState({ loading: false, connected: true }), {
    label: 'Connected',
    tone: 'success',
    disabled: true,
  });
  assert.deepEqual(getConnectionActionState({ loading: true, connected: true }), {
    label: 'Connected',
    tone: 'success',
    disabled: true,
  });
});

test('connected action preserves its success styling while disabled', () => {
  const sx = getConnectedActionDisabledSx({
    palette: {
      success: { main: '#4fae2c' },
      opacity: { statusBackground: 0.14, statusBorder: 0.3 },
    },
  });

  assert.deepEqual(sx, {
    '&.Mui-disabled': {
      color: '#4fae2c',
      backgroundColor: 'rgba(79, 174, 44, 0.14)',
      borderColor: 'rgba(79, 174, 44, 0.3)',
    },
  });
});
