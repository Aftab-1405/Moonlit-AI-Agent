"""Tests for the Pydantic request schemas (bank-grade input validation).

These tests verify the additive constraints added in FIX [AUDIT-2-D]:

- ``AgentResumeRequest.resume`` caps the number of top-level keys at 64
  and the JSON-serialized size at 64 KiB.
- ``ConnectDBRequest.password`` has a ``max_length=256`` to prevent
  memory-exhaustion via oversized payloads.
- The existing field validators (sanitize_provider, prompt_not_empty,
  etc.) still work as before.
"""

from __future__ import annotations

import pytest


@pytest.mark.parametrize(
    ("request_model", "payload"),
    [
        ("ChatRequest", {"prompt": "hello"}),
        ("AgentResumeRequest", {"conversation_id": "conv-123", "resume": {"action": "continue"}}),
        ("RenameConversationRequest", {"title": "Renamed conversation"}),
        ("ConnectDBRequest", {"db_type": "postgresql"}),
        ("SwitchDatabaseRequest", {"database": "analytics"}),
        ("SelectSchemaRequest", {"schema_name": "public"}),
        ("GetTableSchemaRequest", {"table_name": "orders"}),
        ("RunQueryRequest", {"sql_query": "SELECT 1"}),
        ("SaveUserSettingsRequest", {"theme": "dark"}),
        ("CloseSessionRequest", {"sessionInstanceId": "session-123"}),
        ("SessionActiveRequest", {"sessionInstanceId": "session-123"}),
        ("SetSessionRequest", {"idToken": "token"}),
    ],
)
def test_external_request_models_reject_undeclared_fields(
    request_model: str,
    payload: dict[str, object],
) -> None:
    """Reject extra public JSON keys instead of silently discarding client input."""
    from pydantic import ValidationError

    from api_contract.context import (
        CloseSessionRequest,
        SaveUserSettingsRequest,
        SessionActiveRequest,
    )
    from api_contract.conversations import (
        AgentResumeRequest,
        ChatRequest,
        RenameConversationRequest,
    )
    from api_contract.database import (
        ConnectDBRequest,
        GetTableSchemaRequest,
        RunQueryRequest,
        SelectSchemaRequest,
        SwitchDatabaseRequest,
    )
    from controller.auth_controller import SetSessionRequest

    models = {
        "ChatRequest": ChatRequest,
        "AgentResumeRequest": AgentResumeRequest,
        "RenameConversationRequest": RenameConversationRequest,
        "ConnectDBRequest": ConnectDBRequest,
        "SwitchDatabaseRequest": SwitchDatabaseRequest,
        "SelectSchemaRequest": SelectSchemaRequest,
        "GetTableSchemaRequest": GetTableSchemaRequest,
        "RunQueryRequest": RunQueryRequest,
        "SaveUserSettingsRequest": SaveUserSettingsRequest,
        "CloseSessionRequest": CloseSessionRequest,
        "SessionActiveRequest": SessionActiveRequest,
        "SetSessionRequest": SetSessionRequest,
    }

    with pytest.raises(ValidationError) as exc_info:
        models[request_model](**payload, undeclared_client_field=True)

    assert any(error["type"] == "extra_forbidden" for error in exc_info.value.errors())


def test_set_session_request_rejects_token_over_configured_limit() -> None:
    """Reject Firebase ID tokens that could otherwise exhaust auth-route memory."""
    from pydantic import ValidationError

    from config import get_config
    from controller.auth_controller import SetSessionRequest

    with pytest.raises(ValidationError):
        SetSessionRequest(idToken="x" * (get_config().FIREBASE_ID_TOKEN_MAX_LENGTH + 1))


class TestAgentResumeRequest:
    """Tests for the resume-payload size caps."""

    def test_accepts_small_payload(self) -> None:
        """Accept a small resume dict with a valid conversation_id."""
        from api_contract.conversations import AgentResumeRequest

        req = AgentResumeRequest(
            conversation_id="conv-123",
            resume={"action": "continue"},
        )
        assert req.resume == {"action": "continue"}

    def test_rejects_empty_payload(self) -> None:
        """Reject an empty resume dict."""
        from pydantic import ValidationError

        from api_contract.conversations import AgentResumeRequest

        with pytest.raises(ValidationError):
            AgentResumeRequest(conversation_id="conv-123", resume={})

    def test_rejects_too_many_keys(self) -> None:
        """Reject a resume dict with more than 64 top-level keys."""
        from pydantic import ValidationError

        from api_contract.conversations import AgentResumeRequest

        # 65 keys exceeds the max_length=64 cap.
        payload = {f"k{i}": i for i in range(65)}
        with pytest.raises(ValidationError):
            AgentResumeRequest(conversation_id="conv-123", resume=payload)

    def test_rejects_oversized_serialized_payload(self) -> None:
        """Reject a resume payload whose JSON serialization exceeds 64 KiB."""
        from pydantic import ValidationError

        from api_contract.conversations import AgentResumeRequest

        # One key, but the value is a 100 KiB string — exceeds 64 KiB
        # serialized cap.
        payload = {"big": "x" * (100 * 1024)}
        with pytest.raises(ValidationError):
            AgentResumeRequest(conversation_id="conv-123", resume=payload)

    def test_requires_conversation_id(self) -> None:
        """Reject a request missing the required conversation_id field."""
        from pydantic import ValidationError

        from api_contract.conversations import AgentResumeRequest

        with pytest.raises(ValidationError):
            AgentResumeRequest(resume={"action": "continue"})


class TestConnectDBRequest:
    """Tests for the DB-connect schema."""

    def test_accepts_valid_request(self) -> None:
        """Accept a fully populated DB-connect request."""
        from api_contract.database import ConnectDBRequest

        req = ConnectDBRequest(
            db_type="postgresql",
            host="db.example.com",
            port=5432,
            user="alice",
            password="secret",
            database="customers",
        )
        assert req.db_type == "postgresql"
        assert req.host == "db.example.com"

    def test_rejects_oversized_password(self) -> None:
        """Reject a password longer than 256 characters."""
        from pydantic import ValidationError

        from api_contract.database import ConnectDBRequest

        with pytest.raises(ValidationError):
            ConnectDBRequest(
                db_type="postgresql",
                password="x" * 257,  # exceeds max_length=256
            )

    def test_accepts_max_length_password(self) -> None:
        """Accept a password exactly 256 characters long."""
        from api_contract.database import ConnectDBRequest

        req = ConnectDBRequest(
            db_type="postgresql",
            password="x" * 256,
        )
        assert len(req.password) == 256

    def test_strips_connection_string_whitespace(self) -> None:
        """Strip surrounding whitespace from a quoted connection string."""
        from api_contract.database import ConnectDBRequest

        req = ConnectDBRequest(
            db_type="mysql",
            connection_string='  "mysql://user:pw@host/db"  ',
        )
        assert req.connection_string == "mysql://user:pw@host/db"


class TestChatRequest:
    """Tests for the chat-request schema."""

    def test_accepts_valid_request(self) -> None:
        """Accept a chat request with a non-empty prompt."""
        from api_contract.conversations import ChatRequest

        req = ChatRequest(prompt="Hello, world")
        assert req.prompt == "Hello, world"

    def test_strips_prompt_whitespace(self) -> None:
        """Strip surrounding whitespace from the prompt field."""
        from api_contract.conversations import ChatRequest

        req = ChatRequest(prompt="  hello  ")
        assert req.prompt == "hello"

    def test_rejects_empty_prompt(self) -> None:
        """Reject a whitespace-only prompt."""
        from pydantic import ValidationError

        from api_contract.conversations import ChatRequest

        with pytest.raises(ValidationError):
            ChatRequest(prompt="   ")

    def test_sanitizes_provider(self) -> None:
        """Lower-case and trim the provider field."""
        from api_contract.conversations import ChatRequest

        req = ChatRequest(prompt="hi", provider="  Bedrock  ")
        assert req.provider == "bedrock"

    def test_sanitizes_model(self) -> None:
        """Trim whitespace from the model field."""
        from api_contract.conversations import ChatRequest

        req = ChatRequest(prompt="hi", model="  claude-3.5-sonnet  ")
        assert req.model == "claude-3.5-sonnet"


class TestRunQueryRequest:
    """Tests for the SQL-query schema."""

    def test_accepts_valid_query(self) -> None:
        """Accept a valid SQL query string."""
        from api_contract.database import RunQueryRequest

        req = RunQueryRequest(sql_query="SELECT * FROM users")
        assert req.sql_query == "SELECT * FROM users"

    def test_rejects_empty_query(self) -> None:
        """Reject a whitespace-only SQL query."""
        from pydantic import ValidationError

        from api_contract.database import RunQueryRequest

        with pytest.raises(ValidationError):
            RunQueryRequest(sql_query="   ")

    def test_clamps_max_rows(self) -> None:
        """Reject a max_rows value below the minimum allowed."""
        from pydantic import ValidationError

        from api_contract.database import RunQueryRequest

        # max_rows must be >= 1 and <= REQUEST_MAX_ROWS_LIMIT.
        with pytest.raises(ValidationError):
            RunQueryRequest(sql_query="SELECT 1", max_rows=0)

    def test_clamps_timeout(self) -> None:
        """Reject a timeout value below the minimum allowed."""
        from pydantic import ValidationError

        from api_contract.database import RunQueryRequest

        # timeout must be within [QUERY_TIMEOUT_MIN_SECONDS, QUERY_TIMEOUT_MAX_SECONDS].
        with pytest.raises(ValidationError):
            RunQueryRequest(sql_query="SELECT 1", timeout=0)
