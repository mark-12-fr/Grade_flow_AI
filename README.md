# GradeFlow AI

Report cards (SF9) and permanent records (SF10) for Senior High School (Grades 11–12).
The teacher uploads the spreadsheet they already have. AI reads it, and the teacher previews the SF9 and SF10 for any learner (picked by LRN) and downloads or prints the PDFs.

Built with **Next.js (App Router) + React + TypeScript**. The AI import runs in Next.js API routes, so there is one app and one command to run.

## Run it

```bash
npm install
touch .env              # then add your AI key, see docs/ENV.md
npm run dev              # http://localhost:3000
```

Production: `npm run build && npm start`.

Free AI keys (one provider is enough; to serve more teachers at once, add keys for several providers or several comma-separated keys in `.env` and the app switches to the next when one is busy or out of quota, see `docs/ENV.md`): Gemini https://aistudio.google.com/apikey, Groq https://console.groq.com/keys, OpenRouter https://openrouter.ai/keys. Ollama (https://ollama.com) needs no key and runs on your own computer.

## Documentation

- [docs/CODE_MAP.md](docs/CODE_MAP.md): "where do I change X?" table
- [docs/STRUCTURE.md](docs/STRUCTURE.md): folder layout (frontend, backend, docs, secrets)
- [docs/AI_IMPORT.md](docs/AI_IMPORT.md): how the AI import works
- [docs/ENV.md](docs/ENV.md): every `.env` variable (AI keys, limits)
- [docs/SECURITY.md](docs/SECURITY.md): API keys, limits and what is git-ignored

## Tests

```bash
npm test          # server logic: mapping, SF10 validation, limits, AI client
npm run typecheck
```
