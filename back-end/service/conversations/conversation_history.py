"""Bounded transcript responses over the existing append-only message array.

Cursors identify an exclusive, absolute boundary, so appends cannot move a
history page. No storage migration or timestamp uniqueness is required.
"""

import base64
import binascii
import json


def page_messages(conversation_id: str, messages: list, *, limit: int, before: str | None = None):
    if not 1 <= limit <= 100:
        raise ValueError("Invalid history page size")
    end = len(messages)
    if before is not None:
        try:
            if not before or len(before) > 200:
                raise ValueError
            version, owner, boundary = json.loads(base64.b64decode(before, altchars=b"-_", validate=True))
            if version != 1 or owner != conversation_id or type(boundary) is not int or not 0 <= boundary <= end:
                raise ValueError
            end = boundary
        except (ValueError, TypeError, binascii.Error, UnicodeError) as exc:
            raise ValueError("Invalid history cursor") from exc
    start = max(0, end - limit)
    page = [
        {**message, "id": f"{conversation_id}:message:{index}"}
        for index, message in enumerate(messages[start:end], start)
        if isinstance(message, dict)
    ]
    cursor = base64.urlsafe_b64encode(json.dumps([1, conversation_id, start]).encode()).decode() if start else None
    return page, {"has_more": start > 0, "before": cursor}
