# GradeFlow AI: `.env` variables

Create a `.env` file in the project root (git-ignored). On Railway, set the same names in the service's **Variables** tab. Never commit real values.

```
# ---- AI: one provider is enough ----
# gemini (https://aistudio.google.com/apikey), groq (https://console.groq.com/keys),
# openrouter (https://openrouter.ai/keys), ollama (https://ollama.com, no key)
AI_PROVIDER=gemini
AI_API_KEY=
# More requests at once: keys for other providers, or several comma-separated keys.
# Any provider with a key is a backup when the main one hits its quota or is busy.
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
# Optional priority order (default: AI_PROVIDER first, then the rest that have a key)
AI_PROVIDERS=
# 1 = spread requests across all keys in turn
AI_ROTATE=0
# Optional: model / base URL of the main provider
AI_MODEL=
AI_BASE_URL=

# ---- Limits (all OFF by default; 0 = no limit) ----
# Require this code to use the AI import (set it when others can reach the server)
APP_ACCESS_CODE=
# AI requests per visitor per window (seconds)
AI_RATE_LIMIT=0
AI_RATE_WINDOW=600
# Hard cap on AI calls per day for the whole server
AI_DAILY_CAP=0
# SF10: max sheets per upload, and max characters per sheet (60000 is about 20k tokens)
AI_MAX_SHEETS=0
AI_MAX_SHEET_CHARS=0
# 1 only behind a trusted reverse proxy (to read the real visitor IP)
TRUST_PROXY=0
```
