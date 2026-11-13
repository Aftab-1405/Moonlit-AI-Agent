import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
const script = readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
it('applies a validated non-sensitive boot snapshot before React starts', () => {
  localStorage.setItem(
    'moonlit-appearance-boot-v1',
    JSON.stringify({ version: 1, mode: 'light', light: { surface: '#FCFCFC', ink: '#0D0D0D' } }),
  );
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  Function(script)();
  expect(document.documentElement.getAttribute('data-moonlit-color-scheme')).toBe('light');
  expect(document.documentElement.style.backgroundColor).toBe('rgb(252, 252, 252)');
  localStorage.setItem('moonlit-appearance-boot-v1', 'broken');
  Function(script)();
  expect(document.documentElement.getAttribute('data-moonlit-color-scheme')).toBe('dark');
  vi.unstubAllGlobals();
});
