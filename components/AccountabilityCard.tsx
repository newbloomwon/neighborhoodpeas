import type { Query311AccountabilityResult } from "../lib/contracts";
import { formatHours, pctClosedNoAction } from "../lib/reportExporter";

export interface AccountabilityCardProps {
  areaLabel: string;
  timeWindowDays: number;
  data: Pick<
    Query311AccountabilityResult,
    | "totalComplaints"
    | "openComplaints"
    | "closedNoActionCount"
    | "repeatLocationCount"
    | "medianResponseHours"
  >;
}

// Accountability Lens: how long the city took, how many complaints were closed
// with no action, and how many keep coming back. Numbers are shown as text
// first (screen-reader friendly); the meter is a visual extra, not the only cue.
export function AccountabilityCard({ areaLabel, timeWindowDays, data }: AccountabilityCardProps) {
  const pct = pctClosedNoAction(data.closedNoActionCount, data.totalComplaints);

  return (
    <section aria-labelledby="accountability-title" style={styles.card}>
      <h2 id="accountability-title" style={styles.title}>
        Accountability Lens: {areaLabel}
      </h2>
      <p style={styles.sub}>
        311 complaints in the last {timeWindowDays} days:{" "}
        <strong>{data.totalComplaints.toLocaleString("en-US")}</strong> total,{" "}
        <strong>{data.openComplaints.toLocaleString("en-US")}</strong> still open.
      </p>

      <dl style={styles.grid}>
        <div style={styles.cell}>
          <dt style={styles.term}>City response time (median)</dt>
          <dd style={styles.value}>{formatHours(data.medianResponseHours)}</dd>
        </div>

        <div style={styles.cell}>
          <dt style={styles.term}>Closed with no action</dt>
          <dd style={styles.value}>
            {data.closedNoActionCount.toLocaleString("en-US")} ({pct}%)
          </dd>
          <meter
            min={0}
            max={100}
            value={pct}
            aria-label={`${pct} percent of complaints closed with no action`}
            style={styles.meter}
          />
        </div>

        <div style={styles.cell}>
          <dt style={styles.term}>Addresses that keep coming back</dt>
          <dd style={styles.value}>{data.repeatLocationCount.toLocaleString("en-US")}</dd>
          <p style={styles.hint}>Addresses with 3 or more repeat complaints.</p>
        </div>
      </dl>
    </section>
  );
}

const styles = {
  card: { background: "#000", color: "#fff", padding: 16, borderRadius: 8 },
  title: { margin: 0, fontSize: 22 },
  sub: { margin: "4px 0 12px", color: "#e6e6e6" },
  grid: { margin: 0, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" },
  cell: { border: "2px solid #fff", borderRadius: 6, padding: 12 },
  term: { fontSize: 14, color: "#e6e6e6" },
  value: { margin: "4px 0 0", fontSize: 26, fontWeight: 700 },
  meter: { width: "100%", marginTop: 8 },
  hint: { margin: "4px 0 0", fontSize: 13, color: "#cfcfcf" },
} as const;
