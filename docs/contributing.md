# Contributing

Use this guide for development checks, source boundaries, and documentation maintenance. Start with the [root quickstart](../README.md#local-quickstart), then read the guide for the feature you are changing.

## Work safely in the current checkout

Inspect the working tree before editing and preserve unrelated staged and unstaged work. Trace the controller, schema, service/adapter, and frontend consumer before changing a public contract. Keep changes focused and report validation limitations. Do not create commits or rewrite another person's work without authorization.

Implement new behavior with a regression test that demonstrates the intended outcome when practical. Prefer state and contract assertions over mock call counts; use barriers and controlled clocks for concurrency tests. Documentation-only edits need link, source-reference, and accuracy checks rather than application tests that cannot detect prose mistakes.

## Source boundaries

- Backend controllers own HTTP concerns; services own workflows; adapters own DBMS behavior. Cross-feature wiring belongs in `composition.py` and typed runtime ports.
- Frontend routes belong in `App.jsx`, request contracts in `src/api/`, shell structure in `AppShell`, and chat coordination in existing feature hooks.
- Reuse existing helpers, schemas, components, and libraries. Add abstractions when a real second consumer or an isolation/testing boundary needs them.
- Keep model/tool output validation, ownership checks, CSRF, model authorization, and source-scoped result/cache behavior intact.
- Use bounded operations and explicit cleanup for streams, background work, cursors, pools, and external clients. Distinguish caller timeout from confirmed cancellation.
- Use safe error helpers and structured logs. Never include secrets, raw connection strings, SQL literals, or external exception text in public errors or audit records.
- Follow the [design system](design-system.md) for tokens, interaction roles, accessibility, responsive geometry, and component exceptions.

## Validation

Run commands from each application's directory. Backend development tools are installed by `uv sync --locked`; use `uv run --locked` so checks resolve through that environment.

```bash
uv run --locked pytest
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy .
```

For a focused backend change, select the relevant modules first:

```bash
uv run --locked pytest tests/test_conversation_history.py -q
uv run --locked pytest tests/test_tool_result_contracts.py -q
```

The backend declares `integration` and `slow` pytest markers. A marker's existence does not guarantee all external calls are isolated; inspect tests and fixtures before running them with credentials. Use controlled data, and do not point tests at production resources. Report existing failures and unexecuted checks separately from regressions.

Before application imports, `tests/conftest.py` forces `APP_ENV=testing` and `PYTHON_DOTENV_DISABLED=1`, disables debug identity bypass, background memory, and limits, and selects a test-only secret. Individual tests can override these settings explicitly. The bootstrap does not remove every inherited service credential or block all networking, so use a credential-free shell and controlled external boundaries. Model-dependent tests must configure their own synthetic allowlist rather than depend on a developer's `.env`.

Frontend validation uses the scripts in [package.json](../front-end/package.json):

```bash
npm test
npm run test:components
npm run lint
npm run biome
npm run knip
npm run build
```

`npm test` runs Node tests followed by Vitest. `test:components` selects only Vitest; it is not a replacement for the full test command. `npm run lint:fix` and `npm run biome:fix` modify files, so review their diff. A successful build is not proof of authenticated or live-database behavior.

Vitest runs at most two workers to bound concurrent MUI/jsdom work. This avoids the timeouts observed when the complete suite oversubscribed the test machine; assertion deadlines remain unchanged.

Run timing-sensitive component tests separately from production builds and other heavy browser work. Biome's hook-dependency analysis can warn about intentional session/source invalidation triggers; verify their lifecycle role before removing a dependency merely because the effect body does not read its value.

Browser verification fixtures and scripts are under [front-end/tests/fixtures/](../front-end/tests/fixtures/) and [front-end/scripts/](../front-end/scripts/). History-scroll and Perspective fixtures exercise controlled component/engine states; they do not establish live Firebase, database, or administrator correctness. Verify keyboard access, focus return, reduced motion, long content, scrolling, narrow layouts, loading/error states, and stale async responses when touching those paths.

Historical test counts, temporary screenshots, and old lint baselines are evidence of a particular run. Report fresh command results; do not copy them into a permanent claim that the repository is green.

### Browser fixture commands

The browser scripts require a separately available Playwright package and a compatible Chrome/Chromium executable; neither is installed by this project's `npm ci`. Run from `front-end/`. Start Vite in one terminal:

```bash
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

In a second terminal, replace the two absolute-path placeholders with your installed package entry point and browser executable:

```bash
export MOONLIT_TEST_URL=http://127.0.0.1:5174
export MOONLIT_PLAYWRIGHT_PATH=/absolute/path/to/playwright/index.mjs
export MOONLIT_CHROME_PATH=/absolute/path/to/chromium
node scripts/verify-history-scroll.mjs
node scripts/verify-perspective.mjs
```

Setting the URL explicitly avoids the scripts' different default ports. Both scripts restrict their fixture URL to loopback and use synthetic data. These commands are separate from `npm test`; running that command does not execute these browser checks.

## Dependencies

Python declarations live in [pyproject.toml](../back-end/pyproject.toml), and [uv.lock](../back-end/uv.lock) pins the resolved graph and artifact hashes. uv is pinned to 0.12.5. Production uses `uv sync --locked --no-dev --no-build`.

To deliberately update a dependency, replace `package_name` and run from `back-end/`:

```bash
uv lock --upgrade-package package_name
uv lock --check
uv sync --locked
uv pip check
uv run --locked pip-audit
```

Review manifest/lock changes and run affected application checks. Frontend installation uses `npm ci` with its committed lockfile. Evaluate maintenance, security, bundle cost, and existing capabilities before adding dependencies.

## Documentation ownership

Keep one repository `README.md` and maintained human documentation under `docs/`. Update the owning guide in the same change as the behavior. Prefer links to code and another guide over copied endpoint lists, dependency manifests, token tables, or status summaries.

| Change | Owning guide |
| --- | --- |
| Onboarding or overall capabilities | Root README |
| Module boundaries or lasting architectural decisions | [Architecture](architecture.md) |
| Environment variables/defaults | [Configuration](configuration.md) |
| Deployment, service lifecycle, recovery | [Operations](operations.md) |
| Requirements, deferred work, unresolved product policy | [Product scope](product.md) |
| Theme or reusable UI behavior | [Design system](design-system.md) |
| Streaming/history/tool evidence | [Conversations](features/conversations.md) |
| SQL/result/analysis behavior | [Database querying](features/database-querying.md) |
| Deletion and recovery guarantees | [Account erasure](features/account-erasure.md) |
| Security finding status and verification | [Security findings](security/findings.md) |

Create a new feature/component guide only when the topic needs a separate reader task or substantial contract. Link it from the README or owning guide. Keep temporary plans and task journals out of the maintained documentation tree; before deleting one, extract unique decisions, unresolved work, and required evidence. Do not recreate paired `memory.md`/`phases.md` histories.

Keep security findings and verification requirements in the security register. Preserve original finding IDs and review context, distinguish historical closure from a new retest, and never turn an audit-complete label into a security-clearance claim. Private findings must stay ignored unless explicitly approved for version control. Keep durable design guidance in the design system; do not retain JSON research dumps, audit-progress logs, or completed task journals.

The four `back-end/skills/*/SKILL.md` files are executable application inputs loaded by the registry. Changes to them require relevant skill/tool contract tests; documentation cleanup must not relocate them.

Before finishing a documentation change, check relative links and heading anchors, table column counts, source/comments for moved paths, commands against manifests, names/defaults against source, and `git diff --check`. Preserve useful content before removing predecessors.
