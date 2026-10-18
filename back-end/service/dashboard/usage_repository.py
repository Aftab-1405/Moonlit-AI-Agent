"""Firestore persistence for privacy-safe user usage aggregates."""

from __future__ import annotations

import hashlib
from datetime import datetime, time, timedelta, timezone

from service.dashboard.usage_analytics import merge_usage_event


class UsageRepository:
    COLLECTION_NAME = "user_usage"

    @staticmethod
    def _user_ref(user_id, db):
        return db.collection(UsageRepository.COLLECTION_NAME).document(str(user_id))

    @staticmethod
    def record_event(user_id, event_id, event, *, occurred_at=None, db=None):
        from firebase_admin import firestore

        if db is None:
            from service.firestore.firestore_service import FirestoreService

            db = FirestoreService.get_db()
        occurred_at = occurred_at or datetime.now(timezone.utc)
        if occurred_at.tzinfo is None:
            occurred_at = occurred_at.replace(tzinfo=timezone.utc)
        occurred_at = occurred_at.astimezone(timezone.utc)
        day = occurred_at.date().isoformat()
        expires_at = datetime.combine(
            occurred_at.date() + timedelta(days=91),
            time.min,
            tzinfo=timezone.utc,
        )
        marker_id = hashlib.sha256(str(event_id).encode()).hexdigest()
        user_ref = UsageRepository._user_ref(user_id, db)
        daily_ref = user_ref.collection("daily").document(day)
        marker_ref = user_ref.collection("events").document(marker_id)

        @firestore.transactional
        def _record(transaction):
            marker_snapshot = marker_ref.get(transaction=transaction)
            if marker_snapshot.exists:
                return False
            daily_snapshot = daily_ref.get(transaction=transaction)
            user_snapshot = user_ref.get(transaction=transaction)
            aggregate = merge_usage_event(
                daily_snapshot.to_dict() if daily_snapshot.exists else {},
                event,
            )
            aggregate.update(
                {
                    "date": day,
                    "updated_at": occurred_at,
                    "expires_at": expires_at,
                }
            )
            metadata = user_snapshot.to_dict() if user_snapshot.exists else {}
            transaction.set(
                user_ref,
                {
                    "tracking_started_at": metadata.get("tracking_started_at") or occurred_at,
                    "updated_at": occurred_at,
                },
                merge=True,
            )
            transaction.set(daily_ref, aggregate)
            transaction.set(
                marker_ref,
                {
                    "kind": "sql" if event.get("kind") == "sql" else "ai",
                    "recorded_at": occurred_at,
                    "expires_at": expires_at,
                },
            )
            return True

        return _record(db.transaction())

    @staticmethod
    def get_metadata(user_id, *, db=None):
        if db is None:
            from service.firestore.firestore_service import FirestoreService

            db = FirestoreService.get_db()
        snapshot = UsageRepository._user_ref(user_id, db).get()
        return snapshot.to_dict() if snapshot.exists else {}

    @staticmethod
    def list_daily(user_id, start_date, end_date, *, db=None):
        from google.cloud.firestore_v1 import FieldFilter

        if db is None:
            from service.firestore.firestore_service import FirestoreService

            db = FirestoreService.get_db()
        query = UsageRepository._user_ref(user_id, db).collection("daily")
        snapshots = (
            query.where(filter=FieldFilter("date", ">=", start_date.isoformat()))
            .where(filter=FieldFilter("date", "<=", end_date.isoformat()))
            .get()
        )
        return [snapshot.to_dict() or {} for snapshot in snapshots]

    @staticmethod
    def delete_user(user_id, *, db=None) -> None:
        if db is None:
            from service.firestore.firestore_service import FirestoreService

            db = FirestoreService.get_db()
        user_ref = UsageRepository._user_ref(user_id, db)
        for collection_name in ("daily", "events"):
            for snapshot in user_ref.collection(collection_name).stream():
                snapshot.reference.delete()
        user_ref.delete()
