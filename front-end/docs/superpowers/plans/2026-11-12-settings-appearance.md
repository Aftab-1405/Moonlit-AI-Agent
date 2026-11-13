# Settings and appearance implementation

The supplied implementation specification and ../docs/chatgpt-appearance-evidence.json define the design. Preserve the current uncommitted workspace and keep the mounted workspace under settings.

1. Extend SettingsModal with grouped 288px navigation, setting registry search, reveal targets, responsive focus-managed drawer, and React Router deep links. Verify launchers, history, refresh and independent scrolling.
2. Add validated local-only version-1 appearance records, separate per-mode profiles, linked accent/preset updates, bounded import/export, deterministic custom palette derivation and measured ChatGPT baseline. Test corrupt records, profile independence, reset and imports.
3. Extend semantic -> component tokens -> shared MUI factory and ThemeContext. Resolve OS color/motion independently, update boot snapshot without reading authentication tokens, preserve modality listeners and account isolation. Test lifecycle and blocked storage.
4. Add Appearance controls using existing preference rows, accessible mode cards, theme/color controls, collapsed advanced controls, import/copy and reset. Test by accessible roles.
5. Make syntax, typography, charts and reading surfaces consume resolved appearance without remounting editors. Integrate only actual content features; document unavailable surfaces.
6. Run tests, build, lint and visual/runtime checks where available. Audit all specification acceptance points; report approximations and missing reference catalog honestly. No deploy or commit.

Only measured ChatGPT and functional Moonlit presets ship. Custom generation and linked profile edits are Moonlit adaptations, not recovered reference algorithms. Appearance remains outside server-sync keys.
