"""Safe local-only setup shared by graph review probes."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
os.environ.update({
    "APP_ENV": "testing", "PYTHON_DOTENV_DISABLED": "1",
    "DEV_AUTH_BYPASS": "false", "RATELIMIT_ENABLED": "false",
    "VAMP_MEMORY_ENABLED": "false", "LLM_RATELIMIT_ENABLED": "false",
    "USER_QUOTA_ENABLED": "false",
    "SECRET_KEY": "test-only-secret-key-do-not-use-in-production-32chars",
    "LOG_FILE": "/tmp/moonlit-review-20261025/graph.log",
    "AUDIT_LOG_FILE": "/tmp/moonlit-review-20261025/graph-audit.log",
})
sys.path.insert(0, str(ROOT / "back-end"))
