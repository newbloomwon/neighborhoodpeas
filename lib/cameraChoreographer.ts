// Person A — camera choreography for Walk Mode.
// drop: city view → first-person street level; glide: forward one block; turn: rotate 90° at a corner.
import type { Map as MapLibreMap } from "maplibre-gl";
import type { BlockContext } from "./streetGraph";

export const NYC_OVERVIEW = { center: [-73.94, 40.7] as [number, number], zoom: 10.2, pitch: 45, bearing: -20 };

const STREET = { zoom: 18.4, pitch: 72 };

/** Point a fraction of the way along the block (camera looks down the street from here). */
function along(block: BlockContext, t: number): [number, number] {
  return [block.from.lon + (block.to.lon - block.from.lon) * t, block.from.lat + (block.to.lat - block.from.lat) * t];
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export interface ChoreoOptions {
  reducedMotion?: boolean;
}

/** "Walk me from my place to my kid's school" — sweep from the city down to the first block. */
export function dropToStreet(map: MapLibreMap, block: BlockContext, opts: ChoreoOptions = {}): Promise<void> {
  const target = { center: along(block, 0.15), bearing: block.heading, ...STREET };
  if (opts.reducedMotion) {
    map.jumpTo(target);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    map.once("moveend", () => resolve());
    map.flyTo({ ...target, speed: 0.9, curve: 1.6, essential: true });
  });
}

/** "Next block" — glide forward along the street, keeping heading. */
export function glideTo(map: MapLibreMap, block: BlockContext, opts: ChoreoOptions = {}): Promise<void> {
  const target = { center: along(block, 0.15), bearing: block.heading, ...STREET };
  if (opts.reducedMotion) {
    map.jumpTo(target);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    map.once("moveend", () => resolve());
    map.easeTo({ ...target, duration: 1400, easing: (t) => t * (2 - t), essential: true });
  });
}

/** "Turn left on Myrtle" — move to the corner, then rotate onto the new street. */
export async function turnOnto(map: MapLibreMap, block: BlockContext, opts: ChoreoOptions = {}): Promise<void> {
  if (opts.reducedMotion) {
    map.jumpTo({ center: along(block, 0.15), bearing: block.heading, ...STREET });
    return;
  }
  await new Promise<void>((resolve) => {
    map.once("moveend", () => resolve());
    map.easeTo({ center: [block.from.lon, block.from.lat], duration: 600, essential: true });
  });
  await new Promise<void>((resolve) => {
    map.once("moveend", () => resolve());
    map.easeTo({ bearing: block.heading, duration: 900, essential: true });
  });
  return glideTo(map, block, opts);
}

export function backToCity(map: MapLibreMap, opts: ChoreoOptions = {}): void {
  if (opts.reducedMotion) map.jumpTo(NYC_OVERVIEW);
  else map.flyTo({ ...NYC_OVERVIEW, speed: 1.2, essential: true });
}
