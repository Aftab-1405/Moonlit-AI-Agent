"""Context and user-settings request schemas."""

from typing import Literal, Optional

from pydantic import Field, field_validator

from api_contract.common import ExternalRequestModel
from config import get_config

Config = get_config()


class SaveUserSettingsRequest(ExternalRequestModel):
    """Schema for partial user-settings updates."""

    theme: Optional[Literal["light", "dark"]] = None
    confirmBeforeRun: Optional[bool] = None
    queryTimeout: Optional[int] = Field(
        None,
        ge=Config.USER_SETTINGS_QUERY_TIMEOUT_MIN_SECONDS,
        le=Config.QUERY_TIMEOUT_MAX_SECONDS,
    )
    maxRows: Optional[int] = Field(None, ge=0, le=Config.REQUEST_MAX_ROWS_LIMIT)
    nullDisplay: Optional[str] = Field(None, max_length=Config.USER_SETTINGS_NULL_DISPLAY_MAX_LENGTH)
    rememberConnection: Optional[bool] = None
    defaultDbType: Optional[Literal["mysql", "postgresql", "sqlserver", "oracle"]] = None
    connectionPersistence: Optional[Literal[0, 5, 15, 30, 60]] = None
    connectionPersistenceMinutes: Optional[Literal[0, 5, 15, 30, 60]] = None
    enableReasoning: Optional[bool] = None
    reasoningEffort: Optional[Literal["low", "medium", "high"]] = None
    responseStyle: Optional[Literal["concise", "balanced", "detailed"]] = None
    llmProvider: Optional[str] = Field(None, max_length=Config.LLM_PROVIDER_MAX_LENGTH)
    llmModel: Optional[str] = Field(None, max_length=Config.LLM_MODEL_MAX_LENGTH)

    @field_validator("llmProvider")
    @classmethod
    def sanitize_llm_provider(cls, v):
        """Normalize the LLM provider to a trimmed lowercase value."""
        if v is None:
            return None
        provider = v.strip().lower()
        return provider or None

    @field_validator("llmModel")
    @classmethod
    def sanitize_llm_model(cls, v):
        """Normalize the LLM model to a trimmed value."""
        if v is None:
            return None
        model = v.strip()
        return model or None


class CloseSessionRequest(ExternalRequestModel):
    """Schema for closing a browser session."""

    connectionPersistenceMinutes: Optional[Literal[0, 5, 15, 30, 60]] = None
    sessionInstanceId: Optional[str] = Field(default=None, max_length=Config.SESSION_INSTANCE_ID_MAX_LENGTH)


class SessionActiveRequest(ExternalRequestModel):
    """Schema for browser-session heartbeat."""

    sessionInstanceId: Optional[str] = Field(default=None, max_length=Config.SESSION_INSTANCE_ID_MAX_LENGTH)
