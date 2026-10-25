"""Check real streaming service cleanup through the real HTTP heartbeat wrapper."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import patch
import api_reproduce as fixture
from service.conversations.conversation_repository import ConversationRepository
from service.conversations.conversation_streaming_service import ConversationStreamingService
from service.conversations import agent_streaming
from service.firestore.firestore_service import FirestoreService
from service.dashboard.usage_analytics import UsageAnalyticsService

async def run():
    async def ticker():
        while True: await asyncio.sleep(.005)
    tick=asyncio.create_task(ticker())
    stores=[]; delivered=asyncio.Event(); normal=False
    async def stream(*args,**kwargs):
        yield 'data: {"type":"token","content":"Partial assistant output"}\n\n'
        if not normal: await asyncio.Event().wait()
    class Limiter:
        async def acquire(self,*args): return True,"offline"
        async def release(self,*args): await asyncio.sleep(0)
    app=SimpleNamespace(state=SimpleNamespace(user_quota=fixture.Quota(),llm_rate_limiter=Limiter()))
    db=SimpleNamespace(collection=lambda name:SimpleNamespace(document=lambda cid:SimpleNamespace(update=lambda payload:None)))
    policy=SimpleNamespace(task_mode="normal",provider="bedrock",model="offline")
    with patch.object(fixture.conv.LLMOptionsService,"resolve_selection",return_value=("bedrock","offline")), \
         patch.object(fixture.conv,"resolve_run_policy",return_value=policy), \
         patch.object(ConversationRepository,"get",return_value=None), \
         patch.object(ConversationRepository,"store_message",side_effect=lambda *args,**kw:stores.append((args[1],kw))), \
         patch.object(FirestoreService,"get_db",return_value=db), \
         patch.object(agent_streaming,"get_default_agent_streamer",return_value=SimpleNamespace(stream=stream)), \
         patch.object(UsageAnalyticsService,"record_ai_request",return_value=True):
        response=await fixture.conv._handle_agent_stream(fixture.request(app),"review-user","offline-id","bedrock","offline",{"prompt":"hello"},require_existing_conversation=False)
        async def send(message):
            if message["type"]=="http.response.body" and message.get("body"): delivered.set()
        async def receive():
            await delivered.wait()
            return {"type":"http.disconnect"}
        await asyncio.wait_for(response({"type":"http","asgi":{"spec_version":"2.3"},"method":"POST","headers":[]},receive,send),2)
        assert delivered.is_set() and [item[0] for item in stores]==["user"]
        interrupted={"partial_token_delivered":delivered.is_set(),"stored_roles":[item[0] for item in stores],"assistant_saved":False}
        stores.clear(); delivered.clear(); normal=True
        response=await fixture.conv._handle_agent_stream(fixture.request(app),"review-user","offline-id","bedrock","offline",{"prompt":"hello"},require_existing_conversation=False)
        async def normal_receive(): await asyncio.Event().wait()
        await asyncio.wait_for(response({"type":"http","asgi":{"spec_version":"2.3"},"method":"POST","headers":[]},normal_receive,send),2)
        assert delivered.is_set() and [item[0] for item in stores]==["user","ai"]
        control={"stored_roles":[item[0] for item in stores],"assistant_saved":True}
    print(json.dumps({"disconnected":interrupted,"normal_completion":control}),flush=True)
    await asyncio.get_running_loop().shutdown_default_executor()
    tick.cancel()

if __name__=="__main__": asyncio.run(run())
