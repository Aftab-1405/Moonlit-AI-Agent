"""Focused contract tests for the persisted user task-mode preference."""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI

FRONTEND_DEFAULT_PAYLOAD = {
    "theme": "light",
    "confirmBeforeRun": False,
    "queryTimeout": 30,
    "maxRows": 1000,
    "nullDisplay": "NULL",
    "rememberConnection": False,
    "defaultDbType": "postgresql",
    "connectionPersistence": 0,
    "enableReasoning": True,
    "reasoningEffort": "medium",
    "responseStyle": "balanced",
    "taskMode": "auto",
    "llmProvider": None,
    "llmModel": None,
}


class TestSaveUserSettingsRequest:
    """Tests for the complete frontend user-settings payload contract."""

    def test_accepts_complete_frontend_default_payload(self) -> None:
        from api_contract.context import SaveUserSettingsRequest

        request = SaveUserSettingsRequest(**FRONTEND_DEFAULT_PAYLOAD)

        assert request.model_dump(exclude_unset=True) == FRONTEND_DEFAULT_PAYLOAD

    @pytest.mark.asyncio
    async def test_complete_frontend_payload_reaches_settings_handler(
        self, monkeypatch
    ) -> None:
        from controller import context_controller as controller

        captured = {}

        def save(user_id, patch):
            captured["user_id"] = user_id
            captured["patch"] = patch
            return patch

        async def current_user():
            return {"uid": "settings-user"}

        async def no_session(_request):
            return {}

        async def no_sync(_request, _preferences):
            return None

        monkeypatch.setattr(controller.UserSettingsService, "save", staticmethod(save))
        monkeypatch.setattr(controller, "get_session_data", no_session)
        monkeypatch.setattr(controller, "_sync_persistence_to_session", no_sync)

        app = FastAPI()
        app.include_router(controller.router)
        app.dependency_overrides[controller.get_current_user] = current_user
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)

        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            response = await client.post(
                "/user/settings",
                json=FRONTEND_DEFAULT_PAYLOAD,
            )

        assert response.status_code == 200
        assert response.json() == {
            "status": "success",
            "settings": FRONTEND_DEFAULT_PAYLOAD,
        }
        assert captured == {
            "user_id": "settings-user",
            "patch": FRONTEND_DEFAULT_PAYLOAD,
        }

    @pytest.mark.parametrize("task_mode", ["auto", "normal", "tool_task", "long_task"])
    def test_accepts_supported_task_modes(self, task_mode: str) -> None:
        from api_contract.context import SaveUserSettingsRequest

        request = SaveUserSettingsRequest(taskMode=task_mode)

        assert request.taskMode == task_mode

    @pytest.mark.parametrize("task_mode", ["approved_autonomous", "AUTO", ""])
    def test_rejects_unsupported_task_modes(self, task_mode: str) -> None:
        from pydantic import ValidationError

        from api_contract.context import SaveUserSettingsRequest

        with pytest.raises(ValidationError):
            SaveUserSettingsRequest(taskMode=task_mode)

    def test_keeps_extra_fields_forbidden(self) -> None:
        from pydantic import ValidationError

        from api_contract.context import SaveUserSettingsRequest

        with pytest.raises(ValidationError) as exc_info:
            SaveUserSettingsRequest(taskMode="auto", undeclared_client_field=True)

        assert any(
            error["type"] == "extra_forbidden" for error in exc_info.value.errors()
        )


class TestUserSettingsTaskMode:
    """Tests for task-mode defaults and persistence sanitization."""

    def test_defaults_to_auto_without_a_stored_value(self, monkeypatch) -> None:
        from service.context.context_repository import ContextRepository
        from service.user_settings.user_settings_service import UserSettingsService

        monkeypatch.setattr(ContextRepository, "get", staticmethod(lambda _user_id: {}))

        settings = UserSettingsService.get_merged("user-without-preferences")

        assert settings["taskMode"] == "auto"

    def test_normalizes_and_persists_supported_value(self, monkeypatch) -> None:
        from service.context.context_repository import ContextRepository
        from service.user_settings.user_settings_service import UserSettingsService

        updates: list[tuple[str, dict]] = []
        monkeypatch.setattr(ContextRepository, "get", staticmethod(lambda _user_id: {}))
        monkeypatch.setattr(
            ContextRepository,
            "update",
            staticmethod(lambda user_id, patch: updates.append((user_id, patch))),
        )

        settings = UserSettingsService.save(
            "user-without-preferences",
            {"taskMode": " LONG_TASK "},
        )

        assert settings["taskMode"] == "long_task"
        assert updates[0][1]["preferences"]["taskMode"] == "long_task"

    def test_ignores_unsupported_patch_value(self, monkeypatch) -> None:
        from service.context.context_repository import ContextRepository
        from service.user_settings.user_settings_service import UserSettingsService

        updates: list[tuple[str, dict]] = []
        monkeypatch.setattr(
            ContextRepository,
            "get",
            staticmethod(
                lambda _user_id: {"preferences": {"taskMode": "tool_task"}}
            ),
        )
        monkeypatch.setattr(
            ContextRepository,
            "update",
            staticmethod(lambda user_id, patch: updates.append((user_id, patch))),
        )

        settings = UserSettingsService.save(
            "user-with-preferences",
            {"taskMode": "approved_autonomous"},
        )

        assert settings["taskMode"] == "tool_task"
        assert updates == []

    def test_invalid_stored_value_falls_back_to_auto(self, monkeypatch) -> None:
        from service.context.context_repository import ContextRepository
        from service.user_settings.user_settings_service import UserSettingsService

        monkeypatch.setattr(
            ContextRepository,
            "get",
            staticmethod(
                lambda _user_id: {
                    "preferences": {"taskMode": "approved_autonomous"}
                }
            ),
        )

        settings = UserSettingsService.get_merged("user-with-invalid-preferences")

        assert settings["taskMode"] == "auto"
