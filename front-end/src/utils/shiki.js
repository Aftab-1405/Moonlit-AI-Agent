import { createHighlighter } from 'shiki';
import { moonlitDarkShikiTheme, moonlitLightShikiTheme } from '@/theme/syntaxPalettes';

let highlighterInstance = null;
let highlighterPromise = null;

/**
 * Returns a singleton instance of the Shiki highlighter.
 * Lazily loads languages and themes on demand.
 */
export function getShikiHighlighter() {
  if (highlighterInstance) {
    return Promise.resolve(highlighterInstance);
  }
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [moonlitDarkShikiTheme, moonlitLightShikiTheme],
      langs: ['sql', 'javascript', 'python', 'json', 'html', 'css', 'bash', 'diff'],
    }).then((instance) => {
      highlighterInstance = instance;
      return instance;
    });
  }
  return highlighterPromise;
}
