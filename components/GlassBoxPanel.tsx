"use client";

import { forwardRef } from "react";
import {
  AGENT_LABELS,
  DEFAULT_CRASH_LAG_NOTICE,
  datasetUrl,
  type GlassBoxStep,
} from "../lib/glassBox";

export interface GlassBoxPanelProps {
  steps: GlassBoxStep[];
  // From query_intersection_crashes.dataThroughDate, if known.
  crashDataThroughDate?: string;
  crashLagNotice?: string;
}

const STATUS_LABEL = { running: "Running", done: "Done", error: "Failed" } as const;

// Live provenance feed: which agent ran, the exact query, how many records it
// found, and a link to the NYC Open Data dataset every number came from.
// Focusable (tabIndex -1, id="glass-box") so Person F's "G" shortcut can move
// focus here. role="log" gives screen readers polite, ordered updates; the
// ScreenReaderAnnouncer owns spoken narration, so this panel is not assertive.
export const GlassBoxPanel = forwardRef<HTMLElement, GlassBoxPanelProps>(
  function GlassBoxPanel(
    { steps, crashDataThroughDate, crashLagNotice = DEFAULT_CRASH_LAG_NOTICE },
    ref,
  ) {
    return (
      <section
        ref={ref}
        id="glass-box"
        tabIndex={-1}
        aria-labelledby="glass-box-title"
        style={styles.panel}
      >
        <h2 id="glass-box-title" style={styles.title}>
          Glass Box AI
        </h2>
        <p style={styles.sub}>Every number below shows where it came from.</p>

        <p role="note" style={styles.lagBadge}>
          <strong>Data lag:</strong> {crashLagNotice}
          {crashDataThroughDate ? ` Crash data runs through ${crashDataThroughDate}.` : ""}
        </p>

        <ol role="log" aria-label="Agent activity" style={styles.list}>
          {steps.length === 0 && (
            <li style={styles.empty}>No agents have run yet. Start walking or ask a question.</li>
          )}
          {steps.map((s) => (
            <li key={s.id} style={styles.step}>
              <div style={styles.stepHead}>
                <span style={styles.agent}>{s.agentLabel ?? AGENT_LABELS[s.tool]}</span>
                <span style={styles.status} data-status={s.status}>
                  {STATUS_LABEL[s.status]}
                  {s.durationMs !== undefined ? ` · ${s.durationMs} ms` : ""}
                </span>
              </div>

              {s.query && (
                <>
                  <span style={styles.label}>Query</span>
                  <pre style={styles.query} tabIndex={0} aria-label="Executed query">
                    {s.query}
                  </pre>
                </>
              )}

              {s.filters && Object.keys(s.filters).length > 0 && (
                <dl style={styles.filters}>
                  {Object.entries(s.filters).map(([k, v]) => (
                    <div key={k} style={styles.filterRow}>
                      <dt style={styles.label}>{k}</dt>
                      <dd style={styles.dd}>{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {s.recordCount !== undefined && (
                <p style={styles.line}>
                  Records found: <strong>{s.recordCount.toLocaleString("en-US")}</strong>
                </p>
              )}

              {s.datasetId && (
                <p style={styles.line}>
                  Source:{" "}
                  <a href={datasetUrl(s.datasetId)} target="_blank" rel="noopener noreferrer">
                    NYC Open Data {s.datasetId}
                    <span style={styles.srOnly}> (opens in a new tab)</span>
                  </a>
                </p>
              )}

              {s.notice && <p style={styles.line}>{s.notice}</p>}
              {s.error && (
                <p style={styles.error} role="alert">
                  {s.error}
                </p>
              )}
            </li>
          ))}
        </ol>

        <p style={styles.honest}>
          This shows what residents reported and how the city responded. It does not predict
          crime or score people.
        </p>
      </section>
    );
  },
);

// High-contrast palette: all text/background pairs are >= 7:1 (WCAG AAA).
const styles = {
  panel: { background: "#000", color: "#fff", padding: 16, borderRadius: 8, outlineOffset: 2 },
  title: { margin: 0, fontSize: 22 },
  sub: { margin: "4px 0 12px", color: "#e6e6e6" },
  lagBadge: {
    background: "#ffe14d",
    color: "#000",
    padding: "8px 12px",
    borderRadius: 6,
    margin: "0 0 12px",
    fontSize: 15,
  },
  list: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 },
  empty: { color: "#e6e6e6" },
  step: { border: "2px solid #fff", borderRadius: 6, padding: 12 },
  stepHead: { display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  agent: { fontWeight: 700, fontSize: 17 },
  status: { color: "#e6e6e6", fontSize: 14 },
  label: { display: "block", fontSize: 13, color: "#cfcfcf", marginTop: 8 },
  query: {
    background: "#1a1a1a",
    color: "#fff",
    padding: 8,
    borderRadius: 4,
    margin: "4px 0 0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: 13,
  },
  filters: { margin: 0 },
  filterRow: { display: "flex", gap: 8 },
  dd: { margin: "8px 0 0" },
  line: { margin: "8px 0 0" },
  error: { margin: "8px 0 0", color: "#ffb3b3", fontWeight: 700 },
  honest: { margin: "12px 0 0", fontSize: 13, color: "#cfcfcf" },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  },
} as const;
