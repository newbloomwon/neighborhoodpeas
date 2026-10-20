// Live NYC Open Data lookups per block (stand-in until Person B's openDataEngine lands).
// Every number is computed from the rows Socrata returns — nothing is estimated.
import type { BlockContext } from "./streetGraph";
import type { Query311AccountabilityResult, QueryIntersectionCrashesResult } from "./contracts";

const SODA = "https://data.cityofnewyork.us/resource";

export interface BlockData {
  noise: Query311AccountabilityResult; // 311 noise complaints, last 30 days
  all311: Query311AccountabilityResult; // all 311 complaints, last 30 days
  crashes: QueryIntersectionCrashesResult; // upcoming intersection, last 12 months of available data
}

const iso = (d: Date) => d.toISOString().slice(0, 19);
const NO_ACTION = /no evidence|no action|did not observe|unable to|could not find|not necessary|was not found/i;

function box(b: { north: number; south: number; east: number; west: number }) {
  return `within_box(location, ${b.north.toFixed(6)}, ${b.west.toFixed(6)}, ${b.south.toFixed(6)}, ${b.east.toFixed(6)})`;
}

async function soda<T>(dataset: string, params: Record<string, string>): Promise<{ rows: T[]; url: string }> {
  const url = `${SODA}/${dataset}.json?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NYC Open Data ${res.status}`);
  return { rows: (await res.json()) as T[], url };
}

interface Row311 {
  created_date: string;
  closed_date?: string;
  status: string;
  complaint_type: string;
  descriptor?: string;
  resolution_description?: string;
  incident_address?: string;
}

function summarize311(rows: Row311[], url: string): Query311AccountabilityResult {
  const hours = rows
    .filter((r) => r.closed_date)
    .map((r) => (Date.parse(r.closed_date!) - Date.parse(r.created_date)) / 36e5)
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);
  const median = hours.length ? hours[Math.floor(hours.length / 2)] : 0;
  const byAddr = new Map<string, number>();
  const byDesc = new Map<string, number>();
  for (const r of rows) {
    if (r.incident_address) byAddr.set(r.incident_address, (byAddr.get(r.incident_address) ?? 0) + 1);
    const d = r.descriptor || r.complaint_type;
    byDesc.set(d, (byDesc.get(d) ?? 0) + 1);
  }
  return {
    totalComplaints: rows.length,
    openComplaints: rows.filter((r) => r.status !== "Closed").length,
    closedNoActionCount: rows.filter((r) => r.status === "Closed" && NO_ACTION.test(r.resolution_description ?? "")).length,
    repeatLocationCount: [...byAddr.values()].filter((n) => n >= 3).length,
    medianResponseHours: Math.round(median * 10) / 10,
    topDescriptors: [...byDesc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([descriptor, count]) => ({ descriptor, count })),
    sourceDatasetId: "erm2-nwe9",
    executedQuery: url,
  };
}

const cache = new Map<string, Promise<BlockData>>();

export function fetchBlockData(block: BlockContext): Promise<BlockData> {
  const hit = cache.get(block.blockId);
  if (hit) return hit;
  const p = load(block);
  cache.set(block.blockId, p);
  p.catch(() => cache.delete(block.blockId));
  return p;
}

async function load(block: BlockContext): Promise<BlockData> {
  const since = new Date(Date.now() - 30 * 864e5);
  const select = "created_date,closed_date,status,complaint_type,descriptor,resolution_description,incident_address";
  const where = `${box(block.bbox)} AND created_date > '${iso(since)}'`;

  const c = block.upcomingIntersection;
  const d = 35 / 111320;
  const dLon = 35 / (111320 * Math.cos((c.lat * Math.PI) / 180));
  const cornerBox = { north: c.lat + d, south: c.lat - d, east: c.lon + dLon, west: c.lon - dLon };

  const [all, latest] = await Promise.all([
    soda<Row311>("erm2-nwe9", { $select: select, $where: where, $limit: "5000" }),
    soda<{ m: string }>("h9gi-nx95", { $select: "max(crash_date) as m" }),
  ]);
  const through = latest.rows[0]?.m?.slice(0, 10) ?? "";
  const crashSince = new Date(Date.parse(through || new Date().toISOString()) - 365 * 864e5);
  const crashes = await soda<Record<string, string>>("h9gi-nx95", {
    $select:
      "count(*) as n, sum(number_of_pedestrians_injured) as ped, sum(number_of_cyclist_injured) as cyc, sum(number_of_motorist_injured) as mot, sum(number_of_persons_killed) as killed",
    $where: `${box(cornerBox)} AND crash_date > '${iso(crashSince)}'`,
  });
  const cr = crashes.rows[0] ?? {};
  const num = (v?: string) => Number(v ?? 0) || 0;

  const noiseRows = all.rows.filter((r) => /noise/i.test(r.complaint_type));
  return {
    noise: summarize311(noiseRows, `${all.url} (filtered: complaint_type contains "Noise")`),
    all311: summarize311(all.rows, all.url),
    crashes: {
      totalCrashes: num(cr.n),
      pedestrianInjuries: num(cr.ped),
      cyclistInjuries: num(cr.cyc),
      motoristInjuries: num(cr.mot),
      fatalities: num(cr.killed),
      dataThroughDate: through,
      lagDisclosureNotice: `NYPD crash data runs about four months behind. Currently updated through ${through}.`,
      sourceDatasetId: "h9gi-nx95",
      executedQuery: crashes.url,
    },
  };
}

export function narrate(block: BlockContext, d: BlockData): string {
  const n = d.noise;
  const top = n.topDescriptors[0];
  const noise =
    n.totalComplaints === 0
      ? "No noise complaints on this block in the last 30 days."
      : `This block had ${n.totalComplaints} noise complaint${n.totalComplaints === 1 ? "" : "s"} in the last 30 days${top ? `, mostly ${top.descriptor.toLowerCase()}` : ""}. ${n.openComplaints} ${n.openComplaints === 1 ? "is" : "are"} still open.`;
  const c = d.crashes;
  const vulnerable = c.pedestrianInjuries + c.cyclistInjuries;
  const crash =
    c.totalCrashes === 0
      ? `No reported crashes at ${block.toCrossStreet} in the last year of data.`
      : `Crossing ${block.toCrossStreet}: ${c.totalCrashes} crash${c.totalCrashes === 1 ? "" : "es"} in the last year of data${vulnerable ? `, ${c.pedestrianInjuries} pedestrian and ${c.cyclistInjuries} cyclist injur${vulnerable === 1 ? "y" : "ies"}. Heads up at this corner.` : "."}`;
  return `You're on ${block.streetName}, between ${block.fromCrossStreet} and ${block.toCrossStreet}. ${noise} ${crash}`;
}
