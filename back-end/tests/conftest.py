"""Pytest configuration and shared fixtures.

This conftest makes the test suite hermetic:

- ``Config`` is patched to a ``TestingConfig`` so no real Firestore /
  Redis / Bedrock / Qdrant credentials are required.
- The FastAPI app is instantiated once per session with the testing
  config.
- Common mocks (Redis, Firestore, Bedrock) are exposed as fixtures so
  individual tests can opt in.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Make the backend root importable. The repo root is the parent of ``tests/``.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

# Force the testing configuration BEFORE any application module is imported.
# This prevents ``config.get_config()`` from reading real env vars.
os.environ.setdefault("APP_ENV", "testing")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("TESTING", "true")
os.environ.setdefault("DEV_AUTH_BYPASS", "true")
os.environ.setdefault("RATELIMIT_ENABLED", "false")
os.environ.setdefault("VAMP_MEMORY_ENABLED", "false")
os.environ.setdefault("LLM_RATELIMIT_ENABLED", "false")
os.environ.setdefault("USER_QUOTA_ENABLED", "false")
# SECRET_KEY is validated at import time — set a test-only value.
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-do-not-use-in-production-32chars")


@pytest.fixture(scope="session")
def backend_root() -> Path:
    """Return the absolute path to the backend root directory."""
    return _BACKEND_ROOT


@pytest.fixture(autouse=True)
def isolated_account_activity(monkeypatch):
    """Direct dependency tests must not retain admissions in other tests."""
    from core import account_activity

    monkeypatch.setattr(account_activity, '_memory_store', account_activity.AccountActivityStore())


@pytest.fixture
def fresh_audit_log_handler(monkeypatch):
    """Yield a buffer attached to the ``audit`` logger.

    Tests that assert on audit-event content can read the buffer.
    """
    import io
    import logging

    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    handler.setLevel(logging.INFO)
    audit_logger = logging.getLogger("audit")
    audit_logger.addHandler(handler)
    audit_logger.setLevel(logging.INFO)
    yield buf
    audit_logger.removeHandler(handler)
