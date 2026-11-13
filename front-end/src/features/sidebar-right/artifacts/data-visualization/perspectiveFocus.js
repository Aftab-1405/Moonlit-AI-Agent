/** Pinned Perspective controls live in a shadow root, outside MUI's field rules. */
export function applyPerspectiveFocusStyles(viewer) {
  const root = viewer.shadowRoot;
  if (!root || root.querySelector('[data-moonlit-focus]')) return;
  const style = document.createElement('style');
  style.dataset.moonlitFocus = '';
  // Match the idle surface. The inherited outline follows the app's input modality;
  // the viewer's separate invalid/selected states retain their existing treatment.
  style.textContent = `
    :host .column-empty-input:focus:not(:disabled) {
      border-color: transparent;
      background-color: var(--psp-placeholder--background);
      color: inherit;
      outline: var(--moonlit-keyboard-focus-outline, none);
      outline-offset: 2px;
    }
  `;
  root.appendChild(style);
}
