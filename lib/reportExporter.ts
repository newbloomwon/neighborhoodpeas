import type {
  AccountabilityReportSummary,
  GenerateAccountabilityReportResult,
  Query311AccountabilityResult,
  QueryIntersectionCrashesResult,
} from "./contracts";

export type ReportLanguage = "en" | "es";

export interface ReportInput {
  targetArea: string;
  language: ReportLanguage;
  councilDistrict: number;
  timeWindowDays: number;
  complaints: Query311AccountabilityResult;
  // One entry per intersection Person C checked for this area.
  crashes?: { intersection: string; result: QueryIntersectionCrashesResult }[];
}

export interface BuiltReport extends GenerateAccountabilityReportResult {
  html: string;
}

export function pctClosedNoAction(closedNoAction: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((closedNoAction / total) * 1000) / 10;
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return "n/a";
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A corner is "high risk" if it had a fatality or any pedestrian/cyclist injury.
// This reports recorded history only; it is not a prediction or a score.
export function highRiskCorners(crashes: ReportInput["crashes"] = []): string[] {
  return crashes
    .filter(
      ({ result: r }) => r.fatalities > 0 || r.pedestrianInjuries > 0 || r.cyclistInjuries > 0,
    )
    .map((c) => c.intersection);
}

export function summarize(input: ReportInput): AccountabilityReportSummary {
  const c = input.complaints;
  return {
    total311Volume: c.totalComplaints,
    pctClosedNoAction: pctClosedNoAction(c.closedNoActionCount, c.totalComplaints),
    chronicRepeatLocations: c.repeatLocationCount,
    medianAgencyResponseHours: c.medianResponseHours,
    highRiskCorners: highRiskCorners(input.crashes),
  };
}

const T = {
  en: {
    lang: "en",
    title: "Neighborhood Accountability Report",
    to: (d: number) => `To: Council Member, City Council District ${d}`,
    intro: (area: string, days: number) =>
      `This report summarizes what residents reported to 311 in ${area} over the last ${days} days, and how the city responded.`,
    h311: "311 service requests",
    total: "Total complaints",
    open: "Still open",
    noAction: "Closed with no action",
    repeat: "Addresses with 3 or more repeat complaints",
    median: "Median city response time",
    topDescriptors: "Most common complaint types",
    hCrash: "Crash history at corners",
    corner: "Intersection",
    crashes: "Crashes",
    ped: "Pedestrian injuries",
    cyc: "Cyclist injuries",
    fatal: "Fatalities",
    highRisk: "Corners with a recorded fatality or pedestrian/cyclist injury",
    none: "None recorded",
    sources: "Sources",
    q: "Query",
    honest:
      "This report shows what people reported and how the city responded. It does not predict crime or score people.",
    generated: "Generated",
    dataThrough: "Data through",
  },
  es: {
    lang: "es",
    title: "Informe de Rendición de Cuentas del Vecindario",
    to: (d: number) => `Para: Miembro del Concejo, Distrito ${d} del Concejo Municipal`,
    intro: (area: string, days: number) =>
      `Este informe resume lo que los residentes reportaron al 311 en ${area} durante los últimos ${days} días, y cómo respondió la ciudad.`,
    h311: "Solicitudes de servicio al 311",
    total: "Total de quejas",
    open: "Aún abiertas",
    noAction: "Cerradas sin acción",
    repeat: "Direcciones con 3 o más quejas repetidas",
    median: "Tiempo mediano de respuesta de la ciudad",
    topDescriptors: "Tipos de queja más comunes",
    hCrash: "Historial de choques en las esquinas",
    corner: "Intersección",
    crashes: "Choques",
    ped: "Peatones heridos",
    cyc: "Ciclistas heridos",
    fatal: "Muertes",
    highRisk: "Esquinas con una muerte o peatón/ciclista herido registrado",
    none: "Ninguna registrada",
    sources: "Fuentes",
    q: "Consulta",
    honest:
      "Este informe muestra lo que la gente reportó y cómo respondió la ciudad. No predice delitos ni califica a las personas.",
    generated: "Generado",
    dataThrough: "Datos hasta",
  },
} as const;

function datasetLink(id: string): string {
  return `<a href="https://data.cityofnewyork.us/d/${escapeHtml(id)}">NYC Open Data ${escapeHtml(id)}</a>`;
}

export function renderReportHtml(
  input: ReportInput,
  summary: AccountabilityReportSummary,
  reportId: string,
  generatedAt: Date,
): string {
  const t = T[input.language];
  const area = escapeHtml(input.targetArea);
  const c = input.complaints;
  const crashes = input.crashes ?? [];

  const descriptors = c.topDescriptors
    .map((d) => `<li>${escapeHtml(d.descriptor)}: ${d.count}</li>`)
    .join("");

  const crashRows = crashes
    .map(
      ({ intersection, result: r }) =>
        `<tr><th scope="row">${escapeHtml(intersection)}</th><td>${r.totalCrashes}</td><td>${r.pedestrianInjuries}</td><td>${r.cyclistInjuries}</td><td>${r.fatalities}</td></tr>`,
    )
    .join("");

  // The crash lag notice is required on screen wherever crash data appears.
  const lagNotices = Array.from(new Set(crashes.map((x) => x.result.lagDisclosureNotice)))
    .map((n) => `<p class="notice">${escapeHtml(n)}</p>`)
    .join("");
  const dataThrough = crashes.map((x) => x.result.dataThroughDate).sort()[0];

  const sourceItems = [
    `<li>${datasetLink(c.sourceDatasetId)}<br>${t.q}: <code>${escapeHtml(c.executedQuery)}</code></li>`,
    ...crashes.map(
      ({ intersection, result: r }) =>
        `<li>${datasetLink(r.sourceDatasetId)} (${escapeHtml(intersection)})<br>${t.q}: <code>${escapeHtml(r.executedQuery)}</code></li>`,
    ),
  ].join("");

  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(t.title)}: ${area}</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; color: #000; background: #fff; max-width: 800px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 26px; margin-bottom: 4px; }
  h2 { font-size: 20px; margin-top: 28px; border-bottom: 2px solid #000; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
  .notice { background: #ffe14d; padding: 8px 12px; border-radius: 4px; }
  code { word-break: break-word; font-size: 13px; }
  footer { margin-top: 32px; font-size: 14px; }
  @media print { a { color: #000; } }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(t.title)}</h1>
<p>${escapeHtml(t.to(input.councilDistrict))}</p>
<p>${t.intro(area, input.timeWindowDays)}</p>

<h2>${t.h311}</h2>
<table>
<tr><th scope="row">${t.total}</th><td>${c.totalComplaints}</td></tr>
<tr><th scope="row">${t.open}</th><td>${c.openComplaints}</td></tr>
<tr><th scope="row">${t.noAction}</th><td>${c.closedNoActionCount} (${summary.pctClosedNoAction}%)</td></tr>
<tr><th scope="row">${t.repeat}</th><td>${c.repeatLocationCount}</td></tr>
<tr><th scope="row">${t.median}</th><td>${escapeHtml(formatHours(c.medianResponseHours))}</td></tr>
</table>
${descriptors ? `<h3>${t.topDescriptors}</h3><ul>${descriptors}</ul>` : ""}

${
  crashes.length
    ? `<h2>${t.hCrash}</h2>
${lagNotices}${dataThrough ? `<p>${t.dataThrough}: ${escapeHtml(dataThrough)}</p>` : ""}
<table>
<tr><th scope="col">${t.corner}</th><th scope="col">${t.crashes}</th><th scope="col">${t.ped}</th><th scope="col">${t.cyc}</th><th scope="col">${t.fatal}</th></tr>
${crashRows}
</table>
<p><strong>${t.highRisk}:</strong> ${
        summary.highRiskCorners.length
          ? summary.highRiskCorners.map(escapeHtml).join("; ")
          : t.none
      }</p>`
    : ""
}

<h2>${t.sources}</h2>
<ul>${sourceItems}</ul>
</main>
<footer>
<p>${t.honest}</p>
<p>${t.generated}: ${generatedAt.toISOString()} · ID ${escapeHtml(reportId)}</p>
</footer>
</body>
</html>`;
}

// Builds the full report from data Persons B/C already fetched. No network
// calls happen here, so it stays well inside the 10 second SLA.
export function buildReport(input: ReportInput, shareBaseUrl: string): BuiltReport {
  const start = Date.now();
  const reportId = globalThis.crypto.randomUUID();
  const summaryMetrics = summarize(input);
  const html = renderReportHtml(input, summaryMetrics, reportId, new Date(start));
  return {
    reportId,
    generatedInMs: Date.now() - start,
    summaryMetrics,
    shareableUrl: `${shareBaseUrl}?id=${reportId}`,
    html,
  };
}
