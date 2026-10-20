"use client";
// Walk Mode shell (Person A). Other parts plug in through:
//   window "peas:block"  CustomEvent<BlockContext>   — fired on every block change (B/C/D/E listen)
//   window "peas:walk"   CustomEvent<{direction, crossStreet?}> — D (voice) and F (keys) can dispatch to move
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Map as MapLibreMap } from "maplibre-gl";
import { planWalk, StreetWalker, type BlockContext, type WalkDirection } from "@/lib/streetGraph";
import { dropToStreet, glideTo, turnOnto, prefersReducedMotion } from "@/lib/cameraChoreographer";

const Map3DCanvas = dynamic(() => import("@/components/Map3DCanvas"), { ssr: false });

/** Minimal walk-intent parser until Person D's voice router lands. */
function parseWalkIntent(text: string): { direction: WalkDirection; crossStreet?: string } | { start: { origin: string; destination: string } } | null {
  const t = text.toLowerCase().trim();
  const walk = t.match(/(?:walk|start|ll[eé]vame|camina)(?: me)?(?: (?:from|on|desde|en))? (.+?)(?: (?:to|hasta|a) (.+))?$/);
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
  const [caption, setCaption] = useState("Press Start or the Up arrow to walk Knickerbocker Avenue across Myrtle.");
  const [input, setInput] = useState("");
  const walker = useRef<StreetWalker | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const busy = useRef(false);

  const announce = useCallback((b: BlockContext) => {
    setBlock(b);
    setCaption(`You're on ${b.streetName}, between ${b.fromCrossStreet} and ${b.toCrossStreet}. Next corner: ${b.toCrossStreet}.`);
    window.dispatchEvent(new CustomEvent("peas:block", { detail: b }));
  }, []);

  const start = useCallback(
    async (origin = "", destination = "") => {
      if (!map.current) return;
      const p = planWalk(origin, destination);
      setPlan(p);
      walker.current = new StreetWalker(p);
      const b = walker.current.current();
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
    if (!intent) return setCaption(`Try "next block", "go back", "turn left on Myrtle", or "walk me from Stockholm to Menahan".`);
    if ("start" in intent) start(intent.start.origin, intent.start.destination);
    else move(intent.direction, intent.crossStreet);
  };

  const idx = block?.routeIndex ?? -1;

  return (
    <main className="stage">
      <Map3DCanvas route={plan.blocks} activeBlock={block} onReady={(m) => (map.current = m)} />

      <section className="hud" aria-label="Walk position">
        <p className="kicker">{block ? `Block ${Math.min(idx + 1, plan.blocks.length)} of ${plan.blocks.length}` : "Walk Mode"}</p>
        <h1>{block?.streetName ?? "Knickerbocker Avenue"}</h1>
        <p className="between">{block ? `${block.fromCrossStreet} → ${block.toCrossStreet}` : plan.label}</p>
        <ol className="progress" aria-hidden="true">
          {plan.blocks.map((b, i) => (
            <li key={b.blockId} className={i === idx ? "here" : i < idx ? "done" : ""} />
          ))}
        </ol>
      </section>

      <section className="dock" aria-label="Walk controls">
        <p className="caption" aria-live="polite">{caption}</p>
        <div className="controls">
          <button onClick={() => move("prev_block")} disabled={!block} aria-keyshortcuts="ArrowDown">◀ Back</button>
          {!block && <button className="primary" onClick={() => start()}>Start walk</button>}
          <button className={block ? "primary" : ""} onClick={() => move("next_block")} aria-keyshortcuts="ArrowUp">Next block ▶</button>
          <form onSubmit={submit}>
            <label htmlFor="cmd" className="sr-only">Walk command</label>
            <input id="cmd" value={input} onChange={(e) => setInput(e.target.value)} placeholder='"turn left on Myrtle"' autoComplete="off" />
            <button type="submit">Go</button>
          </form>
        </div>
      </section>
    </main>
  );
}
