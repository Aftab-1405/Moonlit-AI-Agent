/**
 * SlashCommandMenu — inline command palette triggered by typing "/" at the
 * start of the chat input.
 *
 * Currently supports task-mode selection:
 *   /standard  → set task mode to Standard (50 steps)
 *   /tool      → set task mode to Tool Task (100 steps)
 *   /long      → set task mode to Long Task (200 steps)
 *
 * Why a slash menu instead of a toolbar button?
 * ----------------------------------------------
 * The composer toolbar was getting visually noisy (Database, Schema,
 * SQL Editor, Task Mode, Model, Send). Slash commands are a familiar
 * pattern from Slack / Discord / Notion that keeps the toolbar clean
 * while still giving power users fast, keyboard-driven access to every
 * option. The menu only appears when the user types "/" as the first
 * character — zero chrome at rest.
 *
 * Behavior
 * --------
 * - Opens when message starts with "/" and the user has typed at least
 *   one character after it.
 * - Filters commands by prefix match (case-insensitive).
 * - Keyboard: ArrowUp/Down to move highlight, Enter/Tab to select,
 *   Escape to close without selecting.
 * - Mouse: hover to highlight, click to select.
 * - On select: calls onSelect(command) with the chosen command. The
 *   caller is responsible for stripping the slash text from the input
 *   and applying the command's action.
 * - The menu is positioned absolutely relative to the composer wrapper,
 *   anchored to the top-left of the input area so it floats above the
 *   text field.
 */
import { Box, Paper, Popper, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppPopoverItem, AppPopoverList, AppPopoverSectionLabel } from '@/components';
import { CheckIcon } from '@/components/icons';
import { TASK_MODE_OPTIONS } from '@/config/userSettings';
import { getPopoverPaperSx, UI_POPOVER } from '@/styles/shared';

/**
 * Build the list of available slash commands.
 *
 * Each command has:
 *   - id: stable identifier
 *   - label: what to show in the menu (e.g., "Long Task")
 *   - command: the slash token the user types (e.g., "/long")
 *   - alias: alternative triggers (e.g., "/longtask")
 *   - description: one-line help text
 *   - value: the backend task_mode value to apply
 *   - group: "Task Mode" (used for the section header)
 */
function buildSlashCommands(currentTaskMode) {
  const commands = [];

  // One command per actionable task-mode option. "Auto" is omitted
  // because it's the default — there's no need for a slash command to
  // return to the default state; just don't set a mode.
  for (const option of TASK_MODE_OPTIONS) {
    if (option.value === 'auto') continue;

    const shorthand =
      option.value === 'normal' ? 'standard' : option.value === 'tool_task' ? 'tool' : 'long';
    commands.push({
      id: `mode-${option.value}`,
      label: option.label,
      command: `/${shorthand}`,
      aliases:
        option.value === 'tool_task'
          ? ['/tooltask', '/tool_task']
          : option.value === 'long_task'
            ? ['/longtask', '/long_task']
            : option.value === 'normal'
              ? ['/normal']
              : [],
      description: option.description,
      value: option.value,
      group: 'Task Mode',
      isCurrent: currentTaskMode === option.value,
    });
  }

  return commands;
}

/**
 * Extract the slash query from a message string.
 *
 * Returns null if the message does not start with "/" — the menu should
 * not be shown. Returns the substring after "/" (lowercased for
 * matching) otherwise.
 *
 *   "/long"          → "long"
 *   "/mode analyze"  → "mode"   (only the first token matters for filtering)
 *   "hello /mode"    → null     (slash not at start)
 *   "/"              → ""       (menu open, no filter)
 */
const SlashCommandMenu = memo(function SlashCommandMenu({
  anchorEl,
  query,
  currentTaskMode,
  onSelect,
  onClose,
}) {
  const theme = useTheme();
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listRef = useRef(null);

  const allCommands = useMemo(() => buildSlashCommands(currentTaskMode), [currentTaskMode]);

  // Filter by the typed query. Empty query shows everything.
  const filteredCommands = useMemo(() => {
    if (!query) return allCommands;
    return allCommands.filter((cmd) => {
      const tokens = [cmd.command, ...(cmd.aliases || [])].map((t) => t.toLowerCase());
      return tokens.some((t) => t.includes(query));
    });
  }, [allCommands, query]);
  const safeHighlightedIndex = Math.min(highlightedIndex, Math.max(filteredCommands.length - 1, 0));
  // Scroll the highlighted item into view.
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.querySelector(`[data-slash-index="${safeHighlightedIndex}"]`);
    if (item && typeof item.scrollIntoView === 'function') {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [safeHighlightedIndex]);

  // Listen for keyboard events on the anchor's owner document. We use
  // a capture-phase listener so we can intercept Arrow/Enter/Escape
  // before the TextField processes them.
  //
  // FIX [SCOPE-KEYS]: The listener only intercepts events whose target
  // is inside the composer (anchorEl) or the menu itself (listRef).
  // Without this guard, Arrow/Enter/Tab/Escape from other focusable
  // elements on the page (sidebar, modals, etc.) would be swallowed.
  useEffect(() => {
    if (!anchorEl) return;
    const handleKey = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      // Only intercept when focus is inside the composer or the menu.
      const target = e.target;
      const isInsideComposer = anchorEl?.contains?.(target);
      const isInsideMenu = listRef.current?.contains?.(target);
      if (!isInsideComposer && !isInsideMenu) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredCommands[safeHighlightedIndex]) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(filteredCommands[safeHighlightedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // Capture phase so we beat the TextField's own keydown handler.
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [anchorEl, filteredCommands, safeHighlightedIndex, onSelect, onClose]);

  const handleItemClick = useCallback(
    (cmd) => {
      onSelect(cmd);
    },
    [onSelect],
  );

  const handleItemMouseEnter = useCallback((idx) => {
    setHighlightedIndex(idx);
  }, []);

  if (!anchorEl || filteredCommands.length === 0) return null;

  return (
    <Popper
      open
      anchorEl={anchorEl}
      placement="top-start"
      modifiers={[
        {
          name: 'offset',
          options: { offset: [0, 10] },
        },
        {
          name: 'flip',
          options: { fallbackPlacements: ['bottom-start'] },
        },
        {
          name: 'preventOverflow',
          options: { padding: 12 },
        },
      ]}
      style={{ zIndex: theme.zIndex.modal + 100 }}
    >
      <Paper
        elevation={0}
        sx={getPopoverPaperSx(theme, {
          width: 332,
          maxWidth: 'calc(100vw - 24px)',
          p: UI_POPOVER.paperPadding,
          overflow: 'hidden',
        })}
      >
        <AppPopoverSectionLabel>Task mode</AppPopoverSectionLabel>
        <AppPopoverList ref={listRef} role="menu" aria-label="Task mode commands" maxHeight={240}>
          {filteredCommands.map((cmd, idx) => {
            const isHighlighted = idx === safeHighlightedIndex;
            return (
              <AppPopoverItem
                key={cmd.id}
                data-slash-index={idx}
                role="menuitemradio"
                ariaChecked={cmd.isCurrent}
                selected={isHighlighted}
                reserveTrailing
                onClick={() => handleItemClick(cmd)}
                onMouseEnter={() => handleItemMouseEnter(idx)}
                trailing={cmd.isCurrent ? <CheckIcon /> : null}
                label={
                  <Box
                    sx={{
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 1,
                    }}
                  >
                    <Typography
                      noWrap
                      sx={{
                        ...theme.typography.uiMenuItemSm,
                        minWidth: 0,
                        color: 'text.primary',
                        fontWeight: 400,
                      }}
                    >
                      {cmd.label}
                    </Typography>
                    <Typography
                      component="code"
                      noWrap
                      sx={{
                        flexShrink: 0,
                        fontFamily: theme.typography.fontFamilyMono,
                        fontSize: 11,
                        lineHeight: 1.4,
                        color: 'text.disabled',
                      }}
                    >
                      {cmd.command}
                    </Typography>
                  </Box>
                }
                description={cmd.description}
                descriptionSx={{ color: 'text.secondary' }}
                sx={{
                  '&.Mui-selected code': { color: 'text.secondary' },
                }}
              />
            );
          })}
        </AppPopoverList>
      </Paper>
    </Popper>
  );
});

export default SlashCommandMenu;
