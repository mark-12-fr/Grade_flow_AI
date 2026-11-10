# GradeFlow AI: Security and API keys

- The key lives only in `.env` (git-ignored) on the server. The browser never sees it and `/api/health` only says whether it is set.
- Never put the key in any committed file. Do not paste it in chat, issues or screenshots.
- Optional limits (all **off** by default, see `docs/ENV.md`): per-visitor rate limit, a daily cap on AI calls for the whole server, a max number of sheets per SF10 upload and a max sheet size. Over a limit the API answers 429/422 with a clear message and **no AI call is made**. Turn them on before sharing the server or when using a paid key.
- Set `APP_ACCESS_CODE` when anyone else can reach the server; the app asks for the code once per browser session.
- Free tiers may use submitted data to improve their models. Use **fictional data only** for demos; for real learner data use Ollama or a paid plan with data use disabled.


## Secret files (all git-ignored)

`.env`, `.env.local`, `.env.*.local`, `*.pem`, `*.key`, service-account JSON files and `.vercel/` never get committed. Variable names are documented in `docs/ENV.md` (no real values). On Railway, put the same variables in the service's **Variables** tab instead of a file.
