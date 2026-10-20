// Person A — street graph: turns an origin/destination into an ordered sequence of
// blocks and intersections, and walks it one block at a time.
// Corner coordinates are real OpenStreetMap intersections (Overpass), not estimates.

export type Borough = "Brooklyn" | "Manhattan" | "Queens" | "Bronx" | "Staten Island";
export type WalkDirection = "next_block" | "prev_block" | "turn_left" | "turn_right";

export interface Corner {
  name: string; // cross-street name at this intersection
  lat: number;
  lon: number;
}

/** Contract handed to Person B (bbox queries) and Person C (narration). */
export interface BlockContext {
  blockId: string;
  streetName: string;
  fromCrossStreet: string;
  toCrossStreet: string;
  from: Corner;
  to: Corner;
  /** Compass heading of travel along this block, degrees 0–360. */
  heading: number;
  borough: Borough;
  councilDistrict: number;
  communityBoard: string;
  /** POLYGON((lon lat, ...)) around the block with a ~30 m buffer. */
  boundingBoxWKT: string;
  bbox: { north: number; south: number; east: number; west: number };
  /** The intersection you are walking toward (for Safe Route Scout crash lookups). */
  upcomingIntersection: { name: string; lat: number; lon: number };
  /** Adjacent block IDs so narration/data can pre-fetch. */
  nextBlockId: string | null;
  prevBlockId: string | null;
  /** Position in the planned route (0-based; -1 once you've wandered off it) and route length. */
  routeIndex: number;
  routeLength: number;
  /** Full block geometry [lon, lat][] when the street curves; otherwise from → to. */
  path?: [number, number][];
}

/** What the page drives: the demo corridor walker and the citywide network walker both fit. */
export interface Walker {
  plan: { label: string; blocks: BlockContext[] };
  current(): BlockContext;
  peek(direction?: "next_block" | "prev_block"): BlockContext | null;
  move(direction: WalkDirection, crossStreet?: string): { ok: true; block: BlockContext } | { ok: false; reason: string };
}

interface Corridor {
  street: string;
  borough: Borough;
  councilDistrict: number;
  communityBoard: string;
  corners: Corner[]; // ordered along the street
}

const KNICKERBOCKER: Corridor = {
  street: "Knickerbocker Avenue",
  borough: "Brooklyn",
  councilDistrict: 34,
  communityBoard: "Brooklyn CB 4",
  // Ordered northwest → southeast
  corners: [
    { name: "Flushing Avenue", lat: 40.704717, lon: -73.928738 },
    { name: "George Street", lat: 40.704526, lon: -73.928395 },
    { name: "Melrose Street", lat: 40.704092, lon: -73.927644 },
    { name: "Jefferson Street", lat: 40.703667, lon: -73.926891 },
    { name: "Troutman Street", lat: 40.703239, lon: -73.92614 },
    { name: "Starr Street", lat: 40.702813, lon: -73.925393 },
    { name: "Willoughby Avenue", lat: 40.702388, lon: -73.924636 },
    { name: "Suydam Street", lat: 40.70196, lon: -73.923879 },
    { name: "Hart Street", lat: 40.70153, lon: -73.923133 },
    { name: "DeKalb Avenue", lat: 40.701102, lon: -73.922384 },
    { name: "Stockholm Street", lat: 40.700675, lon: -73.921631 },
    { name: "Stanhope Street", lat: 40.700247, lon: -73.92088 },
    { name: "Himrod Street", lat: 40.69982, lon: -73.920127 },
    { name: "Harman Street", lat: 40.699392, lon: -73.919377 },
    { name: "Greene Avenue", lat: 40.698985, lon: -73.91861 },
    { name: "Myrtle Avenue", lat: 40.698817, lon: -73.918286 },
    { name: "Bleecker Street", lat: 40.698537, lon: -73.917872 },
    { name: "Menahan Street", lat: 40.69811, lon: -73.917118 },
    { name: "Grove Street", lat: 40.69768, lon: -73.916368 },
    { name: "Linden Street", lat: 40.697253, lon: -73.915616 },
    { name: "Gates Avenue", lat: 40.696826, lon: -73.914865 },
    { name: "Palmetto Street", lat: 40.696398, lon: -73.914114 },
    { name: "Woodbine Street", lat: 40.69597, lon: -73.913361 },
    { name: "Madison Street", lat: 40.695541, lon: -73.912608 },
    { name: "Putnam Avenue", lat: 40.695115, lon: -73.91186 },
    { name: "Cornelia Street", lat: 40.694687, lon: -73.911107 },
    { name: "Jefferson Avenue", lat: 40.694259, lon: -73.910357 },
    { name: "Hancock Street", lat: 40.693832, lon: -73.909605 },
    { name: "Weirfield Street", lat: 40.693405, lon: -73.908853 },
    { name: "Halsey Street", lat: 40.692976, lon: -73.908101 },
    { name: "Eldert Street", lat: 40.692549, lon: -73.907347 },
    { name: "Covert Street", lat: 40.69212, lon: -73.906599 },
    { name: "Schaefer Street", lat: 40.691692, lon: -73.905846 },
    { name: "Decatur Street", lat: 40.691265, lon: -73.905095 },
    { name: "Cooper Street", lat: 40.690836, lon: -73.904342 },
    { name: "Moffat Street", lat: 40.690409, lon: -73.903597 },
  ],
};

const MYRTLE: Corridor = {
  street: "Myrtle Avenue",
  borough: "Brooklyn",
  councilDistrict: 34,
  communityBoard: "Brooklyn CB 4",
  // Ordered west → east
  corners: [
    { name: "Willoughby Avenue", lat: 40.697423, lon: -73.931313 },
    { name: "Suydam Street", lat: 40.69759, lon: -73.929801 },
    { name: "Hart Street", lat: 40.69781, lon: -73.92783 },
    { name: "Cedar Street", lat: 40.69801, lon: -73.926033 },
    { name: "DeKalb Avenue", lat: 40.69808, lon: -73.925352 },
    { name: "Central Avenue", lat: 40.698101, lon: -73.925163 },
    { name: "Stockholm Street", lat: 40.698219, lon: -73.924043 },
    { name: "Stanhope Street", lat: 40.69835, lon: -73.922747 },
    { name: "Wilson Avenue", lat: 40.698452, lon: -73.921772 },
    { name: "Himrod Street", lat: 40.698483, lon: -73.921471 },
    { name: "Harman Street", lat: 40.698633, lon: -73.9201 },
    { name: "Greene Avenue", lat: 40.698762, lon: -73.918835 },
    { name: "Knickerbocker Avenue", lat: 40.698817, lon: -73.918286 },
    { name: "Bleecker Street", lat: 40.698898, lon: -73.917523 },
    { name: "Menahan Street", lat: 40.699032, lon: -73.916219 },
    { name: "Grove Street", lat: 40.699167, lon: -73.914922 },
    { name: "Irving Avenue", lat: 40.699189, lon: -73.914674 },
    { name: "Linden Street", lat: 40.699304, lon: -73.913602 },
    { name: "Gates Avenue", lat: 40.699444, lon: -73.912286 },
    { name: "Wyckoff Avenue", lat: 40.699567, lon: -73.911165 },
    { name: "Saint Nicholas Avenue", lat: 40.699841, lon: -73.908683 },
    { name: "Putnam Avenue", lat: 40.700027, lon: -73.907121 },
    { name: "Cypress Avenue", lat: 40.70013, lon: -73.90622 },
  ],
};

export const CORRIDORS: Corridor[] = [KNICKERBOCKER, MYRTLE];

// ---------- geometry helpers ----------

export function headingBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const y = b.lon - a.lon;
  const x = (b.lat - a.lat) / Math.cos((a.lat * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function boxAround(a: Corner, b: Corner, bufferM = 30) {
  const dLat = bufferM / 111320;
  const dLon = bufferM / (111320 * Math.cos((a.lat * Math.PI) / 180));
  return {
    north: Math.max(a.lat, b.lat) + dLat,
    south: Math.min(a.lat, b.lat) - dLat,
    west: Math.min(a.lon, b.lon) - dLon,
    east: Math.max(a.lon, b.lon) + dLon,
  };
}

function toWKT(b: { north: number; south: number; east: number; west: number }): string {
  const f = (n: number) => n.toFixed(6);
  return `POLYGON((${f(b.west)} ${f(b.south)}, ${f(b.east)} ${f(b.south)}, ${f(b.east)} ${f(b.north)}, ${f(b.west)} ${f(b.north)}, ${f(b.west)} ${f(b.south)}))`;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(street|st|avenue|ave|av|place|pl|calle|avenida)\b\.?/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function findCornerIndex(corridor: Corridor, query: string): number {
  const q = norm(query);
  if (!q) return -1;
  return corridor.corners.findIndex((c) => {
    const n = norm(c.name);
    return n === q || q.includes(n) || n.includes(q);
  });
}

function findCorridor(query: string): Corridor | undefined {
  const q = norm(query);
  return CORRIDORS.find((c) => q.includes(norm(c.street)));
}

// ---------- walk plan ----------

interface Leg {
  corridor: Corridor;
  fromIdx: number;
  step: 1 | -1;
}

function blockFromLeg(leg: Leg, routeIndex: number, routeLength: number): BlockContext | null {
  const { corridor, fromIdx, step } = leg;
  const from = corridor.corners[fromIdx];
  const to = corridor.corners[fromIdx + step];
  if (!from || !to) return null;
  const bbox = boxAround(from, to);
  const id = (i: number, s: number) => {
    const a = corridor.corners[i];
    const b = corridor.corners[i + s];
    return a && b ? blockIdFor(corridor.street, a.name, b.name) : null;
  };
  return {
    blockId: blockIdFor(corridor.street, from.name, to.name),
    streetName: corridor.street,
    fromCrossStreet: from.name,
    toCrossStreet: to.name,
    from,
    to,
    heading: headingBetween(from, to),
    borough: corridor.borough,
    councilDistrict: corridor.councilDistrict,
    communityBoard: corridor.communityBoard,
    boundingBoxWKT: toWKT(bbox),
    bbox,
    upcomingIntersection: { name: `${corridor.street} & ${to.name}`, lat: to.lat, lon: to.lon },
    nextBlockId: id(fromIdx + step, step),
    prevBlockId: id(fromIdx - step, step),
    routeIndex,
    routeLength,
  };
}

const slug = (s: string) => norm(s).replace(/ /g, "-");
export const blockIdFor = (street: string, from: string, to: string) => `${slug(street)}__${slug(from)}__${slug(to)}`;

export interface WalkPlan {
  label: string;
  blocks: BlockContext[];
}

/**
 * Plan a walk along a known corridor between two cross streets.
 * Accepts loose phrases: "Knickerbocker and Stockholm" → "Menahan", "my kid's school" etc.
 * Unknown endpoints fall back to the demo route (Stockholm St → Menahan St, crossing Myrtle).
 */
export function planWalk(origin = "", destination = ""): WalkPlan {
  const corridor = findCorridor(origin) ?? findCorridor(destination) ?? KNICKERBOCKER;
  const strip = (s: string) => s.replace(new RegExp(corridor.street.split(" ")[0], "i"), "");
  let a = findCornerIndex(corridor, strip(origin));
  let b = findCornerIndex(corridor, strip(destination));
  if (a < 0) a = findCornerIndex(corridor, "Stockholm Street");
  if (b < 0 || b === a) b = findCornerIndex(corridor, "Menahan Street");
  if (a < 0) a = 0;
  if (b < 0 || b === a) b = Math.min(a + 5, corridor.corners.length - 1);
  const step: 1 | -1 = b > a ? 1 : -1;
  const count = Math.abs(b - a);
  const blocks: BlockContext[] = [];
  for (let i = 0; i < count; i++) {
    const blk = blockFromLeg({ corridor, fromIdx: a + i * step, step }, i, count);
    if (blk) blocks.push(blk);
  }
  return {
    label: `${corridor.street}: ${corridor.corners[a].name} → ${corridor.corners[b].name}`,
    blocks,
  };
}

/**
 * Stateful walker. Person D's voice router and Person F's arrow keys both call `move()`.
 * Moving past the planned route keeps walking the same street (free walk).
 */
export class StreetWalker implements Walker {
  private leg: Leg;
  private index = 0;
  private length: number;
  readonly plan: WalkPlan;

  constructor(plan: WalkPlan) {
    this.plan = plan;
    const first = plan.blocks[0];
    const corridor = CORRIDORS.find((c) => c.street === first.streetName) ?? KNICKERBOCKER;
    const fromIdx = corridor.corners.findIndex((c) => c.name === first.fromCrossStreet);
    const toIdx = corridor.corners.findIndex((c) => c.name === first.toCrossStreet);
    this.leg = { corridor, fromIdx, step: toIdx > fromIdx ? 1 : -1 };
    this.length = plan.blocks.length;
  }

  current(): BlockContext {
    return blockFromLeg(this.leg, this.index, this.length)!;
  }

  /** Peek without moving — used to pre-fetch the next block's data. */
  peek(direction: "next_block" | "prev_block" = "next_block"): BlockContext | null {
    const s = direction === "next_block" ? this.leg.step : -this.leg.step;
    return blockFromLeg({ ...this.leg, fromIdx: this.leg.fromIdx + s }, this.index + (s === this.leg.step ? 1 : -1), this.length);
  }

  /** Returns the new block, or an explanation of why the move isn't possible. */
  move(direction: WalkDirection, crossStreet?: string): { ok: true; block: BlockContext } | { ok: false; reason: string } {
    if (direction === "next_block" || direction === "prev_block") {
      const s = direction === "next_block" ? this.leg.step : -this.leg.step;
      const nextLeg = { ...this.leg, fromIdx: this.leg.fromIdx + s };
      const blk = blockFromLeg(nextLeg, this.index + (direction === "next_block" ? 1 : -1), this.length);
      if (!blk) return { ok: false, reason: direction === "next_block" ? "End of the street." : "You're at the start." };
      this.leg = nextLeg;
      this.index += direction === "next_block" ? 1 : -1;
      return { ok: true, block: blk };
    }
    return this.turn(direction, crossStreet);
  }

  private turn(direction: "turn_left" | "turn_right", crossStreet?: string) {
    const here = this.current();
    // Turn at the intersection you're walking toward.
    const corner = here.to;
    const target = CORRIDORS.find(
      (c) =>
        c !== this.leg.corridor &&
        norm(c.street) === norm(corner.name) &&
        (!crossStreet || norm(crossStreet).includes(norm(c.street)) || norm(c.street).includes(norm(crossStreet))),
    );
    if (!target) {
      return {
        ok: false as const,
        reason: crossStreet
          ? `I can't turn onto ${crossStreet} from here. The next corner is ${corner.name}.`
          : `There's no mapped street to turn onto at ${corner.name} yet.`,
      };
    }
    const at = target.corners.findIndex((c) => norm(c.name) === norm(this.leg.corridor.street));
    if (at < 0) return { ok: false as const, reason: `Couldn't find the corner of ${target.street}.` };
    // Pick the step whose heading is ~90° left/right of where we're facing.
    const want = (here.heading + (direction === "turn_left" ? 270 : 90)) % 360;
    const options = ([1, -1] as const)
      .map((step) => ({ step, c: target.corners[at + step] }))
      .filter((o) => o.c)
      .map((o) => ({ ...o, diff: Math.abs(((headingBetween(target.corners[at], o.c!) - want + 540) % 360) - 180) }))
      .sort((x, y) => x.diff - y.diff);
    if (!options.length) return { ok: false as const, reason: `${target.street} ends here.` };
    this.leg = { corridor: target, fromIdx: at, step: options[0].step };
    this.index += 1;
    this.length = Math.max(this.length, this.index + 1);
    return { ok: true as const, block: this.current() };
  }
}
