# Moonlit workspace context and outputs

Adapt the inspected ChatGPT Work patterns using Moonlit's existing dark MUI shell,
composer, SQL editor and Perspective viewer. Preserve the user's staged changes;
work in the current checkout and do not commit.

1. Add a searchable database/schema utility bar below the existing composer, with
   direct access to connection and database-context settings. Preserve drafts,
   send/stop, slash commands and model selection.
2. Derive completed SQL, diagram and query-result outputs from conversation history.
   Keep manually opened results and canvas selection scoped to the stable chat session.
   Do not attribute historical results to the currently connected database.
3. Add a compact Outputs/Sources popover in chat and the artifact panel. Reuse the
   same output records and existing resizable/fullscreen artifact host. Load saved
   query results through the existing API with loading, retry and empty states.
4. Make every result with source SQL able to reopen the editor with its data.
   Preserve SQL tabs per conversation and retain the existing Perspective chart controls.
5. Verify history extraction, session isolation, stale async completions, context search,
   and result loading. Run full tests, lint, build, available audits and responsive
   browser checks. Update memory and phases with outcomes and limitations.

Baseline: 28 Node test files and 55 component tests passed before changes.
No new dependency, backend endpoint, navigation rail or artificial mode switch is needed.


## Execution record

All five steps implemented in the existing worktree without commits. Added direct inline result
navigation so the output picker and transcript open the same saved execution. Reused the existing
chat-session cache after review demonstrated that page-local state lost SQL tabs on Dashboard
navigation. Recovered cached draft→conversation identity on route remount. Review regressions
were reproduced before fixing and then passed.

Verification: 29 Node test files and 67 component tests passed; focused tests, ESLint and build
passed. REA scenarios: mobile context/output selection `ev_a38aee1b69d66083f8e739bb9c07c65f7c9a5001971d48c4184fa2408a56d93c`,
desktop result/fullscreen/SQL `ev_858e252ff9382832c0510600e4f7e4f37e23beea1c0a388f40adf89ee14f24d2`,
mobile retry/drafts `ev_1ca38dfcdb33bd6e52940b4ab8f3d1cc327e72be4f5e9672c6b43ad2e92e6d28`,
and tablet inline-result/schema `ev_ff19d37b1e87c08968a57074eb7df7a363f79858b76514fc213f4442613eacf7`.
These are controlled synthetic fixtures, not evidence of live database execution. The temporary
fixture was removed. Existing Perspective chunk warning and two baseline Knip unused exports
remain; no unrelated cleanup was applied.
