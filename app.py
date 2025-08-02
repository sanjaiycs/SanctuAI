import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sanctuai_backend import SanctuAI

app = FastAPI()

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production!
    allow_methods=["*"],
    allow_headers=["*"],
)

class RedactionRequest(BaseModel):
    text: str
    consent_given: bool = False

@app.post("/redact")
async def redact_text(request: RedactionRequest):
    redactor = SanctuAI()
    redacted_text, entries = redactor.redact_text(request.text, request.consent_given)
    return {
        "redacted_text": redacted_text,
        "redaction_entries": [entry.__dict__ for entry in entries],
        "audit_log": redactor.generate_audit_log()
    }

# Add this for Render compatibility
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))  # Render uses $PORT
    uvicorn.run(app, host="0.0.0.0", port=port)
