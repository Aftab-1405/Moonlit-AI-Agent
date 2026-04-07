"""
Context Repository

Encapsulates Firestore data access for user context documents.
Collection: user_context/{user_id}
"""

import logging
from datetime import datetime
from typing import Dict

logger = logging.getLogger(__name__)


class ContextRepository:
    """Data access layer for user context in Firestore."""

    COLLECTION_NAME = "user_context"

    @staticmethod
    def _normalize_user_id(user_id) -> str:
        """Normalize user_id to string for Firestore document ID.

        Uses uid as primary identifier to match route behavior.
        This ensures consistent document IDs across context and conversations.
        """
        if isinstance(user_id, dict):
            # Prefer uid (stable) over email (can change)
            return user_id.get("uid") or user_id.get("email") or str(user_id)
        return str(user_id) if user_id else "anonymous"

    @staticmethod
    def get_ref(user_id):
        """
        Get Firestore document reference for user context.

        Args:
            user_id: User identifier (string or dict with email/uid)

        Returns:
            DocumentReference for the user's context document
        """
        from services.firestore_service import FirestoreService

        user_id = ContextRepository._normalize_user_id(user_id)
        db = FirestoreService.get_db()
        return db.collection(ContextRepository.COLLECTION_NAME).document(user_id)

    @staticmethod
    def get(user_id: str) -> Dict:
        """
        Get full context document.

        Args:
            user_id: User identifier

        Returns:
            Context document as dict, or empty dict if not exists
        """
        try:
            doc = ContextRepository.get_ref(user_id).get()
            return doc.to_dict() if doc.exists else {}
        except Exception as e:
            logger.error(f"Error getting context for user {user_id}: {e}")
            return {}

    @staticmethod
    def update(user_id: str, data: Dict) -> bool:
        """
        Update context document with merge.

        Args:
            user_id: User identifier
            data: Fields to merge into the document

        Returns:
            True if successful, False otherwise
        """
        try:
            data["updated_at"] = datetime.now()
            ContextRepository.get_ref(user_id).set(data, merge=True)
            return True
        except Exception as e:
            logger.error(f"Error updating context for user {user_id}: {e}")
            return False

    @staticmethod
    def delete(user_id: str) -> bool:
        """
        Delete context document.

        Args:
            user_id: User identifier

        Returns:
            True if successful, False otherwise
        """
        try:
            ContextRepository.get_ref(user_id).delete()
            logger.info(f"Deleted context for user {user_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting context for user {user_id}: {e}")
            return False

    @staticmethod
    def delete_field(user_id: str, field_path: str) -> bool:
        """
        Delete a specific field from the context document.

        Args:
            user_id: User identifier
            field_path: Dot-notation path to the field (e.g., 'database_schemas.mydb')

        Returns:
            True if successful, False otherwise
        """
        from firebase_admin import firestore

        try:
            ref = ContextRepository.get_ref(user_id)
            ref.update(
                {field_path: firestore.DELETE_FIELD, "updated_at": datetime.now()}
            )
            return True
        except Exception as e:
            logger.error(f"Error deleting field {field_path} for user {user_id}: {e}")
            return False
