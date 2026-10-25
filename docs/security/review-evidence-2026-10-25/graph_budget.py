"""Real LangGraph invocation through production continuation and tool guards."""
import graph_common
import asyncio
import json
from typing import TypedDict
from unittest.mock import AsyncMock, patch

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.errors import GraphRecursionError
from langgraph.graph import START, StateGraph
import importlib
from service.conversations.run_context import resolve_run_policy

stream = importlib.import_module("langgraph_orchestration.stream_conversation")
tools = importlib.import_module("langgraph_orchestration.tools")


class State(TypedDict):
    n: int


async def main():
    graphs = []
    cases = [("synthetic", 6, 2)]
    for mode in ("normal", "tool_task", "long_task"):
        policy = resolve_run_policy("inspect tables", mode, None, "bedrock", "synthetic-model", True)
        cases.append((mode, policy.budgets.graph_steps, policy.budgets.segment_steps))
    for mode, total, segment in cases:
        executed = []
        async def node(state):
            executed.append(state["n"] + 1)
            return {"n": state["n"] + 1}
        builder = StateGraph(State)
        builder.add_node("agent", node)
        builder.add_edge(START, "agent")
        builder.add_edge("agent", "agent")
        agent = builder.compile(checkpointer=InMemorySaver())
        cfg = {"configurable": {"thread_id": "synthetic-budget", "task_mode": mode}}
        with patch.object(stream, "check_and_perform_compaction", new=AsyncMock()):
            try:
                async for _ in stream._stream_graph_with_continuations(
                    agent, {"n": 0}, cfg, total_step_budget=total, segment_step_limit=segment,
                    conversation_id="synthetic-budget", chat_model=None, active_context_budget=100,
                ): pass
            except GraphRecursionError:
                pass
        graphs.append({"mode": mode, "declared_step_budget": total, "segment_step_limit": segment,
                       "actual_node_executions": len(executed)})
    assert graphs[0]["actual_node_executions"] == 20
    limits = {}
    with patch.object(tools, "_try_writer", return_value=lambda event: None):
        for budget in (2, 20, 50):
            cfg = {"configurable": {"tool_call_log": {}, "tool_call_budget": budget}}
            accepted = 0
            for i in range(60):
                rejected = tools._check_tool_budget_and_loop("execute_query", {"query": f"SELECT {i}"}, cfg)
                if rejected: break
                accepted += 1
            limits[str(budget)] = accepted
    assert limits == {"2": 21, "20": 21, "50": 21}
    print(json.dumps({"F29": graphs, "F30": limits}, sort_keys=True))


asyncio.run(main())
