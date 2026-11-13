import { expect, it } from 'vitest';
import { getContrastRatio } from '@mui/material/styles';
import { DEFAULT_APPEARANCE, selectPreset, updateProfile } from './appearance';
import { createAppearanceSemanticTokens, getAccentBase } from './tokens/semantic';
import { profileVariables } from '@/features/overlays/settings/profilePreview';

const cases = [
  ['light', 'purple', '#A67DF2', '#8952EE', '#EDE5FC', '#291947', '#A67DF259'],
  ['dark', 'purple', '#A67DF2', '#7849D1', '#4E2F88', '#F8F5FD', '#8952EE99'],
  ['light', 'blue', '#3A83F7', '#2C67C5', '#E8F3FE', '#0C274A', '#539AF859'],
  ['dark', 'blue', '#3A83F7', '#2C67C5', '#173E76', '#F6FAFE', '#3A83F799'],
];
it.each(
  cases,
)('maps measured %s/%s roles through the profile', (mode, color, base, solid, bg, fg, selection) => {
  const a = updateProfile(selectPreset(DEFAULT_APPEARANCE, mode, 'chatgpt'), mode, {
    accent: color,
  });
  const s = createAppearanceSemanticTokens(a, mode);
  expect(s.accent.base).toBe(base);
  expect(getAccentBase(a.profiles[mode], mode)).toBe(base);
  expect(s.accent.main).toBe(solid);
  expect(s.accent.contrastText).toBe('#FFFFFF');
  expect(s.userMessage).toMatchObject({ background: bg, foreground: fg });
  expect(s.textSelection.background).toBe(selection);
  expect(s.composerAction).toMatchObject({ background: solid, foreground: '#FFFFFF' });
  expect(getContrastRatio(bg, fg)).toBeGreaterThanOrEqual(4.5);
});
it.each(['light', 'dark'])('keeps generated pairs readable and previews isolated in %s', (mode) => {
  for (const accent of ['default', 'white', 'yellow', 'custom']) {
    const a = updateProfile(DEFAULT_APPEARANCE, mode, { accent, customAccent: '#010203' });
    const s = createAppearanceSemanticTokens(a, mode);
    for (const role of [s.userMessage, s.composerAction])
      expect(getContrastRatio(role.background, role.foreground)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(s.accent.main, s.accent.contrastText)).toBeGreaterThanOrEqual(4.5);
    const selection = s.textSelection.background;
    const opacity = parseInt(selection.slice(7), 16) / 255;
    for (const surface of ['default', 'paper', 'input', 'composer']) {
      const composite =
        '#' +
        [1, 3, 5]
          .map((i) =>
            Math.round(
              parseInt(s.background[surface].slice(i, i + 2), 16) * (1 - opacity) +
                parseInt(selection.slice(i, i + 2), 16) * opacity,
            )
              .toString(16)
              .padStart(2, '0'),
          )
          .join('');
      expect(
        getContrastRatio(composite, s.textSelection.foreground),
        `${accent}/${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(a.profiles[mode].custom).toBe(false);
    const preview = profileVariables(a, mode, { accent: 'custom', customAccent: '#1254AB' });
    const committed = createAppearanceSemanticTokens(
      updateProfile(a, mode, { accent: 'custom', customAccent: '#1254AB' }),
      mode,
    );
    expect(preview['--profile-user-message-bg']).toBe(committed.userMessage.background);
    expect(preview['--profile-selection']).toBe(committed.textSelection.background);
    expect(a.profiles[mode].customAccent).toBe('#010203');
  }
});
