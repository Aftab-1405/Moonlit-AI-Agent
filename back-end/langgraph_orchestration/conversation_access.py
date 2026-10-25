"""Conversation access port lookup for agent orchestration."""

from api_contract.orchestration_protocols import (
    ConversationStateReader,
    ConversationSummarizer,
)
from api_contract.runtime_ports import (
    get_conversation_state_reader as _get_conversation_state_reader,
)
from api_contract.runtime_ports import (
    get_conversation_summarizer as _get_conversation_summarizer,
)


def get_default_conversation_state_reader() -> ConversationStateReader:
    """Return the configured conversation state reader."""
    return _get_conversation_state_reader()


def get_default_conversation_summarizer() -> ConversationSummarizer:
    """Return the configured conversation summarizer."""
    return _get_conversation_summarizer()


def group_messages_into_turns(messages: list) -> list[list[int]]:
    """Groups message indices into turns, with explicit turn_index/turn_id or fallback."""
    turns = []
    current_turn: list[int] = []

    # We will build turns based on turn_index or turn_id if they exist,
    # otherwise fallback to grouping where 'user' starts a new turn.
    for idx, msg in enumerate(messages):
        key = msg.get("turn_index") or msg.get("turn_id")

        # If we have a key, we group by key
        if key is not None:
            # If there's a current turn and the last message in it had the same key
            if current_turn:
                last_msg = messages[current_turn[-1]]
                last_key = last_msg.get("turn_index") or last_msg.get("turn_id")
                if last_key == key:
                    current_turn.append(idx)
                    continue
            # Otherwise, start a new turn
            if current_turn:
                turns.append(current_turn)
            current_turn = [idx]
        else:
            # Fallback grouping: 'user' starts a turn
            sender = str(msg.get("sender", "user")).lower()
            if sender == "user":
                if current_turn:
                    turns.append(current_turn)
                current_turn = [idx]
            else:
                if not current_turn:
                    current_turn = [idx]
                else:
                    current_turn.append(idx)

    if current_turn:
        turns.append(current_turn)
    return turns
