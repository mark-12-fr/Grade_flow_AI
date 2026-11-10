# GradeFlow AI: code map ("I want to change X, where do I look?")

| I want to change... | Look in |
|---|---|
| What a page shows | `src/app/(app)/<page>/page.tsx` (upload, verification, report-card, sf10, history, settings, help, summary) |
| The sidebar, top bar, step bar | `src/components/layout/Shell.tsx` |
| Toast messages, confirm dialogs | `src/components/layout/Providers.tsx` |
| The SF9 page on screen / the SF10 page on screen | `src/components/report/Sf9Sheet.tsx` / `Sf10Sheet.tsx` |
| The SF9 / SF10 **PDF** layout | `src/lib/pdf/sf9.ts` / `src/lib/pdf/sf10.ts` (separate from the on-screen pages) |
| What the upload does, error messages, Undo | `src/lib/state/actions.ts` |
| What is stored in the browser, when it saves | `src/lib/state/store.ts` and `persist.ts` |
| Grade rules (pass mark, averages, ranks) | `src/lib/domain/grading.ts` |
| Subjects per strand, months, core values | `src/lib/domain/curriculum.ts` |
| What is flagged as "needs checking" | `src/lib/sf9/quality.ts` / `src/lib/sf10/quality.ts` |
| How the AI reads a file | `src/server/import/` (see `docs/AI_IMPORT.md`) |
| Which AI provider and key is used | `src/server/core/llm.ts` (see `docs/ENV.md`) |
| Access code, rate limits | `src/server/core/guard.ts` |
| Colours, spacing, one area's look | `src/styles/` (one file per area, see below) |

## Styles

`src/app/globals.css` only imports the files in `src/styles/`, in this order (later files override earlier ones, so keep the order):

1. `01-tokens-and-base`: colours (light and dark), reset
2. `02-layout`: sidebar, top bar, step bar
3. `03-shared-ui`: buttons, cards, tables, forms
4. `04-upload-and-processing`
5. `05-verification`
6. `06-report-card-and-generated`
7. `07-workspace-toast-modal`
8. `08-dark-mode-overrides`
9. `09-responsive-and-print`
10. `10-documents-sf9-sf10-layout`
11. `11-motion-and-reading`
12. `12-sf10-browser-and-editing`
13. `13-ux-additions`

## How data flows

Browser: file chosen on the upload page -> `actions.ts` sends it to `/api/import` or `/api/import-sf10` -> the server reads it (`src/server/import/`) and streams progress -> `actions.ts` puts the learners into the state (`store.ts`) -> pages read the state; edits update it -> it is saved in the browser (`persist.ts`) -> PDFs are drawn from the same state (`src/lib/pdf/`).

Every file starts with a one-line comment saying what it is for.
