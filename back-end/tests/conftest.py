"""Pytest configuration and shared fixtures.

Select testing configuration and disable dotenv, debug identity bypass, and
background memory before application imports. Individual tests replace their
external service boundaries; this file does not globally block networking or
remove every inherited service credential.
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

# Override ambient deployment settings BEFORE importing the application.
# Tests can explicitly override individual values with monkeypatch afterwards.
os.environ.update(
    APP_ENV="testing",
    PYTHON_DOTENV_DISABLED="1",
    DEV_AUTH_BYPASS="false",
    RATELIMIT_ENABLED="false",
    VAMP_MEMORY_ENABLED="false",
    LLM_RATELIMIT_ENABLED="false",
    USER_QUOTA_ENABLED="false",
    SECRET_KEY="test-only-secret-key-do-not-use-in-production-32chars",
)


@pytest.fixture(scope="session")
def backend_root() -> Path:
    """Return the absolute path to the backend root directory."""
    return _BACKEND_ROOT


@pytest.fixture(autouse=True)
def isolated_account_activity(monkeypatch):
    """Direct dependency tests must not retain admissions in other tests."""
    from core import account_activity

    monkeypatch.setattr(account_activity, "_memory_store", account_activity.AccountActivityStore())


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
