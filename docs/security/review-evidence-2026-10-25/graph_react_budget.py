"""Check the actual app ReAct builder, including its installed RemainingSteps guard."""
import graph_common
import asyncio
import importlib
import json
from unittest.mock import AsyncMock, patch

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command, interrupt
from langgraph_orchestration.react_graph import build_react_agent
from service.conversations.run_context import resolve_run_policy

stream = importlib.import_module("langgraph_orchestration.stream_conversation")


class Model(BaseChatModel):
    calls: int = 0
    @property
    def _llm_type(self): return "synthetic-local"
    def bind_tools(self, tools, **kwargs): return self
    def _generate(self, *args, **kwargs): raise AssertionError("async only")
    async def _agenerate(self, messages, **kwargs):
        self.calls += 1
        message = AIMessage(content="", tool_calls=[{"name": "probe_tool", "args": {"n": self.calls},
                                                     "id": f"call-{self.calls}"}])
        return ChatResult(generations=[ChatGeneration(message=message)])


async def case(interrupt_at, mode):
    policy = resolve_run_policy("Inspect the schema", mode, None, "bedrock", "mock", True)
    budget = policy.budgets.graph_steps
    tool_calls = []
    @tool
    async def probe_tool(n: int) -> str:
        """Synthetic external tool; returns local text and may request approval."""
        tool_calls.append(n)
        if n == interrupt_at:
            interrupt({"action": "synthetic_approval"})
        return "continue"
    model = Model()
    agent = build_react_agent(model, [probe_tool], system_prompt="Local synthetic test",
                              checkpointer=InMemorySaver())
    config = {"configurable": {"thread_id": f"react-{interrupt_at}-{budget}", "model": "mock",
                                "active_context_budget": 1_000_000, "task_mode": policy.task_mode,
                                "graph_step_budget": budget, "segment_step_budget": policy.budgets.segment_steps,
                                "tool_call_budget": policy.budgets.tool_calls,
                                "wall_clock_budget_seconds": policy.budgets.wall_clock_seconds}}
    continuation_statuses = []
    async def collect(value):
        async for _ in stream._stream_graph_with_continuations(
            agent, value, config, total_step_budget=budget, segment_step_limit=policy.budgets.segment_steps,
            conversation_id="synthetic", chat_model=model, active_context_budget=1_000_000,
        ):
            if isinstance(_, dict) and _.get("type") == "custom":
                event = _.get("data")
                if isinstance(event, dict) and event.get("stage") == "checkpointing_task":
                    continuation_statuses.append(event)
    compactor = AsyncMock()
    with patch.object(stream, "check_and_perform_compaction", new=compactor):
        await collect({"messages": [HumanMessage(content="Perform local synthetic tool loop")]})
        initial = await agent.aget_state(config)
        before_resume = model.calls
        if initial.tasks and any(t.interrupts for t in initial.tasks):
            await collect(Command(resume={"approved": True}))
    final = await agent.aget_state(config)
    return {"mode": policy.task_mode, "budget": budget, "segment": policy.budgets.segment_steps,
            "interrupt_at_tool": interrupt_at,
            "initial_checkpoint_step": initial.metadata["step"], "initial_model_calls": before_resume,
            "model_calls_after_resume": model.calls - before_resume,
            "total_model_calls": model.calls, "tool_invocations": len(tool_calls),
            "final_checkpoint_step": final.metadata["step"],
            "final_content": final.values["messages"][-1].content,
            "remaining_graph_tasks": list(final.next),
            "continuation_statuses": len(continuation_statuses),
            "continuation_compaction_calls": compactor.await_count}


async def main():
    no_interrupt = await case(-1, "long_task")
    resumed = await case(20, "normal")
    assert no_interrupt["budget"] == 200 and no_interrupt["final_checkpoint_step"] == 49
    assert no_interrupt["remaining_graph_tasks"] == []
    assert no_interrupt["continuation_statuses"] == no_interrupt["continuation_compaction_calls"] == 0
    assert resumed["budget"] == 50 and resumed["mode"] == "normal"
    assert resumed["final_checkpoint_step"] - resumed["initial_checkpoint_step"] == 90
    assert resumed["model_calls_after_resume"] == 45
    print(json.dumps({"actual_react_no_interrupt": no_interrupt,
                      "actual_react_resumed": resumed}, sort_keys=True))


async def tick():
    # Keep a finite selector deadline while SDK callbacks use worker threads.
    while True: await asyncio.sleep(0.005)


loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
ticker = loop.create_task(tick())
try:
    loop.run_until_complete(asyncio.wait_for(main(), 30))
    loop.run_until_complete(loop.shutdown_asyncgens())
    loop.run_until_complete(loop.shutdown_default_executor(timeout=3))
finally:
    ticker.cancel()
    loop.run_until_complete(asyncio.gather(ticker, return_exceptions=True))
    loop.close()
