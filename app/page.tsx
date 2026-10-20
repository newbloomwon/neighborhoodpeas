"use client";
// Walk Mode shell (Person A). Other parts plug in through:
//   window "peas:block"  CustomEvent<BlockContext>   — fired on every block change (B/C/D/E listen)
//   window "peas:walk"   CustomEvent<{direction, crossStreet?}> — D (voice) and F (keys) can dispatch to move
// Person F's accessibility layer (keys, screen-reader announcer, high-contrast captions) and
// Person D's bilingual push-to-talk + narration voice are wired in below.
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
import { AnnouncerProvider, ScreenReaderModeToggle, formatBlockTransition, useAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { CaptionHUD } from "@/components/CaptionHUD";
import { ShortcutHelp } from "@/components/ShortcutHelp";
import { useAccessibleControls } from "@/hooks/useAccessibleControls";
import { useBilingualVoice } from "@/hooks/useBilingualVoice";
import type { Lang } from "@/lib/a11yContracts";
import type { VoiceCommand, VoiceLocale } from "@/src/voice";

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

const INTRO = "Type where you are and where you want to go, or press Start for a demo walk down Knickerbocker Avenue. Press H for keyboard shortcuts.";
const toLocale = (l: Lang): VoiceLocale => (l === "es" ? "es-US" : "en-US");
const walkTo = (direction: WalkDirection, crossStreet?: string) =>
  window.dispatchEvent(new CustomEvent("peas:walk", { detail: { direction, crossStreet } }));

export default function Page() {
  return (
    <AnnouncerProvider>
      <WalkPage />
    </AnnouncerProvider>
  );
}

function WalkPage() {
  const [plan, setPlan] = useState(() => planWalk());
  const [block, setBlock] = useState<BlockContext | null>(null);
  const [caption, setCaptionText] = useState(INTRO);
  const [captionLang, setCaptionLang] = useState<Lang>("en");
  const [lang, setLang] = useState<Lang>("en");
  const langRef = useRef<Lang>("en");
  langRef.current = lang;
  /** Every caption carries its language so it is spoken (and marked up) in the right voice. */
  const setCaption = useCallback((text: string, l: Lang = langRef.current) => {
    setCaptionText(text);
    setCaptionLang(l);
  }, []);
  const [highContrast, setHighContrast] = useState(false);
  const [heard, setHeard] = useState("");
  const [narrationPaused, setNarrationPaused] = useState(false);
  const { announce: srAnnounce, ttsMuted } = useAnnouncer();
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
    const l = langRef.current;
    setBlock(b);
    setCaption(`${formatBlockTransition(b.streetName, b.fromCrossStreet, b.toCrossStreet, l)}. ${l === "es" ? "Consultando los datos abiertos de NYC…" : "Checking NYC Open Data…"}`);
    setData(null);
    setDataErr("");
    window.dispatchEvent(new CustomEvent("peas:block", { detail: b }));
    fetchBlockData(b)
      .then((d) => {
        if (walker.current?.current().blockId !== b.blockId) return;
        setData(d);
        // Person C's Walk Narrator writes the line; its fact gate checks every number.
        const n = narrateBlock(b, d, langRef.current);
        setCaption(n.text);
        pushSteps(blockSteps(b, d, n.trace, n.ms));
      })
      .catch(() => {
        setDataErr("Couldn't reach NYC Open Data right now.");
        setCaption(
          langRef.current === "es"
            ? `${formatBlockTransition(b.streetName, b.fromCrossStreet, b.toCrossStreet, "es")}. No pude conectar con los datos abiertos de NYC, así que no voy a adivinar cifras.`
            : `You're on ${b.streetName}, between ${b.fromCrossStreet} and ${b.toCrossStreet}. I couldn't reach NYC Open Data, so I won't guess any numbers.`,
        );
      });
    const next = walker.current?.peek("next_block");
    if (next) fetchBlockData(next).catch(() => {});
  }, [pushSteps, setCaption]);

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
          setCaption(err instanceof Error ? err.message : "I couldn't plan that walk.", "en");
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
    [announce, setCaption],
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
        setCaption(r.reason, "en");
        return;
      }
      announce(r.block);
      busy.current = true;
      const opts = { reducedMotion: prefersReducedMotion() };
      await (direction.startsWith("turn") ? turnOnto(map.current, r.block, opts) : glideTo(map.current, r.block, opts));
      busy.current = false;
    },
    [announce, start, setCaption],
  );

  useEffect(() => {
    const onWalk = (e: Event) => {
      const d = (e as CustomEvent<{ direction: WalkDirection; crossStreet?: string }>).detail;
      move(d.direction, d.crossStreet);
    };
    window.addEventListener("peas:walk", onWalk);
    return () => window.removeEventListener("peas:walk", onWalk);
  }, [move]);

  /** Typed or spoken text: a walk command, a "walk from … to …" request, or a question about this block. */
  const handleText = (text: string) => {
    const intent = parseWalkIntent(text);
    if (!intent) {
      // Not a walk command → a question for Person C's grounded Q&A.
      if (!text.trim()) return;
      if (!block || !data) return setCaption(lang === "es" ? "Empieza a caminar y luego pregunta sobre la cuadra donde estás." : "Start a walk first, then ask about the block you're on.");
      const a = askAboutBlock(text, block, data);
      setCaption(a.answer, a.language);
      pushSteps(a.steps);
      return;
    }
    if ("start" in intent) {
      setFrom(intent.start.origin);
      setTo(intent.start.destination);
      start(intent.start.origin, intent.start.destination);
    }
    else walkTo(intent.direction, intent.crossStreet);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    handleText(input);
    setInput("");
  };

  // Person D: push-to-talk voice commands become peas:walk events; anything else is a question for Person C.
  const onVoiceCommand = (c: VoiceCommand, locale: VoiceLocale) => {
    const l: Lang = locale === "es-US" ? "es" : "en";
    switch (c.type) {
      case "next-block": return walkTo("next_block");
      case "previous-block": return walkTo("prev_block");
      case "turn-left": return walkTo("turn_left", c.streetName);
      case "turn-right": return walkTo("turn_right", c.streetName);
      case "repeat-narration": return voice.speak(caption, toLocale(captionLang));
      case "pause-narration":
        setNarrationPaused(true);
        return voice.stopSpeaking();
      case "resume-narration":
        setNarrationPaused(false);
        return voice.speak(caption, toLocale(captionLang));
      case "start-walk": return void start(from, to);
      case "stop-walk":
        voice.stopSpeaking();
        return setCaption(l === "es" ? "Recorrido en pausa. Di «siguiente cuadra» o presiona la flecha arriba para seguir." : "Walk paused. Say \"next block\" or press Up to keep going.", l);
      case "unknown": return handleText(c.transcript);
    }
  };

  const voice = useBilingualVoice({
    locale: toLocale(lang),
    muted: ttsMuted,
    onCommand: onVoiceCommand,
    onTranscript: (t) => setHeard(t),
    onError: (msg) => {
      setCaption(`${lang === "es" ? "Voz" : "Voice"}: ${msg} ${lang === "es" ? "Puedes escribir o usar las flechas." : "You can type or use the arrow keys instead."}`, "en");
      srAnnounce(msg, "assertive");
    },
  });

  // Each new caption goes to screen readers (Person F's announcer) and, unless screen-reader mode
  // has muted the app voice, is read aloud by Person D's narrator — never both voices at once.
  const firstCaption = useRef(true);
  useEffect(() => {
    if (firstCaption.current) {
      firstCaption.current = false;
      return;
    }
    srAnnounce(caption);
    if (!narrationPaused && !voice.listening) voice.speak(caption, toLocale(captionLang));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption, captionLang]);

  // Switching language re-narrates the current block in that language.
  const switchLang = () => {
    const l: Lang = lang === "en" ? "es" : "en";
    setLang(l);
    langRef.current = l;
    if (block && data) setCaption(narrateBlock(block, data, l).text, l);
    else setCaption(l === "es" ? "Español activado. Mantén la barra espaciadora para hablar." : "English on. Hold Space to talk.", l);
  };

  useEffect(() => {
    if (window.matchMedia?.("(prefers-contrast: more)").matches) setHighContrast(true);
  }, []);

  const openGlassBox = () => {
    setTab("glass");
    setTimeout(() => document.getElementById("glass-box")?.focus(), 0);
  };

  const { helpOpen, shortcuts, talking } = useAccessibleControls({
    onWalk: (d) => move(d),
    onPushToTalkStart: () => voice.startListening(),
    onPushToTalkEnd: () => voice.stopListening(),
    onExportReport: () => {
      if (block && data?.councilDistrict && !exporting) exportReport(block, data);
      else setCaption("Walk to a block with a known council district to export a report.", "en");
    },
    onToggleGlassBox: openGlassBox,
    onEscape: () => {
      voice.stopSpeaking();
      if (document.activeElement?.closest(".datacard")) document.getElementById(`tab-${tab}`)?.focus();
    },
  });

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
      setCaption(`Accountability report ready for Council District ${d.councilDistrict}. ${win && !win.closed ? "It opened in a new tab." : "It was downloaded."}`, "en");
    } catch (err) {
      win?.close();
      setCaption(`I couldn't build the report: ${err instanceof Error ? err.message : "unknown error"}.`, "en");
    } finally {
      setExporting(false);
    }
  };

  const idx = block?.routeIndex ?? -1;

  return (
    <main className={highContrast ? "stage hc" : "stage"}>
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
        <div className="a11y-bar" aria-label="Accessibility and voice">
          <ScreenReaderModeToggle />
          <label>
            <input type="checkbox" checked={highContrast} onChange={(e) => setHighContrast(e.target.checked)} /> High contrast
          </label>
          <button type="button" onClick={switchLang} aria-label={lang === "en" ? "Cambiar a español" : "Switch to English"} lang={lang === "en" ? "es" : "en"}>
            {lang === "en" ? "Español" : "English"}
          </button>
        </div>
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
        {/* Screen readers get captions through the announcer, so the visible caption is not a live region. */}
        {highContrast
          ? <CaptionHUD inline text={caption} lang={captionLang} />
          : <p className="caption" lang={captionLang}>{caption}</p>}
        {heard && <p className="heard muted small">{lang === "es" ? "Oí" : "Heard"}: “{heard}”</p>}
        <div className="controls">
          <button onClick={() => move("prev_block")} disabled={!block} aria-keyshortcuts="ArrowDown">◀ Back</button>
          {!block && <button className="primary" onClick={() => start()}>Start walk</button>}
          <button className={block ? "primary" : ""} onClick={() => move("next_block")} aria-keyshortcuts="ArrowUp">Next block ▶</button>
          {voice.canListen && (
            <button
              type="button"
              className={talking || voice.listening ? "talking" : ""}
              aria-pressed={voice.listening}
              onClick={() => (voice.listening ? voice.stopListening() : voice.startListening())}
              aria-keyshortcuts="Space"
            >
              {voice.listening ? (lang === "es" ? "● Escuchando…" : "● Listening…") : (lang === "es" ? "🎙 Hablar" : "🎙 Talk")}
            </button>
          )}
          <form onSubmit={submit}>
            <label htmlFor="cmd" className="sr-only">Walk command</label>
            <input id="cmd" value={input} onChange={(e) => setInput(e.target.value)} placeholder='Ask or command: "how many still open?", "turn left"' autoComplete="off" />
            <button type="submit">Go</button>
          </form>
        </div>
      </section>

      {helpOpen && (
        <div className="shortcut-help">
          <ShortcutHelp open={helpOpen} shortcuts={shortcuts} />
        </div>
      )}
    </main>
  );
}
