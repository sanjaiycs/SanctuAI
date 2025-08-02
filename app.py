from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sanctuai_backend import SanctuAI  # Your Python backend code

app = FastAPI()

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class RedactionRequest(BaseModel):
    text: str
    consent_given: bool = False

@app.post("/redact")
def redact_text(request: RedactionRequest):
    redactor = SanctuAI()
    redacted_text, entries = redactor.redact_text(request.text, request.consent_given)
    return {
        "redacted_text": redacted_text,
        "audit_log": redactor.generate_audit_log()
    }