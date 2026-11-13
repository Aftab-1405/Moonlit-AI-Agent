import { useLayoutEffect, useRef } from 'react';
import { updateProfile } from '@/theme/appearance';
import { createAppearanceSemanticTokens } from '@/theme/tokens/semantic';

export function profileVariables(appearance, mode, patch) {
  const next = patch ? updateProfile(appearance, mode, patch) : appearance;
  const s = createAppearanceSemanticTokens(next, mode);
  return {
    '--profile-bg': s.background.default,
    '--profile-ink': s.text.primary,
    '--profile-secondary': s.text.secondary,
    '--profile-border': s.border.idle,
    '--profile-separator': s.divider,
    '--profile-hover': s.action.hover,
    '--profile-selected': s.action.selected,
    '--profile-accent': s.accent.foreground,
    '--profile-accent-main': s.accent.main,
    '--profile-on-accent': s.accent.contrastText,
    '--profile-user-message-bg': s.userMessage.background,
    '--profile-user-message-ink': s.userMessage.foreground,
    '--profile-user-message-selection-ink': s.userMessage.selectionForeground,
    '--profile-selection': s.textSelection.background,
    '--profile-selection-ink': s.textSelection.foreground,
    '--profile-composer-bg': s.composerAction.background,
    '--profile-composer-ink': s.composerAction.foreground,
    '--profile-error': s.error.main,
  };
}

/** Transient palette painting stays within the edited profile's cards, outside the panel render loop. */
export function useProfilePreview(appearance) {
  const cards = useRef({});
  const paint = (mode, patch) => {
    const variables = profileVariables(appearance, mode, patch);
    for (const node of Object.values(cards.current[mode] || {}))
      if (node)
        for (const [key, value] of Object.entries(variables)) node.style.setProperty(key, value);
  };
  const cancel = () => {
    for (const mode of ['light', 'dark']) paint(mode);
  };
  useLayoutEffect(() => {
    // Reconcile committed edits and external resets before the next browser paint.
    for (const mode of ['light', 'dark']) {
      const variables = profileVariables(appearance, mode);
      for (const node of Object.values(cards.current[mode] || {}))
        if (node)
          for (const [key, value] of Object.entries(variables)) node.style.setProperty(key, value);
    }
  }, [appearance]);
  return {
    ref: (mode, kind) => (node) => {
      (cards.current[mode] ||= {})[kind] = node;
    },
    // Controls coalesce pointer updates to one animation frame before calling this.
    preview: paint,
    cancel,
  };
}
