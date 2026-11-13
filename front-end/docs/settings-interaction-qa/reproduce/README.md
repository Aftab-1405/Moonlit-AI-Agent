# Reproduce the Settings interaction fixture

Run from the frontend root with the project's installed Node/npm and Chrome. These files are QA fixtures, not production authentication. `.txt` suffixes keep temporary source snapshots outside normal lint/build inputs.

1. Copy each `.interaction-*.txt` file in this folder into the frontend root, removing only its `.txt` suffix. Preserve the leading dot.
2. Run `npm run dev -- --config .interaction-qa.config.mjs --port 5173` for current components. For the saved before components, run `npm run dev -- --config .interaction-baseline.config.mjs --port 5175` separately.
3. Start a dedicated Chrome with `--headless --no-sandbox --disable-dev-shm-usage --disable-gpu --user-data-dir=/tmp/moonlit-interaction-reproduction --remote-debugging-port=9333 about:blank`.
4. Run these scripts sequentially from the frontend root (replace `REPRO` with this directory's path):
   - `QA_URL=http://127.0.0.1:5175/.interaction-qa.html node REPRO/moonlit-interaction-baseline.mjs` — before screenshots/metrics.
   - `node REPRO/moonlit-interaction-after.mjs` — state matrix and actual pointer/touch checks.
   - `node REPRO/moonlit-interaction-supplement.mjs` — keyboard, reset, previews, blur/backdrop and cancellation.
   - `node REPRO/moonlit-interaction-companions.mjs` — companion hover, tooltips, clipboard and touch targets.
   - `node REPRO/moonlit-interaction-perf.mjs after` — current 100-move workload.
   - `node REPRO/moonlit-interaction-brief-trace.mjs` — short Advanced/picker trace.

Scripts overwrite evidence in `docs/settings-interaction-qa/`. Use an isolated copy if preserving delivered results. Do not run tests/build concurrently with profiling. Wait for Vite dependency optimization before measuring. The fixture mounts real Settings, composer, CodeMirror and Perspective with three synthetic rows. Desktop performance uses width800 for the hidden workspace; its mobile width is bounded to the viewport to avoid affecting mobile zoom.

Stop the dedicated servers/browser and remove the copied root `.interaction-*` fixtures afterward. No backend or authenticated reference service is involved. Navigation is checked against the requested document loader to avoid reading an earlier page. Native key codes, pointer capture, touch emulation and settled popover geometry are exercised through the Chrome DevTools Protocol.
