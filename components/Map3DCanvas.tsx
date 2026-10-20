"use client";
// Person A — 3D OpenStreetMap canvas (all 5 boroughs), active-block + upcoming-intersection highlight.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import maplibregl, { type Map as MapLibreMap, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BlockContext } from "@/lib/streetGraph";
import { NYC_OVERVIEW } from "@/lib/cameraChoreographer";

// Free OSM vector tiles with 3D building heights; no API key.
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export interface Map3DCanvasHandle {
  map: MapLibreMap | null;
}

interface Props {
  route: BlockContext[];
  activeBlock: BlockContext | null;
  onReady?: (map: MapLibreMap) => void;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const line = (blocks: BlockContext[]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: blocks.map((b) => ({
    type: "Feature",
    properties: { blockId: b.blockId },
    geometry: { type: "LineString", coordinates: b.path ?? [[b.from.lon, b.from.lat], [b.to.lon, b.to.lat]] },
  })),
});

const Map3DCanvas = forwardRef<Map3DCanvasHandle, Props>(function Map3DCanvas({ route, activeBlock, onReady }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loaded = useRef(false);

  useImperativeHandle(ref, () => ({ get map() { return mapRef.current; } }), []);

  useEffect(() => {
    if (!el.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      style: STYLE_URL,
      ...NYC_OVERVIEW,
      maxPitch: 85,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("load", () => {
      // Make sure buildings are extruded even if the style changes upstream.
      if (!map.getLayer("building-3d") && map.getSource("openmaptiles")) {
        map.addLayer({
          id: "building-3d",
          type: "fill-extrusion",
          source: "openmaptiles",
          "source-layer": "building",
          minzoom: 13,
          paint: {
            "fill-extrusion-color": "#d8d4cc",
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": 0.85,
          },
        });
      }
      map.addSource("route", { type: "geojson", data: EMPTY });
      map.addSource("active", { type: "geojson", data: EMPTY });
      map.addSource("corner", { type: "geojson", data: EMPTY });
      const beforeId = map.getLayer("building-3d") ? "building-3d" : undefined;
      map.addLayer({ id: "route-line", type: "line", source: "route", paint: { "line-color": "#60a5fa", "line-width": 6, "line-opacity": 0.7 }, layout: { "line-cap": "round" } }, beforeId);
      map.addLayer({ id: "active-line", type: "line", source: "active", paint: { "line-color": "#34d399", "line-width": 12 }, layout: { "line-cap": "round" } }, beforeId);
      map.addLayer({ id: "corner-halo", type: "circle", source: "corner", paint: { "circle-radius": 22, "circle-color": "#fbbf24", "circle-opacity": 0.35 } });
      map.addLayer({ id: "corner-dot", type: "circle", source: "corner", paint: { "circle-radius": 8, "circle-color": "#fbbf24", "circle-stroke-color": "#000", "circle-stroke-width": 2 } });
      loaded.current = true;
      map.fire("peas:sync");
      onReady?.(map);
    });

    return () => {
      loaded.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sync = () => {
      (map.getSource("route") as GeoJSONSource | undefined)?.setData(line(route));
      (map.getSource("active") as GeoJSONSource | undefined)?.setData(activeBlock ? line([activeBlock]) : EMPTY);
      (map.getSource("corner") as GeoJSONSource | undefined)?.setData(
        activeBlock
          ? {
              type: "FeatureCollection",
              features: [{ type: "Feature", properties: { name: activeBlock.upcomingIntersection.name }, geometry: { type: "Point", coordinates: [activeBlock.to.lon, activeBlock.to.lat] } }],
            }
          : EMPTY,
      );
    };
    if (loaded.current) sync();
    else map.once("peas:sync", sync);
  }, [route, activeBlock]);

  return (
    <div
      ref={el}
      role="img"
      aria-label={
        activeBlock
          ? `3D street view: ${activeBlock.streetName} between ${activeBlock.fromCrossStreet} and ${activeBlock.toCrossStreet}, heading toward ${activeBlock.toCrossStreet}.`
          : "3D map of New York City."
      }
      style={{ position: "absolute", inset: 0 }}
    />
  );
});

export default Map3DCanvas;
