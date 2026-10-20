"use client";
// Walk Mode shell (Person A). Other parts plug in through:
//   window "peas:block"  CustomEvent<BlockContext>   — fired on every block change (B/C/D/E listen)
//   window "peas:walk"   CustomEvent<{direction, crossStreet?}> — D (voice) and F (keys) can dispatch to move
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Map as MapLibreMap } from "maplibre-gl";
import { planWalk, StreetWalker, type BlockContext, type WalkDirection, type Walker } from "@/lib/streetGraph";
import { planRoute } from "@/lib/streetNetwork";
import { dropToStreet, glideTo, turnOnto, prefersReducedMotion } from "@/lib/cameraChoreographer";
import { fetchBlockData, type BlockData } from "@/lib/blockData";
import { askAboutBlock, blockSteps, narrateBlock } from "@/lib/agentBridge";
import type { GlassBoxStep } from "@/lib/glassBox";
import { GlassBoxPanel } from "@/components/GlassBoxPanel";
import { AccountabilityCard } from "@/components/AccountabilityCard";

const Map3DCanvas = dynamic(() => import("@/components/Map3DCanvas"), { ssr: false });

/** Minimal walk-intent parser until Person D's voice router lands. */
function parseWalkIntent(text: string): { direction: WalkDirection; crossStreet?: string } | { start: { origin: string; destination: string } } | null {
  const t = text.toLowerCase().trim();
  const walk = text.trim().match(/^(?:walk|start|ll[eé]vame|camina)(?: me)?(?: (?:from|on|desde|en))? (.+?)(?: (?:to|hasta|a) (.+))?$/i);
  if (/^(next|forward|siguiente|adelante)|next block|siguiente cuadra/.test(t)) return { direction: "next_block" };
  if (/^(back|go back|previous|atr[aá]s)|back one block|cuadra anterior/.test(t)) return { direction: "prev_block" };
  const turn = t.match(/(?:turn|gira|dobla) (left|right|a la izquierda|a la derecha)(?: (?:on|onto|en) (.+))?/);
  if (turn) return { direction: /left|izquierda/.test(turn[1]) ? "turn_left" : "turn_right", crossStreet: turn[2] };
  if (walk) return { start: { origin: walk[1] ?? "", destination: walk[2] ?? "" } };
  return null;
}

export default function WalkPage() {
  const [plan, setPlan] = useState(() => planWalk());
  const [block, setBlock] = useState<BlockContext | null>(null);
  const [caption, setCaption] = useState("Type where you are and where you want to go, or press Start for a demo walk down Knickerbocker Avenue.");
  const [input, setInput] = useState("");
  const walker = useRef<Walker | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const map = useRef<MapLibreMap | null>(null);
  const busy = useRef(false);
  const [data, setData] = useState<BlockData | null>(null);
  const [dataErr, setDataErr] = useState("");
  const [steps, setSteps] = useState<GlassBoxStep[]>([]);
  const [tab, setTab] = useState<"block" | "lens" | "glass">("block");
  const [exporting, setExporting] = useState(false);
  const pushSteps = useCallback((s: GlassBoxStep[]) => setSteps((prev) => [...s, ...prev].slice(0, 40)), []);

  const announce = useCallback((b: BlockContext) => {
    setBlock(b);
    setCaption(`You're on ${b.streetName}, between ${b.fromCrossStreet} and ${b.toCrossStreet}. Checking NYC Open Data…`);
    setData(null);
    setDataErr("");
    window.dispatchEvent(new CustomEvent("peas:block", { detail: b }));
    fetchBlockData(b)
      .then((d) => {
        if (walker.current?.current().blockId !== b.blockId) return;
        setData(d);
        // Person C's Walk Narrator writes the line; its fact gate checks every number.
        const n = narrateBlock(b, d);
        setCaption(n.text);
        pushSteps(blockSteps(b, d, n.trace, n.ms));
      })
      .catch(() => {
        setDataErr("Couldn't reach NYC Open Data right now.");
        setCaption(`You're on ${b.streetName}, between ${b.fromCrossStreet} and ${b.toCrossStreet}. I couldn't reach NYC Open Data, so I won't guess any numbers.`);
      });
    const next = walker.current?.peek("next_block");
    if (next) fetchBlockData(next).catch(() => {});
  }, [pushSteps]);

  const start = useCallback(
    async (origin = "", destination = "") => {
      if (!map.current || busy.current) return;
      let w: Walker;
      if (!origin.trim() && !destination.trim()) {
        w = new StreetWalker(planWalk());
      } else {
        setLoading(true);
        setCaption(`Finding a walking route${destination ? ` from ${origin} to ${destination}` : ` from ${origin}`}…`);
        try {
          w = (await planRoute(origin, destination)).walker;
        } catch (err) {
          setCaption(err instanceof Error ? err.message : "I couldn't plan that walk.");
          return;
        } finally {
          setLoading(false);
        }
      }
      walker.current = w;
      setPlan(w.plan);
      const b = w.current();
      announce(b);
      busy.current = true;
      await dropToStreet(map.current, b, { reducedMotion: prefersReducedMotion() });
      busy.current = false;
    },
    [announce],
  );

  const move = useCallback(
    async (direction: WalkDirection, crossStreet?: string) => {
      if (!map.current || busy.current) return;
      if (!walker.current) {
        if (direction === "next_block") await start();
        return;
      }
      const r = walker.current.move(direction, crossStreet);
      if (!r.ok) {
        setCaption(r.reason);
        return;
      }
      announce(r.block);
      busy.current = true;
      const opts = { reducedMotion: prefersReducedMotion() };
      await (direction.startsWith("turn") ? turnOnto(map.current, r.block, opts) : glideTo(map.current, r.block, opts));
      busy.current = false;
    },
    [announce, start],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const dir = ({ ArrowUp: "next_block", ArrowDown: "prev_block", ArrowLeft: "turn_left", ArrowRight: "turn_right" } as const)[e.key as "ArrowUp"];
      if (dir) {
        e.preventDefault();
        move(dir);
      } else if (e.key === "g" || e.key === "G") {
        setTab("glass");
        setTimeout(() => document.getElementById("glass-box")?.focus(), 0);
      }
    };
    const onWalk = (e: Event) => {
      const d = (e as CustomEvent<{ direction: WalkDirection; crossStreet?: string }>).detail;
      move(d.direction, d.crossStreet);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("peas:walk", onWalk);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("peas:walk", onWalk);
    };
  }, [move]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const intent = parseWalkIntent(input);
    setInput("");
    if (!intent) {
      // Not a walk command → a question for Person C's grounded Q&A.
      if (!input.trim()) return;
      if (!block || !data) return setCaption("Start a walk first, then ask about the block you're on.");
      const a = askAboutBlock(input, block, data);
      setCaption(a.answer);
      pushSteps(a.steps);
      return;
    }
    if ("start" in intent) {
      setFrom(intent.start.origin);
      setTo(intent.start.destination);
      start(intent.start.origin, intent.start.destination);
    }
    else move(intent.direction, intent.crossStreet);
  };

  const exportReport = async (b: BlockContext, d: BlockData) => {
    if (!d.councilDistrict) return;
    setExporting(true);
    const startedAt = Date.now();
    // Open the tab during the click so popup blockers allow it; fill it once the report is built.
    const win = window.open("", "_blank");
    if (win) win.document.write("<p style='font:16px system-ui;padding:24px'>Building accountability report…</p>");
    try {
      // Person E's report endpoint builds the council-ready page from the live numbers.
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetArea: `${b.streetName} between ${b.fromCrossStreet} and ${b.toCrossStreet}, ${b.borough}`,
          language: "en",
          councilDistrict: d.councilDistrict,
          timeWindowDays: 30,
          complaints: d.all311,
          crashes: [{ intersection: b.upcomingIntersection.name, result: d.crashes }],
        }),
      });
      const report = await res.json();
      if (!res.ok) throw new Error(report.error ?? "Report failed");
      // Open the returned HTML directly; the endpoint's in-memory links don't survive serverless restarts.
      const url = URL.createObjectURL(new Blob([report.html], { type: "text/html" }));
      if (win && !win.closed) win.location.href = url;
      else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `accountability-report-${report.reportId ?? startedAt}.html`;
        a.click();
      }
      pushSteps([{ id: `report-${startedAt}`, tool: "generate_accountability_report", status: "done", startedAt, durationMs: Date.now() - startedAt, recordCount: d.all311.totalComplaints, datasetId: "erm2-nwe9", filters: { area: b.streetName, "council district": d.councilDistrict } }]);
      setCaption(`Accountability report ready for Council District ${d.councilDistrict}. ${win && !win.closed ? "It opened in a new tab." : "It was downloaded."}`);
    } catch (err) {
      win?.close();
      setCaption(`I couldn't build the report: ${err instanceof Error ? err.message : "unknown error"}.`);
    } finally {
      setExporting(false);
    }
  };

  const idx = block?.routeIndex ?? -1;

  return (
    <main className="stage">
      <Map3DCanvas route={plan.blocks} activeBlock={block} onReady={(m) => (map.current = m)} />

      <section className="hud" aria-label="Walk position">
        <p className="kicker">{block ? (idx < 0 ? "Off route · exploring" : `Block ${Math.min(idx + 1, plan.blocks.length)} of ${plan.blocks.length}`) : "Walk Mode"}</p>
        <h1>{block?.streetName ?? "Walk any NYC block"}</h1>
        <p className="between">{block ? `${block.fromCrossStreet} → ${block.toCrossStreet}` : plan.label}</p>
        <ol className="progress" aria-hidden="true">
          {plan.blocks.map((b, i) => (
            <li key={b.blockId} className={i === idx ? "here" : i < idx ? "done" : ""} />
          ))}
        </ol>
        <form
          className="route"
          onSubmit={(e) => {
            e.preventDefault();
            start(from, to);
          }}
        >
          <label htmlFor="from" className="sr-only">From</label>
          <input id="from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From: address, place, or corner" autoComplete="off" />
          <label htmlFor="to" className="sr-only">To</label>
          <input id="to" value={to} onChange={(e) => setTo(e.target.value)} placeholder='To: e.g. "Myrtle Ave and Wyckoff Ave"' autoComplete="off" />
          <button type="submit" className="primary" disabled={loading || !from.trim()}>{loading ? "Finding…" : "Walk"}</button>
        </form>
      </section>


      {block && (
        <aside className="datacard" aria-label="Block details">
          <div className="tabs" role="tablist" aria-label="Panels">
            {([["block", "This block"], ["lens", "Accountability"], ["glass", "Glass Box"]] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} id={`tab-${id}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {!data && !dataErr && tab !== "glass" && <p className="muted">Loading NYC Open Data…</p>}
          {dataErr && tab !== "glass" && <p className="muted">{dataErr}</p>}

          {tab === "block" && data && (
            <div role="tabpanel" id="panel-block" aria-labelledby="tab-block">
              <h2>This block · last 30 days</h2>
              <div className="stats">
                <div><b>{data.noise.totalComplaints}</b><span>noise complaints</span></div>
                <div><b>{data.noise.openComplaints}</b><span>noise still open</span></div>
                <div><b>{data.all311.totalComplaints}</b><span>all 311 complaints</span></div>
                <div><b>{data.all311.openComplaints}</b><span>all still open</span></div>
              </div>
              {data.noise.topDescriptors.length > 0 && (
                <p className="muted">Top noise: {data.noise.topDescriptors.map((t) => `${t.descriptor} (${t.count})`).join(", ")}</p>
              )}
              <h2>Corner ahead: {block.toCrossStreet}</h2>
              <div className="stats">
                <div><b>{data.crashes.totalCrashes}</b><span>crashes, last year of data</span></div>
                <div><b>{data.crashes.pedestrianInjuries}</b><span>pedestrians injured</span></div>
                <div><b>{data.crashes.cyclistInjuries}</b><span>cyclists injured</span></div>
                <div><b>{data.crashes.fatalities}</b><span>killed</span></div>
              </div>
              <p className="lag">{data.crashes.lagDisclosureNotice}</p>
              <p className="muted small">Ask in the box below: "how many are still open?", "closed with no action?", "¿cuántos choques?" Press G for the Glass Box.</p>
            </div>
          )}

          {tab === "lens" && data && (
            <div role="tabpanel" id="panel-lens" aria-labelledby="tab-lens">
              <AccountabilityCard areaLabel={`${block.streetName}, ${block.fromCrossStreet} to ${block.toCrossStreet}`} timeWindowDays={30} data={data.all311} />
              <p className="muted small">
                {data.councilDistrict ? `City Council District ${data.councilDistrict}.` : "Council district unknown for this block."}
              </p>
              <button className="primary wide" disabled={exporting || !data.councilDistrict} onClick={() => exportReport(block, data)}>
                {exporting ? "Building report…" : "Export council report"}
              </button>
            </div>
          )}

          {tab === "glass" && (
            <div role="tabpanel" id="panel-glass" aria-labelledby="tab-glass">
              <GlassBoxPanel steps={steps} crashDataThroughDate={data?.crashes.dataThroughDate} />
            </div>
          )}
        </aside>
      )}

      <section className="dock" aria-label="Walk controls">
        <p className="caption" aria-live="polite">{caption}</p>
        <div className="controls">
          <button onClick={() => move("prev_block")} disabled={!block} aria-keyshortcuts="ArrowDown">◀ Back</button>
          {!block && <button className="primary" onClick={() => start()}>Start walk</button>}
          <button className={block ? "primary" : ""} onClick={() => move("next_block")} aria-keyshortcuts="ArrowUp">Next block ▶</button>
          <form onSubmit={submit}>
            <label htmlFor="cmd" className="sr-only">Walk command</label>
            <input id="cmd" value={input} onChange={(e) => setInput(e.target.value)} placeholder='Ask or command: "how many still open?", "turn left"' autoComplete="off" />
            <button type="submit">Go</button>
          </form>
        </div>
      </section>
    </main>
  );
}
