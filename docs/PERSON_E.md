# Person E: Glass Box AI & Report UI

## Files
| File | What it does |
| --- | --- |
| `lib/contracts.ts` | Tool return types copied from PRD section 4b. Shared with B and C. |
| `lib/glassBox.ts` | `GlassBoxStep` type, agent labels, and `stepFrom311` / `stepFromCrashes` helpers. |
| `components/GlassBoxPanel.tsx` | Live feed of agent steps, queries, record counts, dataset links, and the crash-lag badge. |
| `components/AccountabilityCard.tsx` | Median response time, closed-with-no-action rate, repeat addresses. |
| `lib/reportExporter.ts` | Builds the print/PDF-ready report (English and Spanish). |
| `app/api/report/route.ts` | `POST` builds a report, `GET ?id=` serves it. |

## What Persons B and C need to do
- **Glass Box:** push a `GlassBoxStep` for every tool call, with `status: "running"` when it starts and `"done"` or `"error"` when it ends. For 311 and crash results, `stepFrom311(result, meta)` and `stepFromCrashes(result, meta)` build the step.
- **Report:** `POST /api/report` with `{ targetArea, language, councilDistrict, timeWindowDays, complaints, crashes? }`. `complaints` is the `query_311_accountability` result. `crashes` is a list of `{ intersection, result }` from `query_intersection_crashes`.
- The response has `reportId`, `generatedInMs`, `summaryMetrics`, `shareableUrl`, and `html`.

## What Person F needs to do
- The panel has `id="glass-box"` and `tabIndex={-1}`, so the `G` shortcut can call `document.getElementById("glass-box")?.focus()`.
- The `R` shortcut should call `POST /api/report`, then open `shareableUrl`.
- The panel uses `role="log"` and never speaks on its own, so it won't clash with the ScreenReaderAnnouncer.

## Known limits
- Shared report links are stored in memory, so they disappear when the server restarts. Swap `store` in `route.ts` for a database if links must last.
- The crash-lag notice comes from Person B's `lagDisclosureNotice`. If it is missing, the panel shows a default 4-month warning.
