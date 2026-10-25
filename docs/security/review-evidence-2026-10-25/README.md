# Review reproduction evidence — 2026-10-25

Run from the repository root with the installed backend environment:

```bash
mkdir -p /tmp/moonlit-review-20261025
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_stream_persistence_probe.py
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_reproductions.py
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_metadata_reproductions.py
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_pool_reproductions.py
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_index_retry.py
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_limiter.py
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_compaction.py
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_history_size.py
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_react_budget.py
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_budget.py
```

Each command exercises defects and asserts the currently defective behavior; exit 0 means the reproduction succeeded. These are evidence probes, not regression tests claiming the application is correct. Proposed regression assertions are described in the report. No proposed fixes were implemented or tested.

Scripts select testing configuration before application imports, disable dotenv, use synthetic local data and substitute external service boundaries. They do not start application lifespan or call live databases, Firebase, Redis, Bedrock or Qdrant. Some use a 5ms local timer or inline dispatch to accommodate this sandbox's worker-thread selector wake behavior; details are in the report. Driver parsing, installed LangGraph, real application functions and ASGI handling are used where specified. Simulated state and latency are explicitly identified in output and report limitations.

`environment.json` records the actual installed versions; `snapshot.json` contains the reviewed commit, complete initial Git status and SHA-256 source hashes. `assignments.json` records the three nonoverlapping ownership groups. Files ending `_coordinator.out` and `api_coordinator_rerun.out` contain independent coordinator results, separate from specialist outputs. `verification.json` records accepted IDs, exact commands, output files and evidence fingerprints. `snapshot-verification.json` records final drift checks.

The generic graph results in `graph_budget.py` are diagnostic only. They do not establish ordinary production ReAct continuation behavior because installed LangGraph's RemainingSteps guard prevents that route. Use `graph_react_budget.py` for the confirmed resume and premature-completion findings.
