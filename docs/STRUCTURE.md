# GradeFlow AI: Project structure

One Next.js app: the pages (frontend) and the API routes (backend) must live in the same project, so they are separated by folder instead of by two projects.

```
Grade_flow_AI/
  src/
    app/                  FRONTEND pages + routing
      (app)/              upload, verification, report-card, generated-reports, sf10, summary, history, settings, help
      api/                BACKEND entry points (thin): import, import-sf10, observed-values, health
    components/           FRONTEND UI: layout/, report/ (SF9, SF10 sheets), ui/
    lib/                  FRONTEND logic: domain/, state/, sf9/, sf10/, pdf/
    server/               BACKEND logic (never imported by the browser): core/ (llm, guard, http, stream), import/, observed/
    styles/               CSS, one file per area (globals.css only imports them, in order)
    vendor/               bundled third-party code
  public/assets/          images and logos
  tests/                  vitest tests for the backend code
  samples/                the script that builds the fictional sample workbook (public/samples/messy_class.xlsx)
  docs/                   documentation (this folder)
  .env                    SECRETS, git-ignored (create it yourself, see docs/ENV.md)
```

Rule: code in `src/server/` is backend only; `src/components/` and `src/lib/` are frontend. Frontend code must not import from `src/server/`.
