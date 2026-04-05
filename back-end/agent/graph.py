"""
Compile the Moonlit ReAct agent graph (tool-calling loop).

Uses ``langgraph.prebuilt.create_react_agent`` with the v2 graph schema by default.
"""

from __future__ import annotations

from typing import Sequence

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.tools import BaseTool
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent


def build_react_agent(
    chat_model: BaseChatModel,
    tools: Sequence[BaseTool],
    *,
    system_prompt: str,
    checkpointer: BaseCheckpointSaver | None,
) -> CompiledStateGraph:
    """
    Build the compiled ReAct agent used for database assistant turns.

    ``version='v2'`` selects the current prebuilt graph schema (LangGraph >= 1.1).
    """
    return create_react_agent(
        chat_model,
        list(tools),
        checkpointer=checkpointer,
        prompt=system_prompt,
        version="v2",
    )
