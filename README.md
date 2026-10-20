# NYC Map Agent — Person A: 3D Map & Walk Mode Engine

```bash
npm install
npm run dev   # http://localhost:3000
```

Type a **From** and **To** (an address, a place like "Grand Central Terminal", or a corner like "Myrtle Ave and Wyckoff Ave") and press **Walk**, or press **Up**/Start for the Knickerbocker Ave demo route. **Up/Down** = next/back block, **Left/Right** = turn at the next corner. The text box takes `next block`, `go back`, `turn left on Myrtle`, `walk me from Stockholm to Menahan`.

## Files (per PRD)
- `components/Map3DCanvas.tsx` — MapLibre + OpenFreeMap 3D buildings (all 5 boroughs, no API key); highlights the route, the active block (green) and the upcoming intersection (amber).
- `lib/cameraChoreographer.ts` — `dropToStreet`, `glideTo`, `turnOnto`, `backToCity`; honors reduced motion.
- `lib/streetNetwork.ts` — walk anywhere in NYC: looks up places (NYC GeoSearch, then OpenStreetMap Nominatim; corners from the city centerline), builds a walking graph from NYC's official street centerline (`inkn-q76z`, already split at every intersection), and routes block by block. `planRoute(from, to)` returns a `Walker`.
- `lib/blockData.ts` — live 311 noise/complaint and NYPD crash numbers for each block, computed from NYC Open Data rows.
- `lib/streetGraph.ts` — `planWalk(origin, destination)` and `StreetWalker.move(direction)`. Corners are real OSM intersections (Knickerbocker Ave, Myrtle Ave in Bushwick).

## Hand-off contract (for B, C, D, E, F)
- Listen: `window.addEventListener("peas:block", e => e.detail)` → `BlockContext` (street, cross streets, `bbox`, `boundingBoxWKT`, `upcomingIntersection`, `nextBlockId`/`prevBlockId` for pre-fetch, council district, community board).
- Drive: `window.dispatchEvent(new CustomEvent("peas:walk", { detail: { direction: "next_block" | "prev_block" | "turn_left" | "turn_right", crossStreet?: "Myrtle" } }))`.
- `StreetWalker.peek()` returns the next block without moving, for <2s narration pre-fetch.

The caption currently says position only — no data numbers. Narration with numbers comes from Persons B/C.
