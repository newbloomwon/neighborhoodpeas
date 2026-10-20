// Person A — walk anywhere in NYC.
// Street graph is built from NYC's official street centerline (NYC Open Data inkn-q76z, "CSCL"),
// which is already split at every intersection, so each segment is one real block.
import { headingBetween, type BlockContext, type Borough, type WalkDirection } from "./streetGraph";

const CENTERLINE = "https://data.cityofnewyork.us/resource/inkn-q76z.json";
const BOROUGHS: Record<string, Borough> = { "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island" };
// Roadway types people can walk: street, bridge, boardwalk, path, step street, alley.
const WALKABLE_RW = ["1", "3", "5", "6", "7", "10"];
// Car-only pieces that still show up as "streets" in the centerline.
const NOT_WALKABLE = /\b(viaduct|connector|ramp|exit|entrance|expressway|expwy|hwy|highway|thruway|approach)\b/i;

type LonLat = [number, number];
interface Seg {
  id: number;
  name: string;
  coords: LonLat[];
  a: string; // node key at coords[0]
  b: string; // node key at coords[last]
  length: number;
  borough: Borough;
}
interface NetNode {
  key: string;
  lon: number;
  lat: number;
  segs: number[];
}
export interface Network {
  nodes: Map<string, NetNode>;
  segs: Seg[];
}
export interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

// ---------- names ----------

const SUFFIX: Record<string, string> = {
  AVE: "Avenue", AV: "Avenue", ST: "Street", PL: "Place", BLVD: "Boulevard", RD: "Road", DR: "Drive", PKWY: "Parkway",
  LN: "Lane", CT: "Court", TER: "Terrace", SQ: "Square", HWY: "Highway", EXPWY: "Expressway", BR: "Bridge", PLZ: "Plaza", CONC: "Concourse",
  E: "East", W: "West", N: "North", S: "South", BWAY: "Broadway", ST_: "Saint",
};
function ordinal(n: string) {
  const v = Number(n);
  const s = v % 100 >= 11 && v % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[v % 10] ?? "th";
  return `${n}${s}`;
}
export function prettyStreet(raw: string): string {
  const parts = raw.trim().split(/\s+/);
  return parts
    .map((p, i) => {
      if (/^\d+$/.test(p)) return ordinal(p);
      // "ST" at the start is "Saint" (St Nicholas Ave), elsewhere "Street"
      if (p === "ST" && i === 0 && parts.length > 2) return "Saint";
      if (SUFFIX[p]) return SUFFIX[p];
      return p.charAt(0) + p.slice(1).toLowerCase();
    })
    .join(" ");
}
// Street types are only abbreviated as the last word ("Court Street" → "COURT ST", not "CT ST"),
// directions only as the first word ("West 42nd St" → "W 42 ST", but "South Street" stays).
const TYPE_ABBR: Record<string, string> = {
  AVENUE: "AVE", AV: "AVE", STREET: "ST", PLACE: "PL", BOULEVARD: "BLVD", ROAD: "RD", DRIVE: "DR", PARKWAY: "PKWY",
  CONCOURSE: "CONC", EXPRESSWAY: "EXPWY", TERRACE: "TER", LANE: "LN", COURT: "CT", PLAZA: "PLZ",
};
const DIR_ABBR: Record<string, string> = { NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W" };
const normName = (s: string) => {
  const words = s
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(\d+)(ST|ND|RD|TH)\b/g, "$1")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  const last = words.length - 1;
  if (last > 0 && TYPE_ABBR[words[last]]) words[last] = TYPE_ABBR[words[last]];
  if (words.length > 2 && DIR_ABBR[words[0]]) words[0] = DIR_ABBR[words[0]];
  return words.map((w, i) => (w === "SAINT" && i < last ? "ST" : w)).join(" ");
};

// ---------- geometry ----------

function meters(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * 111320;
  const dLon = (b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}
const keyOf = (p: LonLat, level: string) => `${p[0].toFixed(6)},${p[1].toFixed(6)},${level}`;

export function bboxAround(points: { lat: number; lon: number }[], bufferM: number): BBox {
  const lat0 = points[0].lat;
  const dLat = bufferM / 111320;
  const dLon = bufferM / (111320 * Math.cos((lat0 * Math.PI) / 180));
  return {
    north: Math.max(...points.map((p) => p.lat)) + dLat,
    south: Math.min(...points.map((p) => p.lat)) - dLat,
    east: Math.max(...points.map((p) => p.lon)) + dLon,
    west: Math.min(...points.map((p) => p.lon)) - dLon,
  };
}
const toWKT = (b: BBox) => {
  const f = (n: number) => n.toFixed(6);
  return `POLYGON((${f(b.west)} ${f(b.south)}, ${f(b.east)} ${f(b.south)}, ${f(b.east)} ${f(b.north)}, ${f(b.west)} ${f(b.north)}, ${f(b.west)} ${f(b.south)}))`;
};

// ---------- loading ----------

interface CenterlineRow {
  the_geom?: { type: string; coordinates: LonLat[][] | LonLat[] };
  full_street_name?: string;
  stname_label?: string;
  boroughcode?: string;
  from_level_code?: string;
  to_level_code?: string;
  nonped?: string;
}

async function fetchCenterline(where: string, limit = 20000): Promise<CenterlineRow[]> {
  const params = new URLSearchParams({
    $select: "the_geom,full_street_name,stname_label,boroughcode,from_level_code,to_level_code,nonped",
    $where: where,
    $limit: String(limit),
  });
  const res = await fetch(`${CENTERLINE}?${params}`);
  if (!res.ok) throw new Error(`NYC street centerline lookup failed (${res.status})`);
  return res.json();
}

function rowCoords(r: CenterlineRow): LonLat[] | null {
  const g = r.the_geom;
  if (!g) return null;
  const c = g.type === "MultiLineString" ? (g.coordinates as LonLat[][]).flat() : (g.coordinates as LonLat[]);
  return c.length >= 2 ? c : null;
}

export async function loadNetwork(bbox: BBox): Promise<Network> {
  const rows = await fetchCenterline(
    `within_box(the_geom, ${bbox.north}, ${bbox.west}, ${bbox.south}, ${bbox.east}) AND rw_type in (${WALKABLE_RW.map((t) => `'${t}'`).join(",")}) AND (nonped IS NULL OR nonped != 'V')`,
  );
  const nodes = new Map<string, NetNode>();
  const segs: Seg[] = [];
  const node = (p: LonLat, level: string) => {
    const key = keyOf(p, level);
    let n = nodes.get(key);
    if (!n) nodes.set(key, (n = { key, lon: p[0], lat: p[1], segs: [] }));
    return n;
  };
  for (const r of rows) {
    const coords = rowCoords(r);
    const name = r.stname_label || r.full_street_name;
    if (!coords || !name || NOT_WALKABLE.test(name)) continue;
    let length = 0;
    for (let i = 1; i < coords.length; i++) length += meters(coords[i - 1], coords[i]);
    const a = node(coords[0], r.from_level_code ?? "");
    const b = node(coords[coords.length - 1], r.to_level_code ?? "");
    if (a === b) continue;
    const id = segs.length;
    segs.push({ id, name: prettyStreet(name), coords, a: a.key, b: b.key, length, borough: BOROUGHS[r.boroughcode ?? ""] ?? "Brooklyn" });
    a.segs.push(id);
    b.segs.push(id);
  }
  if (!segs.length) throw new Error("No mapped streets found there.");
  return { nodes, segs };
}

// ---------- geocoding ----------

export interface Place {
  label: string;
  lat: number;
  lon: number;
  borough?: Borough;
  street?: string; // known street (for "X and Y" intersections)
}

const BORO_WORDS: [RegExp, string][] = [
  [/\bmanhattan\b/i, "1"],
  [/\bbronx\b/i, "2"],
  [/\bbrooklyn\b/i, "3"],
  [/\bqueens\b/i, "4"],
  [/\bstaten island\b/i, "5"],
];

/** "Knickerbocker Ave and Myrtle Ave" → the shared corner, straight from the city's centerline. */
// Manhattan avenues the city stores under their official names.
const ALIAS_PAIRS: [string, string][] = [
  ["6 AVE", "AVE OF THE AMERICAS"],
  ["AVENUE OF THE AMERICAS", "AVE OF THE AMERICAS"],
  ["7 AVE", "ADAM CLAYTON POWELL JR BLVD"],
  ["8 AVE", "FREDERICK DOUGLASS BLVD"],
  ["MALCOLM X BLVD", "LENOX AVE"],
];
const ALIASES: Record<string, string[]> = {};
for (const [x, y] of ALIAS_PAIRS) {
  (ALIASES[x] ??= []).push(y);
  (ALIASES[y] ??= []).push(x);
}

async function geocodeIntersection(a: string, b: string, near?: { lat: number; lon: number }): Promise<Place | null> {
  // A borough only counts at the end ("…, Queens"), so "Queens Blvd" stays a street name.
  const TRAIL = /(?:,|\s)+(?:in\s+)?(manhattan|the bronx|bronx|brooklyn|queens|staten island|ny|nyc|new york)\s*(?:,?\s*(?:ny|nyc|new york))?\s*$/i;
  const boroWord = (b.match(TRAIL) ?? a.match(TRAIL))?.[1] ?? "";
  const boro = BORO_WORDS.find(([re]) => re.test(boroWord))?.[1];
  const clean = (s: string) => normName(s.replace(TRAIL, ""));
  const na = clean(a);
  const nb = clean(b);
  if (!na || !nb) return null;
  // Whole street names only ("1 AVE" must not match "91 AVE"), optionally with a direction prefix ("W 42 ST").
  // "Dekalb" with no Street/Ave: try the common street types too.
  const TYPES = new Set(Object.values(TYPE_ABBR).concat(["BROADWAY", "BOWERY", "CONC", "EXPY", "HWY", "SQ", "LOOP", "WAY", "WALK", "ROW", "SLIP", "OVAL", "CIR"]));
  const withTypes = (n: string) => {
    const last = n.split(" ").pop()!;
    return TYPES.has(last) || ALIASES[n] ? [n] : [n, ...["AVE", "ST", "BLVD", "PL", "RD", "PKWY", "DR"].map((t) => `${n} ${t}`)];
  };
  const variants = (n: string) =>
    [...new Set([n, ...(ALIASES[n] ?? [])].flatMap(withTypes))].flatMap((m) => [m, `E ${m}`, `W ${m}`, `N ${m}`, `S ${m}`]);
  const q = (n: string) =>
    // stname_label is single-spaced ("E 59 ST"); full_street_name has a double space after the direction.
    `upper(stname_label) in (${variants(n).map((v) => `'${v.replace(/'/g, "''")}'`).join(",")})${boro ? ` AND boroughcode='${boro}'` : ""}`;
  const [ra, rb] = await Promise.all([fetchCenterline(q(na), 5000), fetchCenterline(q(nb), 5000)]);
  // Exact name beats a direction-prefixed one, so "Broadway" isn't read as "East Broadway".
  // For numbered streets the prefix is just Manhattan/Bronx style ("W 42 ST"), so it still counts as exact.
  const score = (name: string, n: string) => {
    const nn = normName(name);
    return nn === n || nn.startsWith(`${n} `) || ALIASES[n]?.includes(nn) || /^\d/.test(n) ? 2 : 1;
  };
  const ends = (rows: CenterlineRow[], n: string) => {
    const m = new Map<string, { p: LonLat; boro?: string; name: string; score: number }>();
    for (const r of rows) {
      const c = rowCoords(r);
      const name = r.stname_label ?? r.full_street_name ?? "";
      if (!c) continue;
      for (const p of [c[0], c[c.length - 1]]) {
        const k = keyOf(p, "");
        const prev = m.get(k);
        const sc = score(name, n);
        if (!prev || sc > prev.score) m.set(k, { p, boro: r.boroughcode, name, score: sc });
      }
    }
    return m;
  };
  const ea = ends(ra, na);
  const eb = ends(rb, nb);
  let shared = [...ea.entries()].filter(([k]) => eb.has(k)).map(([k, v]) => ({ ...v, other: eb.get(k)!, total: v.score + eb.get(k)!.score }));
  if (!shared.length) {
    // Divided roads (Queens Blvd) don't share an exact node with cross streets: take ends within 40 m.
    const bs = [...eb.values()];
    shared = [...ea.values()].flatMap((v) => {
      let best: (typeof bs)[number] | null = null;
      let d = 40;
      for (const o of bs) {
        const m = meters(v.p, o.p);
        if (m < d) [best, d] = [o, m];
      }
      return best ? [{ ...v, other: best, total: v.score + best.score }] : [];
    });
  }
  if (!shared.length) return null;
  // Same corner in several boroughs (42nd St & 8th Ave is in Manhattan and Brooklyn): closest to the
  // other end of the walk if we know it, else Manhattan first, unless a borough was named.
  const boroRank = (b?: string) => ["1", "3", "4", "2", "5"].indexOf(b ?? "");
  shared.sort(
    (x, y) =>
      y.total - x.total ||
      (near ? meters(x.p, [near.lon, near.lat]) - meters(y.p, [near.lon, near.lat]) : boroRank(x.boro) - boroRank(y.boro)),
  );
  const s = shared[0];
  return {
    label: `${prettyStreet(s.name)} & ${prettyStreet(s.other.name)}`,
    lat: s.p[1],
    lon: s.p[0],
    borough: BOROUGHS[s.boro ?? ""],
    street: prettyStreet(s.name),
  };
}

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n, x) => n + x.toLowerCase());

async function geosearch(text: string): Promise<Place | null> {
  const res = await fetch(`https://geosearch.planninglabs.nyc/v2/search?${new URLSearchParams({ text, size: "1" })}`);
  if (!res.ok) return null;
  const f = (await res.json()).features?.[0];
  if (!f) return null;
  const [lon, lat] = f.geometry.coordinates;
  const label = (f.properties.name ?? f.properties.label ?? text).replace(/, USA$/, "");
  return { label: label === label.toUpperCase() ? titleCase(label) : label, lat, lon, borough: f.properties.borough };
}

async function nominatim(text: string): Promise<Place | null> {
  const params = new URLSearchParams({ q: text, format: "json", limit: "1", viewbox: "-74.26,40.92,-73.69,40.49", bounded: "1" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!res.ok) return null;
  const r = (await res.json())[0];
  return r ? { label: r.display_name.split(",").slice(0, 2).join(","), lat: Number(r.lat), lon: Number(r.lon) } : null;
}

export async function geocode(text: string, near?: { lat: number; lon: number }): Promise<Place | null> {
  // People type "to 43rd St and 8th Ave" in the To box; drop the leading from/to (and Spanish desde/hasta/a).
  const t = text.trim().replace(/^(?:from|to|desde|hasta|a|de)(?:\s*:\s*|\s+)(?:the\s+|la\s+|el\s+)?/i, "").trim();
  if (!t) return null;
  // "43rd St and 8th Ave", or with no "and" at all: "43rd street 8th avenue".
  const TYPE = "(?:street|st|avenue|ave|av|boulevard|blvd|road|rd|place|pl|drive|dr|parkway|pkwy|lane|ln|court|ct|terrace|ter|concourse|broadway)";
  const corner =
    t.match(/^(.+?)\s+(?:and|&|at|@|y|con|\/)\s+(.+)$/i) ??
    t.match(new RegExp(`^(.*?\\b${TYPE}\\.?),?\\s+(.+\\b${TYPE}\\b.*)$`, "i"));
  // "350 5th Ave" / "35-20 Broadway" start with a house number; "42nd St and 8th Ave" is a corner.
  if (corner && !/^\d+(-\d+)?\s/.test(t)) {
    const hit = await geocodeIntersection(corner[1], corner[2], near).catch(() => null);
    if (hit) return hit;
  }
  return (await geosearch(t).catch(() => null)) ?? (await nominatim(t).catch(() => null));
}

// ---------- routing ----------

/** Nearest real intersection (3+ blocks meet, or two different streets) so walks start at a corner. */
function nearestNode(net: Network, lat: number, lon: number, street?: string): NetNode {
  let best: NetNode | null = null;
  let bestD = Infinity;
  for (const n of net.nodes.values()) {
    if (street && !n.segs.some((s) => net.segs[s].name === street)) continue;
    const corner = n.segs.length >= 3 || new Set(n.segs.map((s) => baseName(net.segs[s].name))).size > 1;
    // Mid-block points only win if they're much closer than any corner.
    const d = meters([n.lon, n.lat], [lon, lat]) + (corner ? 0 : 120);
    if (d < bestD) [best, bestD] = [n, d];
  }
  if (!best && street) return nearestNode(net, lat, lon);
  return best!;
}

const otherEnd = (s: Seg, key: string) => (s.a === key ? s.b : s.a);

/** Dijkstra over block segments; returns ordered segment ids with walk direction. */
function shortestPath(net: Network, from: string, to: string): { seg: number; fromKey: string }[] | null {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { seg: number; fromKey: string }>();
  const heap: [number, string][] = [[0, from]];
  const done = new Set<string>();
  while (heap.length) {
    // small binary heap
    const [d, k] = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    if (done.has(k)) continue;
    done.add(k);
    if (k === to) break;
    for (const sid of net.nodes.get(k)!.segs) {
      const s = net.segs[sid];
      const nk = otherEnd(s, k);
      const nd = d + s.length;
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, { seg: sid, fromKey: k });
        heap.push([nd, nk]);
        for (let i = heap.length - 1; i > 0; ) {
          const p = (i - 1) >> 1;
          if (heap[p][0] <= heap[i][0]) break;
          [heap[i], heap[p]] = [heap[p], heap[i]];
          i = p;
        }
      }
    }
  }
  if (!prev.has(to) && from !== to) return null;
  const out: { seg: number; fromKey: string }[] = [];
  for (let k = to; k !== from; ) {
    const p = prev.get(k)!;
    out.unshift(p);
    k = p.fromKey;
  }
  return out;
}

// ---------- blocks ----------

interface Hop {
  segs: number[];
  fromKey: string;
  toKey: string;
  name: string;
  path: LonLat[];
}

function directed(s: Seg, fromKey: string): LonLat[] {
  return s.a === fromKey ? s.coords : [...s.coords].reverse();
}

/** Walk one segment, then keep going through "pseudo" nodes (no real cross street) on the same street. */
function hopFrom(net: Network, fromKey: string, segId: number): Hop {
  const segs = [segId];
  let s = net.segs[segId];
  let path = directed(s, fromKey);
  let key = otherEnd(s, fromKey);
  for (let guard = 0; guard < 20; guard++) {
    const n = net.nodes.get(key)!;
    const others = n.segs.filter((x) => x !== s.id);
    if (others.length !== 1 || net.segs[others[0]].name !== s.name) break;
    s = net.segs[others[0]];
    segs.push(s.id);
    path = path.concat(directed(s, key).slice(1));
    key = otherEnd(s, key);
  }
  return { segs, fromKey, toKey: key, name: net.segs[segId].name, path };
}

// "West 34th Street" and "East 34th Street" are the same street for "between X and Y".
const baseName = (n: string) => n.replace(/^(East|West|North|South) /, "");

function crossName(net: Network, key: string, street: string, fallback?: string): string {
  const names = [...new Set(net.nodes.get(key)!.segs.map((s) => net.segs[s].name))].filter((n) => baseName(n) !== baseName(street));
  return names[0] ?? fallback ?? "the end of the block";
}

function hopHeading(h: Hop): number {
  const a = h.path[0];
  const b = h.path[Math.min(h.path.length - 1, Math.max(1, Math.floor(h.path.length / 2)))] ?? h.path[h.path.length - 1];
  const end = h.path[h.path.length - 1];
  return headingBetween({ lon: a[0], lat: a[1] }, { lon: (b[0] + end[0]) / 2, lat: (b[1] + end[1]) / 2 });
}

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

function toBlock(net: Network, h: Hop, routeIndex: number, routeLength: number, prevStreetName?: string): BlockContext {
  const first = h.path[0];
  const last = h.path[h.path.length - 1];
  const bbox = bboxAround(h.path.map(([lon, lat]) => ({ lon, lat })), 30);
  const fromCross = crossName(net, h.fromKey, h.name, prevStreetName);
  const toCross = crossName(net, h.toKey, h.name);
  return {
    blockId: `cscl-${h.segs.join("-")}-${h.fromKey === net.segs[h.segs[0]].a ? "f" : "r"}`,
    streetName: h.name,
    fromCrossStreet: fromCross,
    toCrossStreet: toCross,
    from: { name: fromCross, lon: first[0], lat: first[1] },
    to: { name: toCross, lon: last[0], lat: last[1] },
    heading: hopHeading(h),
    borough: net.segs[h.segs[0]].borough,
    councilDistrict: 0,
    communityBoard: "",
    boundingBoxWKT: toWKT(bbox),
    bbox,
    upcomingIntersection: { name: `${h.name} & ${toCross}`, lat: last[1], lon: last[0] },
    nextBlockId: null,
    prevBlockId: null,
    routeIndex,
    routeLength,
    path: h.path,
  };
}

// ---------- walker ----------

export interface NetworkPlan {
  label: string;
  blocks: BlockContext[];
}

export class NetworkWalker {
  plan: NetworkPlan;
  private net: Network;
  private hops: Hop[]; // the planned route
  private trail: Hop[] = []; // where the user has actually walked
  private onRoute = true;

  constructor(net: Network, hops: Hop[], label: string) {
    this.net = net;
    this.hops = hops;
    this.trail = [hops[0]];
    this.plan = { label, blocks: hops.map((h, i) => this.block(h, i)) };
    this.plan.blocks.forEach((b, i, all) => {
      b.nextBlockId = all[i + 1]?.blockId ?? null;
      b.prevBlockId = all[i - 1]?.blockId ?? null;
    });
  }

  private block(h: Hop, i: number) {
    return toBlock(this.net, h, i, this.hops.length);
  }

  current(): BlockContext {
    const i = this.trail.length - 1;
    const b = this.block(this.trail[i], this.onRoute ? i : this.hops.length);
    const nxt = this.nextHop();
    b.nextBlockId = nxt ? this.block(nxt, i + 1).blockId : null;
    b.prevBlockId = i > 0 ? this.block(this.trail[i - 1], i - 1).blockId : null;
    if (!this.onRoute) b.routeIndex = -1;
    return b;
  }

  private here() {
    return this.trail[this.trail.length - 1];
  }

  /** Straight ahead: the planned route, else the same street, else the road with the smallest bend. */
  private nextHop(): Hop | null {
    const i = this.trail.length - 1;
    if (this.onRoute && i + 1 < this.hops.length) return this.hops[i + 1];
    const h = this.here();
    const heading = hopHeading(h);
    const cands = this.net.nodes
      .get(h.toKey)!
      .segs.filter((s) => s !== h.segs[h.segs.length - 1])
      .map((s) => hopFrom(this.net, h.toKey, s))
      .map((c) => ({ c, d: angleDiff(hopHeading(c), heading) + (c.name === h.name ? 0 : 25) }))
      .filter((x) => x.d < 70)
      .sort((x, y) => x.d - y.d);
    return cands[0]?.c ?? null;
  }

  peek(direction: "next_block" | "prev_block" = "next_block"): BlockContext | null {
    if (direction === "prev_block") return this.trail.length > 1 ? this.block(this.trail[this.trail.length - 2], this.trail.length - 2) : null;
    const n = this.nextHop();
    return n ? this.block(n, this.trail.length) : null;
  }

  move(direction: WalkDirection, crossStreet?: string): { ok: true; block: BlockContext } | { ok: false; reason: string } {
    if (direction === "prev_block") {
      if (this.trail.length < 2) return { ok: false, reason: "You're at the start of the walk." };
      this.trail.pop();
      if (this.trail.length <= this.hops.length && this.trail.every((h, i) => h === this.hops[i])) this.onRoute = true;
      return { ok: true, block: this.current() };
    }
    if (direction === "next_block") {
      const n = this.nextHop();
      if (!n) return { ok: false, reason: `${this.here().name} ends at ${crossName(this.net, this.here().toKey, this.here().name)}. Turn left or right.` };
      const i = this.trail.length;
      if (this.onRoute && i >= this.hops.length) this.onRoute = false;
      this.trail.push(n);
      return { ok: true, block: this.current() };
    }
    // Turn at the corner you're walking toward.
    const h = this.here();
    const want = (hopHeading(h) + (direction === "turn_left" ? 270 : 90)) % 360;
    const q = crossStreet ? normName(crossStreet) : "";
    const cands = this.net.nodes
      .get(h.toKey)!
      .segs.filter((s) => s !== h.segs[h.segs.length - 1])
      .map((s) => hopFrom(this.net, h.toKey, s))
      .filter((c) => !q || normName(c.name).includes(q) || q.includes(normName(c.name)))
      .map((c) => ({ c, d: angleDiff(hopHeading(c), want) }))
      .filter((x) => x.d < 65)
      .sort((x, y) => x.d - y.d);
    if (!cands.length) {
      const corner = crossName(this.net, h.toKey, h.name);
      return { ok: false, reason: crossStreet ? `I can't turn onto ${crossStreet} at ${corner}.` : `There's no street to the ${direction === "turn_left" ? "left" : "right"} at ${corner}.` };
    }
    const i = this.trail.length;
    // Prefer the planned hop object if it's the same block, so we stay "on route".
    const planned = this.hops[i];
    const chosen = planned && planned.segs[0] === cands[0].c.segs[0] && planned.fromKey === cands[0].c.fromKey ? planned : cands[0].c;
    this.onRoute = chosen === planned && this.trail.every((t, j) => t === this.hops[j]);
    this.trail.push(chosen);
    return { ok: true, block: this.current() };
  }
}

/** Address/place/intersection → walkable route of real NYC blocks. */
export async function planRoute(originText: string, destinationText: string): Promise<{ walker: NetworkWalker; origin: Place; destination: Place | null }> {
  const origin = await geocode(originText);
  if (!origin) throw new Error(`I couldn't find "${originText}" in New York City.`);
  const destination = destinationText ? await geocode(destinationText, origin) : null;
  if (destinationText && !destination) throw new Error(`I couldn't find "${destinationText}" in New York City.`);
  const pts = destination ? [origin, destination] : [origin];
  if (destination && meters([origin.lon, origin.lat], [destination.lon, destination.lat]) > 5000)
    throw new Error("That's more than 5 kilometers. Try a shorter walk.");
  const net = await loadNetwork(bboxAround(pts, destination ? 350 : 600));
  const start = nearestNode(net, origin.lat, origin.lon, origin.street);
  let hops: Hop[];
  if (destination) {
    const end = nearestNode(net, destination.lat, destination.lon);
    const path = shortestPath(net, start.key, end.key);
    if (!path || !path.length) throw new Error("I couldn't find a walking route between those places.");
    hops = [];
    for (let i = 0; i < path.length; ) {
      const hop = hopFrom(net, path[i].fromKey, path[i].seg);
      // Only absorb segments the route actually uses.
      const used = hop.segs.filter((s, j) => path[i + j]?.seg === s).length;
      if (used === hop.segs.length) {
        hops.push(hop);
        i += used;
      } else {
        const s = net.segs[path[i].seg];
        hops.push({ segs: [s.id], fromKey: path[i].fromKey, toKey: otherEnd(s, path[i].fromKey), name: s.name, path: directed(s, path[i].fromKey) });
        i += 1;
      }
    }
  } else {
    // No destination: start walking along the street at the origin.
    const sid = start.segs.find((s) => !origin.street || net.segs[s].name === origin.street) ?? start.segs[0];
    hops = [hopFrom(net, start.key, sid)];
  }
  const label = destination ? `${origin.label} → ${destination.label}` : origin.label;
  return { walker: new NetworkWalker(net, hops, label), origin, destination };
}
