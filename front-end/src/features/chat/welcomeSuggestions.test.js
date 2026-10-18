import assert from 'node:assert/strict';
import test from 'node:test';
import * as welcomeSuggestionsModel from './welcomeSuggestions.js';
import {
  getSuggestionNavigationIndex,
  getWelcomeCategories,
  getWelcomeGreeting,
  getWelcomePeriod,
  runWelcomeEntry,
} from './welcomeSuggestions.js';

const atHour = (hour) => new Date(2026, 7, 16, hour, 0, 0);

test('welcome greeting refresh delay targets the next local period boundary', () => {
  assert.equal(typeof welcomeSuggestionsModel.getWelcomePeriodBoundaryDelay, 'function');

  assert.equal(
    welcomeSuggestionsModel.getWelcomePeriodBoundaryDelay(new Date(2026, 7, 16, 4, 59, 59, 250)),
    750,
  );
  assert.equal(
    welcomeSuggestionsModel.getWelcomePeriodBoundaryDelay(new Date(2026, 7, 16, 5, 0, 0)),
    7 * 60 * 60 * 1000,
  );
  assert.equal(
    welcomeSuggestionsModel.getWelcomePeriodBoundaryDelay(new Date(2026, 7, 16, 20, 30, 0)),
    30 * 60 * 1000,
  );
  assert.equal(
    welcomeSuggestionsModel.getWelcomePeriodBoundaryDelay(new Date(2026, 7, 16, 21, 0, 0)),
    8 * 60 * 60 * 1000,
  );
});

test('welcome periods switch at the approved local-time boundaries', () => {
  assert.equal(getWelcomePeriod(atHour(4)), 'tonight');
  assert.equal(getWelcomePeriod(atHour(5)), 'this morning');
  assert.equal(getWelcomePeriod(atHour(11)), 'this morning');
  assert.equal(getWelcomePeriod(atHour(12)), 'this afternoon');
  assert.equal(getWelcomePeriod(atHour(16)), 'this afternoon');
  assert.equal(getWelcomePeriod(atHour(17)), 'this evening');
  assert.equal(getWelcomePeriod(atHour(20)), 'this evening');
  assert.equal(getWelcomePeriod(atHour(21)), 'tonight');
});

test('welcome greeting uses the first display-name token and has a no-name fallback', () => {
  assert.equal(
    getWelcomeGreeting({ date: atHour(22), displayName: 'Aftab Nadaf' }),
    'What are we exploring tonight, Aftab?',
  );
  assert.equal(
    getWelcomeGreeting({ date: atHour(9), displayName: '   ' }),
    'What are we exploring this morning?',
  );
  assert.equal(
    getWelcomeGreeting({ date: atHour(14), displayName: null }),
    'What are we exploring this afternoon?',
  );
});

test('connected catalog exposes the approved categories with five prompt actions each', () => {
  const categories = getWelcomeCategories(true);
  assert.deepEqual(
    categories.map(({ id, label }) => ({ id, label })),
    [
      { id: 'explore-schema', label: 'Explore schema' },
      { id: 'write-sql', label: 'Write SQL' },
      { id: 'analyze-data', label: 'Analyze data' },
      { id: 'moonlits-choice-connected', label: "Moonlit's choice" },
    ],
  );
  for (const category of categories) {
    assert.equal(category.entries.length, 5);
    assert.ok(category.entries.every((entry) => entry.type === 'prompt'));
    assert.ok(category.entries.every((entry) => entry.prompt.trim().length > 0));
  }
});

test('disconnected catalog avoids schema claims and exposes one database action', () => {
  const categories = getWelcomeCategories(false);
  assert.deepEqual(
    categories.map(({ id, label }) => ({ id, label })),
    [
      { id: 'connect-database', label: 'Connect database' },
      { id: 'understand-moonlit', label: 'Understand Moonlit' },
      { id: 'plan-query', label: 'Plan a query' },
      { id: 'moonlits-choice-disconnected', label: "Moonlit's choice" },
    ],
  );
  for (const category of categories) assert.equal(category.entries.length, 5);
  const actions = categories.flatMap((category) => category.entries);
  assert.equal(actions.filter((entry) => entry.type === 'openDatabase').length, 1);
  assert.ok(actions.filter((entry) => entry.type === 'prompt').every((entry) => entry.prompt));
});

test('suggestion keyboard navigation wraps and supports Home and End', () => {
  assert.equal(
    getSuggestionNavigationIndex({ key: 'ArrowDown', currentIndex: 4, itemCount: 5 }),
    0,
  );
  assert.equal(
    getSuggestionNavigationIndex({ key: 'ArrowRight', currentIndex: 1, itemCount: 5 }),
    2,
  );
  assert.equal(getSuggestionNavigationIndex({ key: 'ArrowUp', currentIndex: 0, itemCount: 5 }), 4);
  assert.equal(
    getSuggestionNavigationIndex({ key: 'ArrowLeft', currentIndex: 3, itemCount: 5 }),
    2,
  );
  assert.equal(getSuggestionNavigationIndex({ key: 'Home', currentIndex: 3, itemCount: 5 }), 0);
  assert.equal(getSuggestionNavigationIndex({ key: 'End', currentIndex: 0, itemCount: 5 }), 4);
  assert.equal(getSuggestionNavigationIndex({ key: 'Tab', currentIndex: 0, itemCount: 5 }), null);
});

test('prompt dispatch sends once only when sending is allowed', () => {
  const sent = [];
  const entry = { type: 'prompt', prompt: 'Inspect the schema' };
  assert.equal(
    runWelcomeEntry(entry, { canSend: false, onSend: (value) => sent.push(value) }),
    false,
  );
  assert.deepEqual(sent, []);
  assert.equal(
    runWelcomeEntry(entry, { canSend: true, onSend: (value) => sent.push(value) }),
    true,
  );
  assert.deepEqual(sent, ['Inspect the schema']);
});

test('database dispatch opens the modal without sending a prompt', () => {
  const calls = [];
  const handled = runWelcomeEntry(
    { type: 'openDatabase' },
    {
      canSend: true,
      onSend: () => calls.push('send'),
      onOpenDatabase: () => calls.push('database'),
    },
  );
  assert.equal(handled, true);
  assert.deepEqual(calls, ['database']);
  assert.equal(runWelcomeEntry({ type: 'openDatabase' }, { canSend: true }), false);
});

test('stage transitions stay locked until exit completion and then allow the reverse transition', () => {
  assert.equal(typeof welcomeSuggestionsModel.createWelcomeInteractionGuard, 'function');
  assert.equal(typeof welcomeSuggestionsModel.beginWelcomeStageTransition, 'function');

  const guard = welcomeSuggestionsModel.createWelcomeInteractionGuard();
  const stages = [];

  assert.equal(
    welcomeSuggestionsModel.beginWelcomeStageTransition(guard, () => stages.push('panel')),
    true,
  );
  assert.equal(guard.isLocked(), true);
  assert.equal(
    welcomeSuggestionsModel.beginWelcomeStageTransition(guard, () => stages.push('categories')),
    false,
  );
  assert.deepEqual(stages, ['panel']);

  guard.completeTransition();
  assert.equal(guard.isLocked(), false);
  assert.equal(
    welcomeSuggestionsModel.beginWelcomeStageTransition(guard, () => stages.push('categories')),
    true,
  );
  assert.deepEqual(stages, ['panel', 'categories']);
});

test('guarded prompt activation dispatches exactly once during an exit transition', () => {
  assert.equal(typeof welcomeSuggestionsModel.createWelcomeInteractionGuard, 'function');
  assert.equal(typeof welcomeSuggestionsModel.runGuardedWelcomeActivation, 'function');

  const guard = welcomeSuggestionsModel.createWelcomeInteractionGuard();
  const sent = [];
  const activate = () =>
    runWelcomeEntry(
      { type: 'prompt', prompt: 'Inspect the schema' },
      { canSend: true, onSend: (value) => sent.push(value) },
    );

  assert.equal(welcomeSuggestionsModel.runGuardedWelcomeActivation(guard, activate), true);
  assert.equal(welcomeSuggestionsModel.runGuardedWelcomeActivation(guard, activate), false);
  assert.deepEqual(sent, ['Inspect the schema']);

  guard.completeTransition();
  assert.equal(welcomeSuggestionsModel.runGuardedWelcomeActivation(guard, activate), true);
  assert.deepEqual(sent, ['Inspect the schema', 'Inspect the schema']);
});

test('rejected prompt activation unlocks while database activation remains independent of send state', () => {
  assert.equal(typeof welcomeSuggestionsModel.createWelcomeInteractionGuard, 'function');
  assert.equal(typeof welcomeSuggestionsModel.runGuardedWelcomeActivation, 'function');

  const promptGuard = welcomeSuggestionsModel.createWelcomeInteractionGuard();
  const calls = [];
  assert.equal(
    welcomeSuggestionsModel.runGuardedWelcomeActivation(promptGuard, () =>
      runWelcomeEntry(
        { type: 'prompt', prompt: 'Inspect the schema' },
        { canSend: false, onSend: () => calls.push('send') },
      ),
    ),
    false,
  );
  assert.equal(promptGuard.isLocked(), false);

  const databaseGuard = welcomeSuggestionsModel.createWelcomeInteractionGuard();
  assert.equal(
    welcomeSuggestionsModel.runGuardedWelcomeActivation(databaseGuard, () =>
      runWelcomeEntry(
        { type: 'openDatabase' },
        {
          canSend: false,
          onSend: () => calls.push('send'),
          onOpenDatabase: () => calls.push('database'),
        },
      ),
    ),
    true,
  );
  assert.equal(databaseGuard.isLocked(), true);
  assert.deepEqual(calls, ['database']);
});

test('database availability keeps its mixed category reachable when prompt sending is disabled', () => {
  assert.equal(typeof welcomeSuggestionsModel.isWelcomeEntryDisabled, 'function');
  assert.equal(typeof welcomeSuggestionsModel.isWelcomeCategoryDisabled, 'function');

  const [connectDatabase, understandMoonlit] = getWelcomeCategories(false);
  const availableDatabaseOptions = { promptDisabled: true, canOpenDatabase: true };

  assert.equal(
    welcomeSuggestionsModel.isWelcomeEntryDisabled({ type: 'prompt' }, availableDatabaseOptions),
    true,
  );
  assert.equal(
    welcomeSuggestionsModel.isWelcomeEntryDisabled(
      { type: 'openDatabase' },
      availableDatabaseOptions,
    ),
    false,
  );
  assert.equal(
    welcomeSuggestionsModel.isWelcomeCategoryDisabled(connectDatabase, availableDatabaseOptions),
    false,
  );
  assert.equal(
    welcomeSuggestionsModel.isWelcomeCategoryDisabled(understandMoonlit, availableDatabaseOptions),
    true,
  );
  assert.equal(
    welcomeSuggestionsModel.isWelcomeCategoryDisabled(connectDatabase, {
      promptDisabled: true,
      canOpenDatabase: false,
    }),
    true,
  );
});

test('suggestion motion opens the panel before staggering rows and closes it after rows', () => {
  assert.equal(typeof welcomeSuggestionsModel.getWelcomeSuggestionMotion, 'function');

  const { panelVariants, itemVariants } = welcomeSuggestionsModel.getWelcomeSuggestionMotion(false);

  assert.equal(panelVariants.open.scaleY, 1);
  assert.equal(panelVariants.open.transition.when, 'beforeChildren');
  assert.ok(panelVariants.open.transition.staggerChildren > 0);
  assert.equal(itemVariants.open.opacity, 1);
  assert.equal(itemVariants.open.y, 0);

  assert.equal(panelVariants.closed.scaleY, 0);
  assert.equal(panelVariants.closed.transition.when, 'afterChildren');
  assert.ok(panelVariants.closed.transition.staggerChildren > 0);
  assert.equal(itemVariants.closed.opacity, 0);
  assert.ok(itemVariants.closed.y < 0);
});

test('suggestion panel is the sole animated transition source', () => {
  const { containerLayout, stageTransition, panelVariants } =
    welcomeSuggestionsModel.getWelcomeSuggestionMotion(false);

  assert.equal(containerLayout, false);
  assert.equal(stageTransition.duration, 0);
  assert.equal(panelVariants.closed.scaleY, 0);
  assert.equal(panelVariants.open.scaleY, 1);
});
