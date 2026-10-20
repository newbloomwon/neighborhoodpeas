import { buildReport, type ReportInput } from "../../../lib/reportExporter";

// POST /api/report  -> builds the report, returns JSON (summary + shareableUrl + html)
// GET  /api/report?id=<reportId> -> returns the saved report as a print/PDF-ready page
//
// Storage is in memory, so shared links only live as long as this server
// instance. Swap `store` for Supabase/KV if links need to outlive a restart.
const MAX_STORED = 100;
const store = new Map<string, string>();

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Returns an error message, or null if the body is a usable ReportInput.
function validate(b: unknown): string | null {
  if (typeof b !== "object" || b === null) return "Body must be a JSON object.";
  const x = b as Record<string, unknown>;
  if (typeof x.targetArea !== "string" || !x.targetArea.trim() || x.targetArea.length > 200)
    return "targetArea must be a non-empty string up to 200 characters.";
  if (x.language !== "en" && x.language !== "es") return 'language must be "en" or "es".';
  if (!Number.isInteger(x.councilDistrict) || (x.councilDistrict as number) < 1 || (x.councilDistrict as number) > 51)
    return "councilDistrict must be an integer from 1 to 51.";
  if (!isFiniteNumber(x.timeWindowDays) || x.timeWindowDays < 1 || x.timeWindowDays > 365)
    return "timeWindowDays must be a number from 1 to 365.";
  const c = x.complaints as Record<string, unknown> | undefined;
  if (typeof c !== "object" || c === null) return "complaints is required.";
  for (const k of ["totalComplaints", "openComplaints", "closedNoActionCount", "repeatLocationCount", "medianResponseHours"]) {
    if (!isFiniteNumber(c[k])) return `complaints.${k} must be a number.`;
  }
  if (typeof c.executedQuery !== "string" || !Array.isArray(c.topDescriptors))
    return "complaints.executedQuery and complaints.topDescriptors are required.";
  if (x.crashes !== undefined && !Array.isArray(x.crashes)) return "crashes must be an array.";
  return null;
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const problem = validate(body);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const base = `${new URL(req.url).origin}/api/report`;
  const report = buildReport(body as ReportInput, base);

  store.set(report.reportId, report.html);
  if (store.size > MAX_STORED) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }

  return Response.json(report);
}

export async function GET(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  const html = id ? store.get(id) : undefined;
  if (!html) return new Response("Report not found.", { status: 404 });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
