"""
NutriX — FastAPI server with SSE streaming for food optimization.

Run:
    uv run uvicorn server:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import asyncio
import base64
from datetime import datetime, timezone
import json
import os
import sys
import uuid
import bcrypt

import motor.motor_asyncio
from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError

# Ensure the project root, which contains the sibling graph package, is importable.
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

load_dotenv()

app = FastAPI(title="NutriX API")


@app.exception_handler(PyMongoError)
async def handle_database_error(request: Request, exc: PyMongoError):
    return JSONResponse(
        status_code=503,
        content={"detail": "Database unavailable. Check MONGO_URI and MongoDB network access."},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ──────────────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    name: str = ""
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class FoodItemInput(BaseModel):
    name: str
    price: float


class OptimizeRequest(BaseModel):
    menu: list[FoodItemInput]
    budget: float
    protein_target: float
    language: str = "English"


class ChatRequest(BaseModel):
    messages: list[dict]
    context: dict | None = None


class ConversationRequest(BaseModel):
    email: str
    title: str = "New conversation"
    messages: list[dict] = Field(default_factory=list)


# ── LLM for image recognition ──────────────────────────────────────────────
vision_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.3,
)


# ── SSE helper ──────────────────────────────────────────────────────────────
def sse_event(event: str, data: dict | str) -> str:
    """Format a Server-Sent Event."""
    payload = json.dumps(data) if isinstance(data, dict) else json.dumps({"message": data})
    return f"event: {event}\ndata: {payload}\n\n"


# ── Optimize endpoint (SSE stream) ─────────────────────────────────────────
@app.post("/api/optimize")
async def optimize(request: OptimizeRequest):
    """Stream the optimization pipeline as SSE events."""

    async def event_stream():
        from graph.graph import build_graph

        graph = build_graph()
        config = {"configurable": {"thread_id": str(uuid.uuid4())}}

        user_input = {
            "menu": [{"name": item.name, "price": item.price} for item in request.menu],
            "budget": request.budget,
            "protein_target": request.protein_target,
            "protein_estimates": {},
            "valid_combinations": [],
            "best_combination": None,
            "recommendation": "",
        }

        language = request.language

        async def graph_events():
            try:
                async for graph_event in graph.astream(user_input, config=config):
                    yield graph_event
            except Exception:
                yield {"__error__": True}

        # Stream status messages without adding artificial latency.
        yield sse_event("status", {"step": "typing", "message": "🔍 Typing..."})

        yield sse_event("status", {"step": "validating", "message": "✅ Validating your input..."})

        async for event in graph_events():
            if event.get("__error__"):
                yield sse_event(
                    "error",
                    "The AI service is unavailable. Replace GOOGLE_API_KEY in backend/.env with a new valid Google AI key.",
                )
                return

            for node_name, node_output in event.items():
                if node_name == "parse_input":
                    yield sse_event("status", {"step": "analyzing", "message": "🧬 Analyzing protein content..."})

                elif node_name == "estimate_protein":
                    estimates = node_output.get("protein_estimates", {})
                    yield sse_event("protein_estimates", {
                        "estimates": {k: v for k, v in estimates.items()},
                    })
                    yield sse_event("status", {"step": "optimizing", "message": "📊 Finding best combinations..."})

                elif node_name == "optimize":
                    combos = node_output.get("valid_combinations", [])
                    best = node_output.get("best_combination")
                    yield sse_event("combinations", {
                        "combinations": combos,
                        "best": best,
                    })
                    yield sse_event("status", {"step": "preparing", "message": "🤖 Preparing AI recommendation..."})

                elif node_name == "recommend":
                    recommendation = node_output.get("recommendation", "")

                    # If language is not English, translate the recommendation
                    if language.lower() != "english":
                        yield sse_event("status", {"step": "translating", "message": f"🌐 Translating to {language}..."})
                        translate_llm = ChatGoogleGenerativeAI(
                            model="gemini-2.5-flash", temperature=0.3
                        )
                        translated = translate_llm.invoke(
                            f"Translate the following nutrition recommendation to {language}. "
                            f"Keep all numbers, food names, and ₹ symbols intact. "
                            f"Make it sound natural in {language}:\n\n{recommendation}"
                        )
                        recommendation = translated.content

                    yield sse_event("recommendation", {"text": recommendation})

        yield sse_event("done", {"message": "✨ Analysis complete!"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Chat endpoint ──────────────────────────────────────────────────────────
@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """Handle conversational follow-ups via LLM."""
    sys_prompt = "You are NutriX, a helpful nutrition AI assistant."
    if request.context:
        sys_prompt += f"\n\nCurrent Session Context: Budget: ₹{request.context.get('budget', '?')}, Protein Target: {request.context.get('protein_target', '?')}g. Menu provided: {request.context.get('menu', '?')}."
        
    langchain_msgs = [SystemMessage(content=sys_prompt)]
    
    for msg in request.messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user":
            langchain_msgs.append(HumanMessage(content=content))
        elif role == "assistant":
            langchain_msgs.append(AIMessage(content=content))
            
    response = vision_llm.invoke(langchain_msgs)
    return {"reply": response.content}


# ── Image recognition endpoint ─────────────────────────────────────────────
@app.post("/api/recognize-food")
async def recognize_food(file: UploadFile = File(...)):
    """Use Gemini Vision to identify food items from an uploaded image."""
    contents = await file.read()
    b64_image = base64.b64encode(contents).decode("utf-8")

    # Determine MIME type
    content_type = file.content_type or "image/jpeg"

    message = HumanMessage(
        content=[
            {
                "type": "text",
                "text": (
                    "Look at this food image and identify ALL the food items visible. "
                    "For each item, estimate a reasonable price in Indian Rupees (₹). "
                    "Return ONLY a JSON array of objects with 'name' and 'price' keys. "
                    "Example: [{\"name\": \"Chicken Rice\", \"price\": 120}, {\"name\": \"Dal Tadka\", \"price\": 80}] "
                    "Return ONLY the JSON array, no markdown, no explanation."
                ),
            },
            {
                "type": "image_url",
                "image_url": {"url": f"data:{content_type};base64,{b64_image}"},
            },
        ]
    )

    response = vision_llm.invoke([message])
    text = response.content.strip()

    # Clean markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

    try:
        items = json.loads(text)
        return {"items": items}
    except json.JSONDecodeError:
        return {"items": [], "raw": text, "error": "Could not parse AI response"}


# ── Auth endpoints ─────────────────────────────────────────────────────────

client = motor.motor_asyncio.AsyncIOMotorClient(
    os.environ["MONGO_URI"], serverSelectionTimeoutMS=5000
)
db = client.nutriX
users_collection = db.users
conversations_collection = db.conversations

@app.post("/api/auth/signup")
async def register(req: SignupRequest):
    existing = await users_collection.find_one({"email": req.email})
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    hashed_pwd = bcrypt.hashpw(req.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    new_user = {
        "name": req.name,
        "email": req.email,
        "password": hashed_pwd
    }
    await users_collection.insert_one(new_user)
    
    return {
        "token": str(uuid.uuid4()),
        "user": {"email": req.email, "name": req.name}
    }

@app.post("/api/auth/login")
async def login_route(req: LoginRequest):
    user = await users_collection.find_one({"email": req.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not bcrypt.checkpw(req.password.encode('utf-8'), user["password"].encode('utf-8')):
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    return {
        "token": str(uuid.uuid4()),
        "user": {"email": user["email"], "name": user.get("name", "")}
    }


@app.get("/api/conversations")
async def list_conversations(email: str = Query(..., min_length=3)):
    """Return the signed-in user's saved conversations, newest first."""
    conversations = conversations_collection.find(
        {"email": email.strip().lower()},
        {"messages": 0},
    ).sort("updatedAt", -1)
    return {
        "conversations": [
            {
                "id": str(conversation["_id"]),
                "title": conversation.get("title", "New conversation"),
                "createdAt": conversation.get("createdAt"),
                "updatedAt": conversation.get("updatedAt"),
            }
            async for conversation in conversations
        ]
    }


@app.post("/api/conversations")
async def create_conversation(req: ConversationRequest):
    """Create a conversation owned by the supplied email address."""
    now = datetime.now(timezone.utc)
    result = await conversations_collection.insert_one({
        "email": req.email.strip().lower(),
        "title": req.title.strip() or "New conversation",
        "messages": req.messages,
        "createdAt": now,
        "updatedAt": now,
    })
    return {"id": str(result.inserted_id), "createdAt": now, "updatedAt": now}


@app.put("/api/conversations/{conversation_id}")
async def update_conversation(conversation_id: str, req: ConversationRequest):
    """Update messages only when the conversation belongs to the supplied email."""
    from bson import ObjectId

    if not ObjectId.is_valid(conversation_id):
        raise HTTPException(status_code=400, detail="Invalid conversation id")

    now = datetime.now(timezone.utc)
    result = await conversations_collection.update_one(
        {
            "_id": ObjectId(conversation_id),
            "email": req.email.strip().lower(),
        },
        {
            "$set": {
                "title": req.title.strip() or "New conversation",
                "messages": req.messages,
                "updatedAt": now,
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"ok": True, "updatedAt": now}

# ── Serve static files (frontend) ──────────────────────────────────────────
static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
os.makedirs(static_dir, exist_ok=True)
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

