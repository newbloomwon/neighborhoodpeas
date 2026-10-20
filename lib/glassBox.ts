import type {
  DatasetId,
  Query311AccountabilityResult,
  QueryIntersectionCrashesResult,
} from "./contracts";

export type GlassBoxToolName =
  | "resolve_street_block"
  | "query_311_accountability"
  | "query_intersection_crashes"
  | "generate_accountability_report";

export type GlassBoxStatus = "running" | "done" | "error";

// One row in the Glass Box feed. Persons B and C emit these (or the helpers
// below build them from tool results); Person E only renders them.
export interface GlassBoxStep {
  id: string;
  tool: GlassBoxToolName;
  status: GlassBoxStatus;
  startedAt: number; // epoch ms
  durationMs?: number;
  // The exact query / bounding box / filters that were executed.
  query?: string;
  filters?: Record<string, string | number>;
  recordCount?: number;
  datasetId?: DatasetId;
  notice?: string;
  error?: string;
}

export const AGENT_LABELS: Record<GlassBoxToolName, string> = {
  resolve_street_block: "Spatial Block Resolver",
  query_311_accountability: "311 Accountability Agent",
  query_intersection_crashes: "Vision Zero Crash Agent",
  generate_accountability_report: "Report Generator",
};

export const DEFAULT_CRASH_LAG_NOTICE =
  "NYPD crash data runs about 4 months behind. Recent crashes may not appear yet.";

export function datasetUrl(id: DatasetId): string {
  return `https://data.cityofnewyork.us/d/${id}`;
}

export function stepFrom311(
  result: Query311AccountabilityResult,
  meta: {
    id: string;
    startedAt: number;
    durationMs?: number;
    filters?: Record<string, string | number>;
  },
): GlassBoxStep {
  return {
    id: meta.id,
    tool: "query_311_accountability",
    status: "done",
    startedAt: meta.startedAt,
    durationMs: meta.durationMs,
    query: result.executedQuery,
    filters: meta.filters,
    recordCount: result.totalComplaints,
    datasetId: result.sourceDatasetId,
  };
}

export function stepFromCrashes(
  result: QueryIntersectionCrashesResult,
  meta: {
    id: string;
    startedAt: number;
    durationMs?: number;
    filters?: Record<string, string | number>;
  },
): GlassBoxStep {
  return {
    id: meta.id,
    tool: "query_intersection_crashes",
    status: "done",
    startedAt: meta.startedAt,
    durationMs: meta.durationMs,
    query: result.executedQuery,
    filters: meta.filters,
    recordCount: result.totalCrashes,
    datasetId: result.sourceDatasetId,
    notice: result.lagDisclosureNotice,
  };
}
