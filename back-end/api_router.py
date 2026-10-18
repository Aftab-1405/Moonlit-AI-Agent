"""Combined API router - aggregates all domain-specific routers."""

from fastapi import APIRouter

from controller.context_controller import router as context_router
from controller.conversations_controller import router as conversation_router
from controller.database_controller import router as database_router
from controller.database_schema_controller import router as schema_router
from controller.quota_controller import router as quota_router
from controller.user_dashboard_controller import (
    account_router,
)
from controller.user_dashboard_controller import (
    router as user_dashboard_router,
)

combined_router = APIRouter()


@combined_router.get("/", tags=["General"])
async def landing():
    """Health check — confirms the API is running."""
    return {"status": "success", "message": "API is running"}


combined_router.include_router(conversation_router)
combined_router.include_router(database_router)
combined_router.include_router(schema_router)
combined_router.include_router(context_router)
combined_router.include_router(quota_router)
combined_router.include_router(user_dashboard_router)
combined_router.include_router(account_router)
