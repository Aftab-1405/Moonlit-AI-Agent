"""
LangGraph CLI / LangSmith Deployment graph export (optional).

Run from ``back-end/`` with API keys configured::

    langgraph dev

Environment:
  ``LANGGRAPH_DEFAULT_PROVIDER`` — default ``gemini``
  ``LANGGRAPH_DEFAULT_MODEL`` — optional; falls back to provider default

See https://docs.langchain.com/oss/python/langgraph/application-structure
"""

from __future__ import annotations

import os

from langgraph.checkpoint.memory import InMemorySaver

from agent.graph import build_react_agent
from agent.model_factory import get_chat_model, get_default_model
from agent.prompt_builder import PromptBuilder
from agent.tools import ALL_TOOLS

_provider = os.getenv("LANGGRAPH_DEFAULT_PROVIDER", "gemini").strip().lower()
_model = os.getenv("LANGGRAPH_DEFAULT_MODEL") or get_default_model(_provider)

graph = build_react_agent(
    get_chat_model(_provider, _model),
    ALL_TOOLS,
    system_prompt=PromptBuilder.build_system_prompt("balanced"),
    checkpointer=InMemorySaver(),
)
