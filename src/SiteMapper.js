import React, { useEffect, useRef, useState, useCallback } from "react";

/* ─── Leaflet loader ─────────────────────────────────────────────────────── */
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS  = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

function injectLeaflet() {
  return new Promise((resolve) => {
    if (window.L) { resolve(); return; }
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const lk = document.createElement("link");
      lk.rel = "stylesheet"; lk.href = LEAFLET_CSS;
      document.head.appendChild(lk);
    }
    if (!document.querySelector(`script[src="${LEAFLET_JS}"]`)) {
      const sc = document.createElement("script");
      sc.src = LEAFLET_JS; sc.onload = resolve;
      document.head.appendChild(sc);
    } else { resolve(); }
  });
}

/* ─── Tile layers ─────────────────────────────────────────────────────────── */
const ESRI_LABEL      = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const ESRI_STREET     = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
// Google Maps tiles
const GOOGLE_HYBRID   = "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"; // satellite + street names
const GOOGLE_SAT      = "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"; // pure satellite (Google Earth look)
const GOOGLE_SUBS     = ["0","1","2","3"];
// USGS hillshade — overlays terrain depth on satellite for Google Earth feel
const USGS_HILLSHADE  = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}";
// USGS National Map — official US gov topo tiles, free, no rate limits
const USGS_TOPO       = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";

/* ─── Geocoding ───────────────────────────────────────────────────────────── */

/** Parse a US address string into components for structured Nominatim query.
 *  Handles formats like:
 *    "5623 Two Notch Rd, Columbia, SC 29223"
 *    "5623 Two Notch Rd Columbia SC"
 *    "5623 Two Notch Rd, Columbia SC"
 */
function parseUSAddress(raw) {
  const s = raw.trim();
  // With commas: "NUMBER STREET, CITY, STATE ZIP"
  const c = s.match(/^(\d+\s+[^,]+?),\s*([^,]+?),\s*([A-Za-z]{2})\s*(\d{5})?$/i);
  if (c) return { street: c[1].trim(), city: c[2].trim(), state: c[3].toUpperCase(), zip: c[4] || "" };
  // Partial commas: "NUMBER STREET, CITY STATE ZIP"
  const p = s.match(/^(\d+\s+[^,]+?),\s*([A-Za-z\s]+?)\s+([A-Za-z]{2})\s*(\d{5})?$/i);
  if (p) return { street: p[1].trim(), city: p[2].trim(), state: p[3].toUpperCase(), zip: p[4] || "" };
  // No commas: "NUMBER STREET CITY STATE ZIP"
  const n = s.match(/^(\d+\s+(?:[NSEW]\s+)?[\w\s]+?(?:rd|st|ave|blvd|dr|ln|ct|pl|way|hwy|pkwy|pike|trl|run|loop|cir|ter|row|pt|sq|pass|xing)\b[^A-Z]*?)\s+([A-Za-z][\w\s]{1,20}?)\s+([A-Za-z]{2})\s*(\d{5})?$/i);
  if (n) return { street: n[1].trim(), city: n[2].trim(), state: n[3].toUpperCase(), zip: n[4] || "" };
  return null;
}

/** Geocode an address — tries structured Nominatim first, falls back to free-text.
 *  Returns { lat, lng, displayName } or null.
 */
async function geocodeAddress(address) {
  const GKEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || "AIzaSyBnhUSUtGMAADdpNVTak0IEQ7uXE0k3CEo";
  // 1️⃣  Google Maps — precise building-level geocoding
  if (GKEY) {
    try {
      const r = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GKEY}`
      );
      const d = await r.json();
      if (d.status === "OK" && d.results.length > 0) {
        const loc = d.results[0].geometry.location;
        return { lat: loc.lat, lng: loc.lng, displayName: d.results[0].formatted_address };
      }
    } catch (_) { /* fall through */ }
  }
  // 2️⃣  Nominatim structured fallback
  const HDR = { "Accept-Language": "en", "User-Agent": "DXD-Deployment-Tracker/1.0" };
  const parsed = parseUSAddress(address);
  if (parsed) {
    try {
      const qs = new URLSearchParams({
        format: "json", limit: "5", addressdetails: "1", countrycodes: "us",
        street: parsed.street, city: parsed.city, state: parsed.state,
        ...(parsed.zip ? { postalcode: parsed.zip } : {}),
      });
      const r = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, { headers: HDR });
      const results = await r.json();
      if (results.length > 0) {
        const best = results.sort((a, b) => b.place_rank - a.place_rank)[0];
        return { lat: parseFloat(best.lat), lng: parseFloat(best.lon), displayName: best.display_name };
      }
    } catch (_) { /* fall through */ }
  }
  // 3️⃣  Nominatim free-text global fallback
  try {
    const qs = new URLSearchParams({ format: "json", limit: "1", q: address });
    const r  = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, { headers: HDR });
    const res = await r.json();
    if (res.length > 0) return { lat: parseFloat(res[0].lat), lng: parseFloat(res[0].lon), displayName: res[0].display_name };
  } catch (_) { /* fall through */ }

  return null;
}

/* ─── Unit helpers ────────────────────────────────────────────────────────── */
const M_PER_MILE   = 1609.344;
const FT_PER_METER = 3.28084;
const M2_PER_ACRE  = 4046.856;

function metersToDisplay(m) {
  const ft = m * FT_PER_METER;
  const mi = m / M_PER_MILE;
  if (mi >= 0.1) return `${mi.toFixed(2)} mi  (${Math.round(ft).toLocaleString()} ft)`;
  return `${Math.round(ft).toLocaleString()} ft`;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ─── Drone model definitions ─────────────────────────────────────────────── */
const DRONE_MODELS = {
  "dji-dock-3": {
    label:          "DJI Dock 3",
    launchDelaySec: 30,
    speedMph:       33,
    ringsSec:       [60, 90, 120, 150, 180, 210],
    available:      true,
  },
  "sunflower-labs": {
    label:          "Sunflower Labs",
    launchDelaySec: 5,
    speedMph:       9,
    ringsSec:       [60, 90, 120, 150, 180, 210],
    available:      true,
  },
  "skydio-x10": {
    label:          "Skydio X10",
    launchDelaySec: 20,
    speedMph:       45,
    ringsSec:       [60, 90, 120, 150, 180, 210],
    available:      true,
  },
};

/** Convert total elapsed seconds → radius in metres for a given drone model */
function flightTimeToRadiusM(model, totalSec) {
  const flySec  = Math.max(0, totalSec - model.launchDelaySec);
  const speedMs = model.speedMph * M_PER_MILE / 3600;
  return flySec * speedMs;
}

/** Spherical-excess polygon area in m² */
function polygonAreaM2(latLngs) {
  const n = latLngs.length;
  if (n < 3) return 0;
  const R = 6371000;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = latLngs[i].lat * Math.PI / 180;
    const lat2 = latLngs[j].lat * Math.PI / 180;
    const dLng  = (latLngs[j].lng - latLngs[i].lng) * Math.PI / 180;
    area += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs(area * R * R / 2);
}

/* ─── Colors ─────────────────────────────────────────────────────────────── */
const TACT_RED   = "#FF2020";          // primary tactical red
const TACT_AMBER = "#FFB300";          // measurement amber
const TACT_WHITE = "#FFFFFF";          // boundary / rings
const TACT_DIM   = "rgba(255,50,50,0.65)";

// Per-dock ring colors: 1=white, 2=red, 3=green, 4+=orange
const DOCK_RING_COLORS = ["#FFFFFF", "#FF2020", "#39FF14", "#FF8C00"];
function dockColor(num) { return DOCK_RING_COLORS[Math.min(num - 1, DOCK_RING_COLORS.length - 1)]; }

/* ─── Icons ──────────────────────────────────────────────────────────────── */

/** Top-down drone icon */
function makeDockIcon(L, num) {
  const c = TACT_RED;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <!-- arms -->
    <line x1="16" y1="16" x2="5"  y2="5"  stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="27" y2="5"  stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="5"  y2="27" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="27" y2="27" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>
    <!-- prop discs -->
    <circle cx="5"  cy="5"  r="4.5" fill="rgba(10,4,4,0.88)" stroke="${c}" stroke-width="1.1"/>
    <circle cx="27" cy="5"  r="4.5" fill="rgba(10,4,4,0.88)" stroke="${c}" stroke-width="1.1"/>
    <circle cx="5"  cy="27" r="4.5" fill="rgba(10,4,4,0.88)" stroke="${c}" stroke-width="1.1"/>
    <circle cx="27" cy="27" r="4.5" fill="rgba(10,4,4,0.88)" stroke="${c}" stroke-width="1.1"/>
    <!-- prop blades (simple X) -->
    <line x1="2.5" y1="5"   x2="7.5" y2="5"   stroke="${c}" stroke-width="0.8" stroke-linecap="round"/>
    <line x1="5"   y1="2.5" x2="5"   y2="7.5" stroke="${c}" stroke-width="0.8" stroke-linecap="round"/>
    <line x1="24.5" y1="5"   x2="29.5" y2="5"  stroke="${c}" stroke-width="0.8" stroke-linecap="round"/>
    <line x1="27"   y1="2.5" x2="27"   y2="7.5" stroke="${c}" stroke-width="0.8" stroke-linecap="round"/>
    <line x1="2.5" y1="27"  x2="7.5" y2="27"  stroke="${c}" stroke-width="0.8" stroke-linecap="round"/>
    <line x1="5"   y1="24.5" x2="5"  y2="29.5" stroke="${c}" stroke-width="0.8" stroke-linecap="round"/>
    <line x1="24.5" y1="27"  x2="29.5" y2="27" stroke="${c}" stroke-width="0.8" stroke-linecap="round"/>
    <line x1="27"   y1="24.5" x2="27" y2="29.5" stroke="${c}" stroke-width="0.8" stroke-linecap="round"/>
    <!-- body -->
    <circle cx="16" cy="16" r="4.5" fill="rgba(10,4,4,0.92)" stroke="${c}" stroke-width="1.4"/>
    <!-- number -->
    <text x="16" y="19" text-anchor="middle" fill="#fff" font-size="5.5" font-weight="bold"
      font-family="'Courier New',monospace" letter-spacing="0">${num}</text>
  </svg>`;
  return L.divIcon({ html: svg, className: "", iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -20] });
}

/** Measurement pin (A / B) */
function makePinIcon(L, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="12" fill="rgba(0,0,0,0.78)" stroke="${TACT_AMBER}" stroke-width="1.6"/>
    <line x1="14" y1="2"  x2="14" y2="8"  stroke="${TACT_AMBER}" stroke-width="1.6" stroke-linecap="round"/>
    <line x1="14" y1="20" x2="14" y2="26" stroke="${TACT_AMBER}" stroke-width="1.6" stroke-linecap="round"/>
    <line x1="2"  y1="14" x2="8"  y2="14" stroke="${TACT_AMBER}" stroke-width="1.6" stroke-linecap="round"/>
    <line x1="20" y1="14" x2="26" y2="14" stroke="${TACT_AMBER}" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="14" cy="14" r="2.5" fill="${TACT_AMBER}"/>
    <text x="14" y="11" text-anchor="middle" fill="${TACT_AMBER}" font-size="7" font-weight="bold"
      font-family="'Courier New',monospace">${label}</text>
  </svg>`;
  return L.divIcon({ html: svg, className: "", iconSize: [28, 28], iconAnchor: [14, 14] });
}

/** Vertex dot for boundary drawing — white */
function makeVertexIcon(L) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">
    <line x1="5" y1="0" x2="5" y2="10" stroke="${TACT_WHITE}" stroke-width="0.9"/>
    <line x1="0" y1="5" x2="10" y2="5" stroke="${TACT_WHITE}" stroke-width="0.9"/>
    <circle cx="5" cy="5" r="2.5" fill="${TACT_WHITE}" fill-opacity="0.85"/>
  </svg>`;
  return L.divIcon({ html: svg, className: "", iconSize: [10, 10], iconAnchor: [5, 5] });
}

/** Site address teardrop pin */
function makeSitePinIcon(L) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="24" viewBox="0 0 18 24">
    <path d="M9 0C4.03 0 0 4.03 0 9C0 15.75 9 24 9 24C9 24 18 15.75 18 9C18 4.03 13.97 0 9 0Z"
      fill="${TACT_RED}" stroke="rgba(255,255,255,0.7)" stroke-width="1.2"/>
    <circle cx="9" cy="9" r="3.5" fill="rgba(255,255,255,0.9)"/>
  </svg>`;
  return L.divIcon({ html: svg, className: "", iconSize: [18, 24], iconAnchor: [9, 24] });
}

/** Numbered site pin — one per address in the multi-site list */
const SITE_PIN_COLORS = ["#FF2020", "#00BFFF", "#FFD700", "#39FF14", "#FF8C00", "#DA70D6", "#FF69B4", "#00CED1"];
function makeSiteNumPin(L, num, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30">
    <path d="M11 0C4.93 0 0 4.93 0 11C0 19.25 11 30 11 30C11 30 22 19.25 22 11C22 4.93 17.07 0 11 0Z"
      fill="${color}" stroke="rgba(0,0,0,0.5)" stroke-width="1.2"/>
    <circle cx="11" cy="11" r="6" fill="rgba(0,0,0,0.55)"/>
    <text x="11" y="15" text-anchor="middle" fill="#fff" font-size="8" font-weight="bold"
      font-family="'Courier New',monospace">${num}</text>
  </svg>`;
  return L.divIcon({ html: svg, className: "", iconSize: [22, 30], iconAnchor: [11, 30], popupAnchor: [0, -32] });
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const S = {
  wrap: {
    display: "flex", flexDirection: "column",
    height: "100%", minHeight: 820, gap: 0,
    fontFamily: "'Courier New', Courier, monospace",
  },
  toolbar: {
    display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
    background: "rgba(8,4,4,0.97)",
    borderBottom: `1px solid ${TACT_RED}44`,
    flexWrap: "wrap",
    backgroundImage: `repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,32,32,0.015) 2px,rgba(255,32,32,0.015) 4px)`,
  },
  toolBtn: (active) => ({
    display: "flex", alignItems: "center", gap: 5, padding: "5px 13px",
    borderRadius: 3,
    border: active ? `1px solid ${TACT_RED}` : `1px solid ${TACT_RED}33`,
    background: active ? `${TACT_RED}18` : "transparent",
    color: active ? TACT_RED : `${TACT_RED}88`,
    cursor: "pointer", fontSize: 11, fontWeight: 700,
    fontFamily: "'Courier New', monospace", letterSpacing: "0.04em",
    textTransform: "uppercase", transition: "all 0.12s",
    boxShadow: active ? `0 0 8px ${TACT_RED}44` : "none",
  }),
  divider: {
    width: 1, height: 22, margin: "0 4px",
    background: `${TACT_RED}25`,
  },
  mapWrap: { flex: 1, position: "relative", minHeight: 760 },
  mapEl: { width: "100%", height: "100%", minHeight: 760, position: "absolute", inset: 0 },

  /* ── Status bar ── */
  statusBar: {
    padding: "5px 16px",
    background: "rgba(8,4,4,0.97)",
    borderTop: `1px solid ${TACT_RED}33`,
    fontSize: 11, color: TACT_DIM,
    fontFamily: "'Courier New', monospace",
    display: "flex", alignItems: "center", gap: 20,
    backgroundImage: `repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,32,32,0.012) 2px,rgba(255,32,32,0.012) 4px)`,
  },

  /* ── Legend overlay ── */
  legend: {
    position: "absolute", bottom: 20, right: 12, zIndex: 999,
    background: "rgba(10,4,4,0.93)",
    border: `1px solid ${TACT_RED}44`,
    borderRadius: 4, padding: "10px 14px", minWidth: 210,
    fontSize: 11, color: TACT_DIM,
    fontFamily: "'Courier New', monospace",
    boxShadow: `0 0 18px rgba(255,32,32,0.10)`,
  },
  legendTitle: {
    fontWeight: 700, color: TACT_RED, marginBottom: 8,
    fontSize: 10, letterSpacing: "0.12em",
    borderBottom: `1px solid ${TACT_RED}33`, paddingBottom: 4,
  },
  legendRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 5 },

  /* ── Inputs ── */
  numInput: {
    width: 68, padding: "4px 7px", borderRadius: 3,
    border: `1px solid ${TACT_RED}44`,
    background: "rgba(10,4,4,0.9)",
    color: TACT_RED, fontSize: 11,
    fontFamily: "'Courier New', monospace",
  },
  droneSelect: {
    padding: "4px 10px", borderRadius: 3,
    border: `1px solid ${TACT_RED}55`,
    background: "rgba(10,4,4,0.95)",
    color: TACT_RED, fontSize: 11, fontWeight: 700,
    fontFamily: "'Courier New', monospace",
    letterSpacing: "0.03em",
    cursor: "pointer",
    appearance: "none", WebkitAppearance: "none",
    paddingRight: 22,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23FF2020'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 6px center",
  },
  closeBoundaryBtn: {
    padding: "5px 16px", borderRadius: 3,
    border: `2px solid ${TACT_WHITE}`, background: "rgba(255,255,255,0.12)",
    color: TACT_WHITE, cursor: "pointer", fontSize: 12, fontWeight: 700,
    fontFamily: "'Courier New', monospace", letterSpacing: "0.06em",
    textTransform: "uppercase",
    boxShadow: "0 0 12px rgba(255,255,255,0.35)",
    animation: "tactPulse 1.2s ease-in-out infinite",
  },
  removeBoundaryBtn: {
    padding: "5px 11px", borderRadius: 3,
    border: "1px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.07)",
    color: "rgba(255,255,255,0.75)", cursor: "pointer", fontSize: 11,
    fontFamily: "'Courier New', monospace", letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  clearBtn: {
    padding: "5px 11px", borderRadius: 3,
    border: `1px solid ${TACT_RED}55`, background: `${TACT_RED}12`,
    color: "#EF9A9A", cursor: "pointer", fontSize: 11,
    fontFamily: "'Courier New', monospace", letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  exportBtn: {
    padding: "5px 13px", borderRadius: 3,
    border: `1px solid ${TACT_RED}55`, background: `${TACT_RED}0e`,
    color: TACT_RED, cursor: "pointer", fontSize: 11,
    fontFamily: "'Courier New', monospace", letterSpacing: "0.04em",
    textTransform: "uppercase",
    boxShadow: `0 0 6px ${TACT_RED}22`,
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   SiteMapper component
   ══════════════════════════════════════════════════════════════════════════ */
export default function SiteMapper({ project, cachedData, onCacheUpdate }) {
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const layersRef       = useRef({
    siteMarker:      null,
    siteMarkers:     [],   // { id, marker } — multi-site pins
    dockMarkers:     [],   // { marker, rings: [], ringLabels: [], num, droneKey, ringColor }
    vertexMarkers:   [],   // crosshair dots during boundary drawing
    boundaryPoints:  [],
    boundaryLine:    null,
    boundaryPoly:    null,
    boundaryLabel:   null, // acreage label marker
    boundaryAcres:   null,
    measurePins:     [],
    measureLine:     null,
    measureLabel:    null,
    _measureClicks:  [],
  });

  const [leafletReady,    setLeafletReady]    = useState(false);
  const [tool,            setTool]            = useState("pan");
  const [status,          setStatus]          = useState("Loading map…");
  const [coords,          setCoords]          = useState(null);
  const [dockCount,       setDockCount]       = useState(0);
  const [areaAcres,       setAreaAcres]       = useState(null);
  const [boundaryPtCount, setBoundaryPtCount] = useState(0);
  const [selectedDrone,   setSelectedDrone]   = useState("dji-dock-3");
  const [mapStyle,        setMapStyle]        = useState("sat");
  const [siteLatLng,      setSiteLatLng]      = useState(null);

  // Multi-site address management
  const [sitesList,    setSitesList]    = useState([]); // [{ id, address, lat, lng }]
  const [addSiteInput, setAddSiteInput] = useState("");
  const [addingSite,   setAddingSite]   = useState(false);

  /* tile layer refs — swapped when user changes map style */
  const baseTileRef      = useRef(null);
  const labelTileRef     = useRef(null);
  const hillshadeTileRef = useRef(null);

  const pendingRestore = useRef(cachedData);
  const hasCacheRef    = useRef(!!cachedData); // skip geocode setView when restoring saved map

  /* ── load Leaflet ──────────────────────────────────────────────────────── */
  useEffect(() => {
    injectLeaflet().then(() => setLeafletReady(true));
  }, []);

  /* ── build map ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || mapRef.current) return;
    const L = window.L;

    const map = L.map(mapContainerRef.current, { center: [38.9, -77.0], zoom: 16, zoomControl: true });
    map.zoomControl.setPosition("topright");
    map.attributionControl.setPrefix("");

    baseTileRef.current  = L.tileLayer(GOOGLE_HYBRID, { maxZoom: 21, subdomains: GOOGLE_SUBS, attribution: "Google" }).addTo(map);

    mapRef.current = map;
    setStatus("Select a tool to begin");

    map.on("mousemove", (e) => setCoords({ lat: e.latlng.lat, lng: e.latlng.lng }));

    /* Auto-center + primary site pin */
    const site = project?.site;
    if (site) {
      setStatus("Locating site…");
      geocodeAddress(site).then((geo) => {
        if (geo) {
          const { lat, lng, displayName } = geo;
          setSiteLatLng({ lat, lng });
          if (!hasCacheRef.current) map.setView([lat, lng], 18);
          const color = SITE_PIN_COLORS[0];
          const pin = L.marker([lat, lng], { icon: makeSiteNumPin(L, 1, color), interactive: true, zIndexOffset: 1000 }).addTo(map);
          pin.bindTooltip(`<span style="font-family:'Courier New',monospace;font-size:11px;color:#fff;background:rgba(10,4,4,0.9);border:1px solid ${color}55;padding:3px 8px;border-radius:2px">📍 ${site}</span>`,
            { permanent: false, direction: "top", className: "tact-tooltip", offset: [0, -32] });
          const siteId = "site-primary";
          layersRef.current.siteMarker = pin;
          layersRef.current.siteMarkers = [{ id: siteId, marker: pin }];
          setSitesList([{ id: siteId, address: site, lat, lng }]);
          setStatus(`Locked on: ${displayName || site}`);
        } else {
          setStatus("Geocode failed — pan manually");
        }
      });
    }

    if (pendingRestore.current) {
      restoreFromCache(L, map, pendingRestore.current);
      pendingRestore.current = null;
    }

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady]);

  /* ── cursor + dblclick zoom per tool ──────────────────────────────────── */
  useEffect(() => {
    if (!mapRef.current) return;
    const cursors = { pan: "", dock: "crosshair", boundary: "crosshair", measure: "crosshair" };
    mapRef.current.getContainer().style.cursor = cursors[tool] || "";
    if (tool === "boundary") {
      mapRef.current.doubleClickZoom.disable();
    } else {
      mapRef.current.doubleClickZoom.enable();
    }
  }, [tool]);

  /* ── switch map style ──────────────────────────────────────────────────── */
  function switchMapStyle(style) {
    const L   = window.L;
    const map = mapRef.current;
    if (!map || !L) return;

    // Remove existing tile layers
    if (baseTileRef.current)      { map.removeLayer(baseTileRef.current);      baseTileRef.current      = null; }
    if (labelTileRef.current)     { map.removeLayer(labelTileRef.current);     labelTileRef.current     = null; }
    if (hillshadeTileRef.current) { map.removeLayer(hillshadeTileRef.current); hillshadeTileRef.current = null; }

    if (style === "sat") {
      // Google hybrid = satellite imagery with street names baked in — matches Google Maps look
      baseTileRef.current  = L.tileLayer(GOOGLE_HYBRID, {
        maxZoom: 21, subdomains: GOOGLE_SUBS, attribution: "Google",
      }).addTo(map);
    } else if (style === "street") {
      baseTileRef.current  = L.tileLayer(ESRI_STREET, { maxZoom: 21, attribution: "Esri" }).addTo(map);
    } else if (style === "topo") {
      // USGS National Map Topo — official contour lines, elevation labels, no rate limits
      baseTileRef.current  = L.tileLayer(USGS_TOPO, {
        maxZoom: 21, maxNativeZoom: 16, attribution: "USGS National Map",
      }).addTo(map);
    } else if (style === "earth") {
      // Google Earth look — pure satellite base + USGS hillshade terrain overlay
      // All mapping tools (FAR, boundary, dock, measure) remain fully functional
      baseTileRef.current      = L.tileLayer(GOOGLE_SAT, {
        maxZoom: 21, subdomains: GOOGLE_SUBS, attribution: "Google",
      }).addTo(map);
      hillshadeTileRef.current = L.tileLayer(USGS_HILLSHADE, {
        maxZoom: 21, maxNativeZoom: 13, opacity: 0.35, attribution: "USGS",
      }).addTo(map);
    }
    // "streetview" handled by iframe overlay — no Leaflet tile layer needed

    setMapStyle(style);
  }

  /* ── save to cache ─────────────────────────────────────────────────────── */
  const sitesListRef = useRef([]);
  useEffect(() => { sitesListRef.current = sitesList; }, [sitesList]);

  const saveToCache = useCallback(() => {
    if (!mapRef.current) return;
    const lr = layersRef.current;
    // Persist extra sites (all beyond the primary project.site)
    const extras = sitesListRef.current
      .filter((s) => s.id !== "site-primary")
      .map((s) => ({ id: s.id, address: s.address, lat: s.lat, lng: s.lng }));
    const data = {
      view:       { center: mapRef.current.getCenter(), zoom: mapRef.current.getZoom() },
      docks:      lr.dockMarkers.map((d) => ({ latlng: d.marker.getLatLng(), num: d.num, droneKey: d.droneKey })),
      boundary:   lr.boundaryPoly
        ? { points: lr.boundaryPoly.getLatLngs()[0].map((ll) => ({ lat: ll.lat, lng: ll.lng })), acres: lr.boundaryAcres }
        : null,
      measure:    lr.measurePins.length === 2
        ? { a: lr.measurePins[0].getLatLng(), b: lr.measurePins[1].getLatLng() }
        : null,
      extraSites: extras,
    };
    onCacheUpdate && onCacheUpdate(data);
  }, [onCacheUpdate]);

  /* ── restore ───────────────────────────────────────────────────────────── */
  function restoreFromCache(L, map, data) {
    if (!data) return;
    try {
      if (data.view) map.setView([data.view.center.lat, data.view.center.lng], data.view.zoom);
      if (data.docks) {
        data.docks.forEach((d) => placeDock(L, map, L.latLng(d.latlng.lat, d.latlng.lng), d.num, d.droneKey || "dji-dock-3"));
        setDockCount(data.docks.length);
      }
      if (data.boundary) {
        const lls = data.boundary.points.map((p) => L.latLng(p.lat, p.lng));
        drawClosedBoundary(L, map, lls, data.boundary.acres);
      }
      if (data.measure) {
        const a = L.latLng(data.measure.a.lat, data.measure.a.lng);
        const b = L.latLng(data.measure.b.lat, data.measure.b.lng);
        placeMeasurePoints(L, map, a, b);
      }
      // Restore extra site pins (added by user beyond the primary project.site)
      if (data.extraSites && data.extraSites.length > 0) {
        const restored = data.extraSites.map((s, idx) => {
          const pinNum = idx + 2; // primary is always #1
          const color  = SITE_PIN_COLORS[(pinNum - 1) % SITE_PIN_COLORS.length];
          const pin    = L.marker([s.lat, s.lng], { icon: makeSiteNumPin(L, pinNum, color), interactive: true, zIndexOffset: 1000 }).addTo(map);
          pin.bindTooltip(`<span style="font-family:'Courier New',monospace;font-size:11px;color:#fff;background:rgba(10,4,4,0.9);border:1px solid ${color}55;padding:3px 8px;border-radius:2px">📍 ${s.address}</span>`,
            { permanent: false, direction: "top", className: "tact-tooltip", offset: [0, -32] });
          layersRef.current.siteMarkers.push({ id: s.id, marker: pin });
          return { id: s.id, address: s.address, lat: s.lat, lng: s.lng };
        });
        // Merge with primary (already set) — use functional update via setTimeout so state is stable
        setSitesList((prev) => {
          const primary = prev.filter((s) => s.id === "site-primary");
          return [...primary, ...restored];
        });
      }
    } catch (_) { /* ignore */ }
  }

  /* ── add a new site address pin ────────────────────────────────────────── */
  function addSiteToMap(address) {
    if (!address.trim() || !mapRef.current || !window.L) return;
    setAddingSite(true);
    setStatus("Geocoding new location…");
    const L   = window.L;
    const map = mapRef.current;
    geocodeAddress(address.trim()).then((geo) => {
      if (geo) {
        const { lat, lng, displayName } = geo;
        const id = `site-${Date.now()}`;
        setSitesList((prev) => {
          const pinNum = prev.length + 1;
          const color  = SITE_PIN_COLORS[(pinNum - 1) % SITE_PIN_COLORS.length];
          const pin    = L.marker([lat, lng], { icon: makeSiteNumPin(L, pinNum, color), interactive: true, zIndexOffset: 1000 }).addTo(map);
          pin.bindTooltip(`<span style="font-family:'Courier New',monospace;font-size:11px;color:#fff;background:rgba(10,4,4,0.9);border:1px solid ${color}55;padding:3px 8px;border-radius:2px">📍 ${address.trim()}</span>`,
            { permanent: false, direction: "top", className: "tact-tooltip", offset: [0, -32] });
          layersRef.current.siteMarkers.push({ id, marker: pin });
          map.flyTo([lat, lng], 18, { animate: true, duration: 1.2 });
          setTimeout(saveToCache, 100);
          return [...prev, { id, address: address.trim(), lat, lng }];
        });
        setAddSiteInput("");
        setStatus(`Location added: ${displayName || address.trim()}`);
      } else {
        setStatus("Could not geocode — try adding city and state (e.g. 123 Main St, Austin TX)");
      }
    }).finally(() => setAddingSite(false));
  }

  /* ── remove a site pin ──────────────────────────────────────────────────── */
  function removeSiteFromMap(id) {
    if (id === "site-primary") return; // never remove the project's primary address
    const map = mapRef.current;
    if (!map) return;
    // Remove Leaflet marker
    const lr  = layersRef.current;
    const idx = lr.siteMarkers.findIndex((s) => s.id === id);
    if (idx !== -1) {
      map.removeLayer(lr.siteMarkers[idx].marker);
      lr.siteMarkers.splice(idx, 1);
    }
    setSitesList((prev) => {
      const next = prev.filter((s) => s.id !== id);
      // Re-number remaining pins
      lr.siteMarkers.forEach((sm, i) => {
        const pinNum = i + 1;
        const color  = SITE_PIN_COLORS[(pinNum - 1) % SITE_PIN_COLORS.length];
        sm.marker.setIcon(makeSiteNumPin(window.L, pinNum, color));
      });
      setTimeout(saveToCache, 100);
      return next;
    });
    setStatus("Location removed");
  }

  /* ── fly to a site ──────────────────────────────────────────────────────── */
  function flyToSite(lat, lng) {
    if (!mapRef.current) return;
    mapRef.current.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 16), { animate: true, duration: 1.0 });
  }

  /* ── draw closed boundary polygon — white ──────────────────────────────── */
  function drawClosedBoundary(L, map, lls, knownAcres) {
    const lr = layersRef.current;
    if (lr.boundaryPoly) map.removeLayer(lr.boundaryPoly);
    const poly = L.polygon(lls, {
      color: TACT_WHITE, weight: 2.5, dashArray: "10 5",
      fillColor: TACT_WHITE, fillOpacity: 0.06,
      opacity: 0.92,
      interactive: false,   // clicks pass through to the map so docks can be placed inside
    }).addTo(map);
    lr.boundaryPoly = poly;

    const acres = knownAcres ?? polygonAreaM2(lls) / M2_PER_ACRE;
    lr.boundaryAcres = acres;
    setAreaAcres(acres);

    lr.boundaryLabel = null;

  }

  /* ── place dock marker with flight-time radius rings ───────────────────── */
  function placeDock(L, map, latlng, num, droneKey) {
    const key    = droneKey || "dji-dock-3";
    const model  = DRONE_MODELS[key] || DRONE_MODELS["dji-dock-3"];
    const rColor = dockColor(num);                  // unique color per dock slot
    const marker = L.marker(latlng, { icon: makeDockIcon(L, num), draggable: true }).addTo(map);

    // Concentric rings — colored by dock slot, solid, thick
    const rings = model.ringsSec.map((sec, i) => {
      const radiusM = flightTimeToRadiusM(model, sec);
      return L.circle(latlng, {
        radius:      radiusM,
        color:       rColor,
        weight:      i === 0 ? 2.8 : 2.2,
        fillColor:   rColor,
        fillOpacity: 0.018,
        dashArray:   null,
        opacity:     i === 0 ? 0.9 : 0.7,
      }).addTo(map);
    });

    // Flight-time labels at north edge of each ring — match ring color
    const ringLabels = model.ringsSec.map((sec) => {
      const radiusM   = flightTimeToRadiusM(model, sec);
      const offsetLat = latlng.lat + (radiusM / 111320);
      const mi        = (radiusM / M_PER_MILE).toFixed(2);
      const rText = `${fmtTime(sec)}  ${mi} mi`;
      const rW    = Math.ceil(rText.length * 5.6 + 12);
      const rSvg  = `<svg xmlns="http://www.w3.org/2000/svg" width="${rW}" height="16"><rect x="0.5" y="0.5" width="${rW - 1}" height="15" rx="2" fill="#000" stroke="${rColor}" stroke-width="1"/><text x="${Math.round(rW / 2)}" y="11" text-anchor="middle" fill="${rColor}" font-size="9" font-family="Courier New,Courier,monospace" font-weight="700">${rText}</text></svg>`;
      const lbl = L.divIcon({
        html: rSvg,
        className: "sm-ring-lbl", iconAnchor: [Math.round(rW / 2), 8],
      });
      return L.marker([offsetLat, latlng.lng], { icon: lbl, interactive: false }).addTo(map);
    });

    const entry = { marker, rings, ringLabels, num, droneKey: key, ringColor: rColor };
    layersRef.current.dockMarkers.push(entry);

    const ringSummary = model.ringsSec.map(fmtTime).join(" / ");
    marker.bindPopup(
      `<div style="font-family:'Courier New',monospace;font-size:12px;color:#eee;background:#0a0404;padding:7px 12px;border:1px solid ${rColor}66;border-radius:3px">
        <b style="color:${rColor}">DOCK-${String(num).padStart(2,"0")}</b>
        &nbsp;<span style="color:${rColor}99;font-size:10px">${model.label}</span><br/>
        <span style="color:rgba(255,255,255,0.45);font-size:10px">
          Launch delay: ${model.launchDelaySec}s &bull; Speed: ${model.speedMph} mph<br/>
          Rings (total time): ${ringSummary}
        </span><br/>
        <span style="opacity:0.45;font-size:10px">Drag to reposition</span><br/>
        <button onclick="window.__sitemapRemoveDock(${num})" style="margin-top:6px;width:100%;padding:4px 0;background:rgba(255,32,32,0.12);border:1px solid rgba(255,32,32,0.4);border-radius:3px;color:#FF6B6B;font-family:'Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:0.06em;cursor:pointer;text-transform:uppercase">
          &#x2715; REMOVE DOCK
        </button>
      </div>`,
      { className: "tact-popup" }
    );

    function syncRings() {
      const ll = marker.getLatLng();
      rings.forEach((r) => r.setLatLng(ll));
      ringLabels.forEach((lbl, i) => {
        const radiusM   = flightTimeToRadiusM(model, model.ringsSec[i]);
        const offsetLat = ll.lat + (radiusM / 111320);
        lbl.setLatLng([offsetLat, ll.lng]);
      });
    }
    marker.on("drag",    syncRings);
    marker.on("dragend", () => saveToCache());
  }

  /* ── place measurement points ──────────────────────────────────────────── */
  function placeMeasurePoints(L, map, a, b) {
    const lr = layersRef.current;
    lr.measurePins.forEach((p) => map.removeLayer(p));
    if (lr.measureLine)  map.removeLayer(lr.measureLine);
    if (lr.measureLabel) map.removeLayer(lr.measureLabel);
    lr.measurePins = [];

    const mA = L.marker(a, { icon: makePinIcon(L, "A"), draggable: true }).addTo(map);
    const mB = L.marker(b, { icon: makePinIcon(L, "B"), draggable: true }).addTo(map);
    lr.measurePins = [mA, mB];

    const dist = a.distanceTo(b);
    const line = L.polyline([a, b], {
      color: TACT_AMBER, weight: 2, dashArray: "12 6", opacity: 0.9,
    }).addTo(map);
    lr.measureLine = line;

    function makeLabelIcon(d) {
      return L.divIcon({
        html: `<div style="background:rgba(4,4,4,0.9);color:${TACT_AMBER};padding:3px 9px;border-radius:2px;font-size:11px;font-weight:700;white-space:nowrap;border:1px solid ${TACT_AMBER}66;font-family:'Courier New',monospace;letter-spacing:0.04em">${metersToDisplay(d)}</div>`,
        className: "", iconAnchor: [55, 10],
      });
    }

    const mid   = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
    const label = L.marker(mid, { icon: makeLabelIcon(dist), interactive: false }).addTo(map);
    lr.measureLabel = label;

    function updateMeasure() {
      const na = mA.getLatLng(), nb = mB.getLatLng();
      line.setLatLngs([na, nb]);
      const nd = na.distanceTo(nb);
      label.setLatLng(L.latLng((na.lat + nb.lat) / 2, (na.lng + nb.lng) / 2));
      label.setIcon(makeLabelIcon(nd));
      setStatus(`DISTANCE: ${metersToDisplay(nd)}`);
    }

    mA.on("drag", updateMeasure);
    mB.on("drag", updateMeasure);
    mA.on("dragend", () => saveToCache());
    mB.on("dragend", () => saveToCache());

    setStatus(`DISTANCE: ${metersToDisplay(dist)}`);
  }

  /* ── close boundary (button callback) ─────────────────────────────────── */
  function closeBoundary() {
    if (!mapRef.current) return;
    const L   = window.L;
    const map = mapRef.current;
    const lr  = layersRef.current;
    if (lr.boundaryPoints.length < 3) { setStatus("Need at least 3 points first"); return; }
    if (lr.boundaryLine) { map.removeLayer(lr.boundaryLine); lr.boundaryLine = null; }
    lr.vertexMarkers.forEach((m) => map.removeLayer(m));
    lr.vertexMarkers = [];
    const pts = [...lr.boundaryPoints];
    lr.boundaryPoints = [];
    setBoundaryPtCount(0);
    drawClosedBoundary(L, map, pts, null);
    const acres = polygonAreaM2(pts) / M2_PER_ACRE;
    setStatus(`BOUNDARY CLOSED — ${acres.toFixed(2)} acres`);
    setTool("pan");
    setTimeout(saveToCache, 50);
  }

  /* ── remove individual dock ─────────────────────────────────────────────── */
  function removeDock(num) {
    const map = mapRef.current;
    if (!map) return;
    const lr  = layersRef.current;
    const idx = lr.dockMarkers.findIndex((d) => d.num === num);
    if (idx === -1) return;
    const d = lr.dockMarkers[idx];
    map.removeLayer(d.marker);
    d.rings.forEach((r) => map.removeLayer(r));
    (d.ringLabels || []).forEach((l) => map.removeLayer(l));
    lr.dockMarkers.splice(idx, 1);
    setDockCount(lr.dockMarkers.length);
    setTimeout(saveToCache, 50);
    setStatus(`DOCK-${String(num).padStart(2, "0")} removed`);
  }

  /* ── remove boundary ────────────────────────────────────────────────────── */
  function removeBoundary() {
    const map = mapRef.current;
    if (!map) return;
    const lr  = layersRef.current;
    if (lr.boundaryPoly)  { map.removeLayer(lr.boundaryPoly);  lr.boundaryPoly  = null; }
    if (lr.boundaryLabel) { map.removeLayer(lr.boundaryLabel); lr.boundaryLabel = null; }
    lr.boundaryAcres  = null;
    lr.boundaryPoints = [];
    setAreaAcres(null);
    setTimeout(saveToCache, 50);
    setStatus("Boundary removed");
  }

  /* ── global popup callbacks (Leaflet popups are plain HTML, not React) ──── */
  useEffect(() => {
    window.__sitemapRemoveDock     = removeDock;
    window.__sitemapRemoveBoundary = removeBoundary;
    return () => {
      delete window.__sitemapRemoveDock;
      delete window.__sitemapRemoveBoundary;
    };
  }); // runs every render so closure is always fresh

  /* ── stale-closure refs ─────────────────────────────────────────────────── */
  const toolRef          = useRef(tool);
  const dockCountRef     = useRef(dockCount);
  const selectedDroneRef = useRef(selectedDrone);
  useEffect(() => { toolRef.current          = tool;          }, [tool]);
  useEffect(() => { dockCountRef.current     = dockCount;     }, [dockCount]);
  useEffect(() => { selectedDroneRef.current = selectedDrone; }, [selectedDrone]);

  /* ── map click handler ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!leafletReady || !mapRef.current) return;
    const L   = window.L;
    const map = mapRef.current;
    const lr  = layersRef.current;

    function onMapClick(e) {
      const t = toolRef.current;

      if (t === "dock") {
        const num = dockCountRef.current + 1;
        placeDock(L, map, e.latlng, num, selectedDroneRef.current);
        setDockCount(num);
        const modelLabel = DRONE_MODELS[selectedDroneRef.current]?.label || "Drone";
        setStatus(`DOCK-${String(num).padStart(2,"0")} placed [${modelLabel}] — click to add more`);
        setTimeout(saveToCache, 50);
      }

      if (t === "boundary") {
        lr.boundaryPoints.push(e.latlng);
        setBoundaryPtCount(lr.boundaryPoints.length);
        const vm = L.marker(e.latlng, { icon: makeVertexIcon(L), interactive: false }).addTo(map);
        lr.vertexMarkers.push(vm);
        if (lr.boundaryLine) map.removeLayer(lr.boundaryLine);
        lr.boundaryLine = L.polyline(lr.boundaryPoints, {
          color: TACT_WHITE, weight: 2, dashArray: "8 4", opacity: 0.75,
        }).addTo(map);
        const n = lr.boundaryPoints.length;
        setStatus(n < 3
          ? `BOUNDARY: ${n} point${n === 1 ? "" : "s"} — keep clicking to trace the edge`
          : `BOUNDARY: ${n} points — click CLOSE BOUNDARY when done`);
      }

      if (t === "measure") {
        lr._measureClicks.push(e.latlng);
        if (lr._measureClicks.length === 1) setStatus("Click second point…");
        if (lr._measureClicks.length >= 2) {
          const [a, b] = lr._measureClicks;
          lr._measureClicks = [];
          placeMeasurePoints(L, map, a, b);
          setTimeout(saveToCache, 50);
        }
      }
    }

    map.on("click", onMapClick);
    return () => { map.off("click", onMapClick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady]);

  /* ── clear all ─────────────────────────────────────────────────────────── */
  function clearAll() {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const lr  = layersRef.current;
    lr.dockMarkers.forEach(({ marker, rings, ringLabels }) => {
      map.removeLayer(marker);
      rings.forEach((r) => map.removeLayer(r));
      (ringLabels || []).forEach((l) => map.removeLayer(l));
    });
    lr.dockMarkers = [];
    lr.vertexMarkers.forEach((m) => map.removeLayer(m)); lr.vertexMarkers = [];
    if (lr.boundaryLine)  { map.removeLayer(lr.boundaryLine);  lr.boundaryLine  = null; }
    if (lr.boundaryPoly)   { map.removeLayer(lr.boundaryPoly);  lr.boundaryPoly  = null; }
    if (lr.boundaryLabel)  { map.removeLayer(lr.boundaryLabel); lr.boundaryLabel = null; }
    lr.boundaryPoints = []; lr.boundaryAcres = null;
    lr.measurePins.forEach((p) => map.removeLayer(p)); lr.measurePins = [];
    if (lr.measureLine)   { map.removeLayer(lr.measureLine);   lr.measureLine   = null; }
    if (lr.measureLabel)  { map.removeLayer(lr.measureLabel);  lr.measureLabel  = null; }
    lr._measureClicks = [];
    setDockCount(0); setAreaAcres(null); setBoundaryPtCount(0);
    onCacheUpdate && onCacheUpdate(null);
    setStatus("MAP CLEARED");
  }

  /* ── export / print ────────────────────────────────────────────────────── */
  function handleExport() {
    const map = mapRef.current;

    // Force tile refresh so nothing is blank
    if (map) { map.invalidateSize(); }

    // visibility:hidden + visibility:visible is the only CSS trick that works
    // on deeply nested elements — display:none on a parent cannot be overridden
    // by children, but visibility can.
    const style = document.createElement("style");
    style.id = "__print_map";
    style.innerHTML = `
      @media print {
        @page { size: landscape; margin: 0; }
        body * { visibility: hidden !important; }
        [data-sitemap],
        [data-sitemap] * {
          visibility: visible !important;
          /* Force browsers to print background colors & images as-is */
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        [data-sitemap] {
          position: fixed !important;
          top: 0 !important; left: 0 !important;
          width: 100vw !important; height: 100vh !important;
          z-index: 99999 !important;
          background: #000 !important;
        }
        [data-sitemap-toolbar],
        [data-sitemap-status] { display: none !important; }
        .leaflet-control-zoom,
        .leaflet-control-attribution { display: none !important; }
        .sm-ring-lbl,
        .sm-bnd-lbl { background: transparent !important; border: none !important; }
      }
    `;
    document.head.appendChild(style);

    // Short delay so tiles finish loading before the print dialog opens
    setTimeout(() => {
      window.print();
      // Clean up after dialog closes (user may take a few seconds)
      setTimeout(() => {
        const s = document.getElementById("__print_map");
        if (s) s.remove();
      }, 3000);
    }, 400);
  }

  /* ─── tool definitions ─────────────────────────────────────────────────── */
  const tools = [
    {
      id: "pan", label: "PAN",
      icon: <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
    },
    {
      id: "dock", label: "PLACE DOCK",
      icon: <svg width="13" height="13" viewBox="0 0 32 32" fill="none">
        <line x1="16" y1="16" x2="5"  y2="5"  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="16" y1="16" x2="27" y2="5"  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="16" y1="16" x2="5"  y2="27" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="16" y1="16" x2="27" y2="27" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="5"  cy="5"  r="4.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <circle cx="27" cy="5"  r="4.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <circle cx="5"  cy="27" r="4.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <circle cx="27" cy="27" r="4.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <circle cx="16" cy="16" r="4"   stroke="currentColor" strokeWidth="1.4" fill="none"/>
      </svg>,
    },
    {
      id: "boundary", label: "BOUNDARY",
      icon: <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><polygon points="7,1 13,11 1,11" stroke="currentColor" strokeWidth="1.3" fill="none" strokeDasharray="2 1"/></svg>,
    },
    {
      id: "measure", label: "MEASURE",
      icon: <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><line x1="1" y1="13" x2="13" y2="1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="1" y1="10" x2="1" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="4" y1="13" x2="1" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
    },
  ];

  const lr = layersRef.current;

  /* ─── render ──────────────────────────────────────────────────────────── */
  return (
    <div style={S.wrap} data-sitemap="1">

      {/* ── Toolbar ── */}
      <div style={S.toolbar} data-sitemap-toolbar="1">

        {/* Tool selector */}
        {tools.map((t, i) => (
          <React.Fragment key={t.id}>
            {i === 1 && <div style={S.divider} />}
            <button style={S.toolBtn(tool === t.id)} onClick={() => setTool(t.id)}>
              {t.icon}&nbsp;{t.label}
            </button>
          </React.Fragment>
        ))}

        {/* Drone selector — shown when PLACE DOCK is active */}
        {tool === "dock" && (<>
          <div style={S.divider} />
          <span style={{ fontSize: 10, color: `${TACT_RED}99`, letterSpacing: "0.06em" }}>DRONE:</span>
          <select
            style={S.droneSelect}
            value={selectedDrone}
            onChange={(e) => setSelectedDrone(e.target.value)}
          >
            {Object.entries(DRONE_MODELS).map(([key, m]) => (
              <option key={key} value={key} disabled={!m.available}>
                {m.label}{!m.available ? " (TBD)" : ""}
              </option>
            ))}
          </select>
          {DRONE_MODELS[selectedDrone]?.available && (<>
            <span style={{ fontSize: 9, color: `${TACT_RED}77`, letterSpacing: "0.05em" }}>
              {DRONE_MODELS[selectedDrone].speedMph} mph &bull; {DRONE_MODELS[selectedDrone].launchDelaySec}s launch
            </span>
          </>)}
        </>)}

        {/* Close boundary button — appears after 3 points */}
        {tool === "boundary" && boundaryPtCount >= 3 && (<>
          <div style={S.divider} />
          <button style={S.closeBoundaryBtn} onClick={closeBoundary}>
            &#10003; CLOSE BOUNDARY ({boundaryPtCount} pts)
          </button>
        </>)}

        <div style={{ flex: 1 }} />

        {/* Remove boundary button — only visible when a boundary exists */}
        {areaAcres != null && (<>
          <button style={S.removeBoundaryBtn} onClick={removeBoundary}>
            &#x2715; REMOVE BOUNDARY
          </button>
          <div style={S.divider} />
        </>)}

        {/* Map style switcher */}
        <span style={{ fontSize: 9, color: `${TACT_RED}77`, letterSpacing: "0.08em", marginRight: 2 }}>MAP:</span>
        {[
          { id: "sat",        label: "SAT" },
          { id: "street",     label: "STREET" },
          { id: "topo",       label: "TOPO" },
          { id: "earth",      label: "GOOGLE EARTH" },
          { id: "streetview", label: "STREET VIEW" },
        ].map((ms) => (
          <button
            key={ms.id}
            style={{
              padding: "4px 9px", borderRadius: 3, cursor: "pointer",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
              fontFamily: "'Courier New', monospace", textTransform: "uppercase",
              transition: "all 0.12s",
              border:      mapStyle === ms.id ? `1px solid ${TACT_RED}` : `1px solid ${TACT_RED}33`,
              background:  mapStyle === ms.id ? `${TACT_RED}18` : "transparent",
              color:       mapStyle === ms.id ? TACT_RED : `${TACT_RED}66`,
              boxShadow:   mapStyle === ms.id ? `0 0 6px ${TACT_RED}44` : "none",
            }}
            onClick={() => switchMapStyle(ms.id)}
          >
            {ms.label}
          </button>
        ))}


        <div style={S.divider} />
        <button style={S.clearBtn}  onClick={clearAll}>CLEAR ALL</button>
        <button style={S.exportBtn} onClick={handleExport}>EXPORT / PRINT</button>
      </div>

      {/* ── Locations bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
        background: "rgba(6,3,3,0.98)", borderBottom: `1px solid ${TACT_RED}22`,
        flexWrap: "wrap", minHeight: 36,
      }}>
        <span style={{ fontSize: 9, color: `${TACT_RED}88`, letterSpacing: "0.12em", fontWeight: 700, whiteSpace: "nowrap" }}>LOCATIONS:</span>

        {/* Site chips */}
        {sitesList.map((s, i) => {
          const color = SITE_PIN_COLORS[i % SITE_PIN_COLORS.length];
          return (
            <div key={s.id} style={{
              display: "flex", alignItems: "center", gap: 5,
              background: `rgba(${color === "#FF2020" ? "255,32,32" : color === "#00BFFF" ? "0,191,255" : color === "#FFD700" ? "255,215,0" : color === "#39FF14" ? "57,255,20" : "255,140,0"},0.10)`,
              border: `1px solid ${color}44`, borderRadius: 3, padding: "2px 8px 2px 6px",
              cursor: "pointer",
            }}
              onClick={() => flyToSite(s.lat, s.lng)}
              title={s.address}
            >
              <span style={{ fontSize: 9, fontWeight: 700, color, fontFamily: "'Courier New',monospace" }}>#{i + 1}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Courier New',monospace" }}>
                {s.address}
              </span>
              {s.id !== "site-primary" && (
                <span
                  style={{ fontSize: 11, color: `${color}88`, cursor: "pointer", lineHeight: 1, marginLeft: 2 }}
                  onClick={(e) => { e.stopPropagation(); removeSiteFromMap(s.id); }}
                  title="Remove location"
                >×</span>
              )}
            </div>
          );
        })}

        {/* Add location input */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
          <input
            value={addSiteInput}
            onChange={(e) => setAddSiteInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !addingSite && addSiteToMap(addSiteInput)}
            placeholder="+ Add location address…"
            style={{
              padding: "3px 10px", borderRadius: 3, width: 220,
              border: `1px solid ${TACT_RED}33`,
              background: "rgba(10,4,4,0.9)",
              color: "rgba(255,255,255,0.75)", fontSize: 10,
              fontFamily: "'Courier New', monospace",
              outline: "none",
            }}
          />
          <button
            onClick={() => !addingSite && addSiteToMap(addSiteInput)}
            disabled={addingSite || !addSiteInput.trim()}
            style={{
              padding: "3px 10px", borderRadius: 3, cursor: "pointer",
              border: `1px solid ${TACT_RED}55`, background: `${TACT_RED}18`,
              color: TACT_RED, fontSize: 10, fontWeight: 700,
              fontFamily: "'Courier New', monospace", letterSpacing: "0.05em",
              opacity: addingSite || !addSiteInput.trim() ? 0.4 : 1,
            }}
          >
            {addingSite ? "…" : "ADD"}
          </button>
        </div>
      </div>

      {/* ── Map container ── */}
      <div style={S.mapWrap}>
        {/* Leaflet map — hidden (not destroyed) when Street View iframe is active */}
        <div ref={mapContainerRef} style={{ ...S.mapEl, visibility: mapStyle === "streetview" ? "hidden" : "visible" }} />

        {/* Google Street View iframe — embedded in-app when mapStyle === "streetview" */}
        {mapStyle === "streetview" && (
          siteLatLng ? (
            <iframe
              key={`sv-${siteLatLng.lat}-${siteLatLng.lng}`}
              src={`https://maps.google.com/maps?cbll=${siteLatLng.lat},${siteLatLng.lng}&layer=c&cbp=12,0,0,0,0&hl=en&output=svembed`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", zIndex: 10 }}
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              title="Google Street View"
            />
          ) : (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: "#0a0404", zIndex: 10,
              fontFamily: "'Courier New', monospace", color: "#c0392b", fontSize: 13, letterSpacing: "0.08em",
            }}>
              LOCATING SITE… GEOCODING REQUIRED FOR STREET VIEW
            </div>
          )
        )}

        {/* ── Legend overlay ── */}
        {(dockCount > 0 || areaAcres != null || lr.measurePins.length === 2) && (
          <div style={S.legend}>
            <div style={S.legendTitle}>// SITE LEGEND</div>

            {lr.dockMarkers.map((d) => {
              const dc = d.ringColor || dockColor(d.num);
              return (
              <div key={d.num} style={S.legendRow}>
                {/* mini drone icon — matches ring color */}
                <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
                  <line x1="16" y1="16" x2="5"  y2="5"  stroke={dc} strokeWidth="2" strokeLinecap="round"/>
                  <line x1="16" y1="16" x2="27" y2="5"  stroke={dc} strokeWidth="2" strokeLinecap="round"/>
                  <line x1="16" y1="16" x2="5"  y2="27" stroke={dc} strokeWidth="2" strokeLinecap="round"/>
                  <line x1="16" y1="16" x2="27" y2="27" stroke={dc} strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="5"  cy="5"  r="4" stroke={dc} strokeWidth="1.5" fill="none"/>
                  <circle cx="27" cy="5"  r="4" stroke={dc} strokeWidth="1.5" fill="none"/>
                  <circle cx="5"  cy="27" r="4" stroke={dc} strokeWidth="1.5" fill="none"/>
                  <circle cx="27" cy="27" r="4" stroke={dc} strokeWidth="1.5" fill="none"/>
                  <circle cx="16" cy="16" r="4" stroke={dc} strokeWidth="1.5" fill="none"/>
                </svg>
                <span>
                  <span style={{ color: dc }}>DOCK-{String(d.num).padStart(2,"0")}</span>
                  &nbsp;&nbsp;
                  <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>
                    {DRONE_MODELS[d.droneKey]?.label || "DJI Dock 3"}
                  </span>
                  <br />
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>
                    {(DRONE_MODELS[d.droneKey] || DRONE_MODELS["dji-dock-3"]).ringsSec.map(fmtTime).join(" · ")}
                  </span>
                </span>
              </div>
            ); })}

            {areaAcres != null && (
              <div style={S.legendRow}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <polygon points="7,1 13,13 1,13" stroke={TACT_WHITE} strokeWidth="1.3" fill={TACT_WHITE} fillOpacity="0.12"/>
                </svg>
                <span>
                  BOUNDARY&nbsp;&nbsp;
                  <span style={{ color: TACT_WHITE }}>{areaAcres.toFixed(2)} acres</span>
                </span>
              </div>
            )}

            {lr.measurePins.length === 2 && (
              <div style={S.legendRow}>
                <svg width="14" height="2" viewBox="0 0 14 2" fill="none">
                  <line x1="0" y1="1" x2="14" y2="1" stroke={TACT_AMBER} strokeWidth="1.8" strokeDasharray="4 2"/>
                </svg>
                <span style={{ color: TACT_AMBER }}>MEASUREMENT</span>
              </div>
            )}

            {/* Site pins legend */}
            {sitesList.length > 0 && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${TACT_RED}22` }}>
                {sitesList.map((s, i) => {
                  const color = SITE_PIN_COLORS[i % SITE_PIN_COLORS.length];
                  return (
                    <div key={s.id} style={{ ...S.legendRow, cursor: "pointer" }} onClick={() => flyToSite(s.lat, s.lng)}>
                      <svg width="13" height="18" viewBox="0 0 22 30" fill="none">
                        <path d="M11 0C4.93 0 0 4.93 0 11C0 19.25 11 30 11 30C11 30 22 19.25 22 11C22 4.93 17.07 0 11 0Z"
                          fill={color} stroke="rgba(0,0,0,0.4)" strokeWidth="1.2"/>
                        <circle cx="11" cy="11" r="6" fill="rgba(0,0,0,0.5)"/>
                        <text x="11" y="15" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold"
                          fontFamily="'Courier New',monospace">{i + 1}</text>
                      </svg>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", maxWidth: 155, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.address}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      <div style={S.statusBar} data-sitemap-status="1">
        <span style={{ color: TACT_RED, fontWeight: 700, letterSpacing: "0.1em" }}>[ SITEMAPPER ]</span>
        <span style={{ color: TACT_DIM }}>{status}</span>
        <span style={{ marginLeft: "auto", color: TACT_DIM, opacity: 0.6 }}>
          {coords ? `LAT ${coords.lat.toFixed(5)}  LNG ${coords.lng.toFixed(5)}` : ""}
        </span>
        {dockCount > 0 && (
          <span style={{ color: TACT_RED }}>DOCKS: {dockCount}</span>
        )}
      </div>
    </div>
  );
}
