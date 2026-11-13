# App-wide pointer focus feedback

User scope: remove click-induced active borders across the application, and remove the conversation ellipsis's circular hover fill. Preserve useful idle/hover boundaries, validation, selected states, disabled controls, keyboard navigation, routing and editor state.

1. Inventory all focus, active-border and focus-within rules, shared field helpers and their consumers. Reproduce the outlined field and conversation hover cascade in Chrome before changing production styles.
2. Use the existing input-modality tracking to distinguish pointer text editing from keyboard navigation. Give shared MUI input variants stable pointer borders and keyboard-only focus outlines; suppress stale library focus outlines for pointer interactions. Remove the Appearance-specific pointer accent outline. Match specificity for the conversation's intentional transparent action treatment.
3. Exercise actual components plus shared paths: authentication, database connection, General/Appearance, model search/composer, conversation actions and SQL editor. Verify light/dark, menus, touch, keyboard entry/return focus, error/disabled/selected states. Save before/after measurements and representative screenshots.
4. Run focused and full tests, lint, build and diff checks. Deliver a concise audit/results report and preserve unrelated work. No commits or deployment.
