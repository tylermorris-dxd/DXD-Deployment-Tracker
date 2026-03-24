import React, { useState, useCallback, useEffect, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// Fix default marker icon issue with webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const FAA_UASFM_URL = "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0/query";

const CEILING_COLORS = {
  0: { fill: "#e74c3c", label: "0 ft — NO FLY", verdict: "NO-FLY" },
  50: { fill: "#e67e22", label: "50 ft AGL", verdict: "RESTRICTED" },
  100: { fill: "#f39c12", label: "100 ft AGL", verdict: "RESTRICTED" },
  150: { fill: "#f1c40f", label: "150 ft AGL", verdict: "LIMITED" },
  200: { fill: "#2ecc71", label: "200 ft AGL", verdict: "AUTHORIZED" },
  250: { fill: "#27ae60", label: "250 ft AGL", verdict: "AUTHORIZED" },
  300: { fill: "#1abc9c", label: "300 ft AGL", verdict: "AUTHORIZED" },
  350: { fill: "#17a2b8", label: "350 ft AGL", verdict: "AUTHORIZED" },
  400: { fill: "#3498db", label: "400 ft AGL", verdict: "FULL ACCESS" },
};

const AIRSPACE_INFO = {
  G: { name: "Class G", color: "#2ecc71", desc: "Uncontrolled airspace. No ATC authorization required for Part 107 under 400ft AGL.", verdict: "GOOD TO GO" },
  E: { name: "Class E", color: "#9b59b6", desc: "Controlled airspace (surface area). LAANC or DroneZone authorization required.", verdict: "AUTHORIZATION REQUIRED" },
  D: { name: "Class D", color: "#3498db", desc: "Controlled airspace around towered airports. LAANC or DroneZone authorization required.", verdict: "AUTHORIZATION REQUIRED" },
  C: { name: "Class C", color: "#e67e22", desc: "Controlled airspace around busy airports. LAANC or DroneZone authorization required.", verdict: "AUTHORIZATION REQUIRED" },
  B: { name: "Class B", color: "#e74c3c", desc: "Most restrictive controlled airspace (major airports). LAANC or DroneZone authorization required.", verdict: "HIGHLY RESTRICTED" },
};

// ─── GEOCODE ──────────────────────────────────────────────────────────────
// Nominatim direct geocode (same pattern as ConnectivityView)
async function geocodeAddress(address) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
    { headers: { "Accept-Language": "en", "User-Agent": "DXD-Deployment-Tracker/1.0" } }
  );
  const data = await res.json();
  if (!data.length) throw new Error("Location not found. Try a more specific address.");
  const { lat, lon, display_name } = data[0];
  return { lat: parseFloat(lat), lng: parseFloat(lon), display: display_name, source: "Nominatim" };
}

// ─── QUERY FAA UASFM ─────────────────────────────────────────────────────
async function queryFAAGrids(lat, lng, radiusMeters = 8047) {
  // Query grids within a bounding box around the point
  const degOffset = radiusMeters / 111000;
  const bbox = `${lng - degOffset},${lat - degOffset},${lng + degOffset},${lat + degOffset}`;
  const params = new URLSearchParams({
    where: "1=1",
    geometry: bbox,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "CEILING,REGION,AIRS_COUNT,AIRSPACE_1,AIRSPACE_2,AIRSPACE_3,APT1_FAAID,APT1_ICAO,APT1_NAME,APT1_LAANC,APT2_FAAID,APT2_NAME,APT2_LAANC,UNIT",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
    resultRecordCount: "500",
  });
  const res = await fetch(`${FAA_UASFM_URL}?${params}`);
  if (!res.ok) throw new Error("FAA API query failed");
  const data = await res.json();
  return data;
}

// Find which grid the exact point falls in
function findPointGrid(geojson, lat, lng) {
  if (!geojson || !geojson.features) return null;
  const pt = L.latLng(lat, lng);
  for (const feature of geojson.features) {
    if (!feature.geometry) continue;
    try {
      const layer = L.geoJSON(feature);
      const bounds = layer.getBounds();
      if (bounds.contains(pt)) return feature;
    } catch { /* skip invalid geometry */ }
  }
  return null;
}

// ─── MAP FLY-TO COMPONENT ─────────────────────────────────────────────────
function MapFlyTo({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom || 14, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
}

// ─── GRID STYLE ───────────────────────────────────────────────────────────
function gridStyle(feature) {
  const ceiling = feature?.properties?.CEILING;
  const info = CEILING_COLORS[ceiling] || CEILING_COLORS[0];
  return {
    color: info.fill,
    weight: 1.5,
    opacity: 0.8,
    fillColor: info.fill,
    fillOpacity: 0.25,
  };
}

function gridPopup(feature, layer) {
  const p = feature.properties;
  const ceiling = p.CEILING ?? "N/A";
  const info = CEILING_COLORS[ceiling] || { label: `${ceiling} ft`, verdict: "UNKNOWN" };
  const airports = [];
  if (p.APT1_NAME) airports.push(`${p.APT1_NAME} (${p.APT1_ICAO || p.APT1_FAAID})${p.APT1_LAANC ? " \u2713 LAANC" : ""}`);
  if (p.APT2_NAME) airports.push(`${p.APT2_NAME} (${p.APT2_FAAID})${p.APT2_LAANC ? " \u2713 LAANC" : ""}`);
  const airspaces = [p.AIRSPACE_1, p.AIRSPACE_2, p.AIRSPACE_3].filter(Boolean).join(", ");
  layer.bindPopup(`
    <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;min-width:200px">
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:${info.fill}">${info.label}</div>
      <div style="margin-bottom:4px"><b>Status:</b> ${info.verdict}</div>
      ${airspaces ? `<div style="margin-bottom:4px"><b>Airspace:</b> ${airspaces}</div>` : ""}
      ${airports.length ? `<div style="margin-bottom:4px"><b>Airport(s):</b><br/>${airports.join("<br/>")}</div>` : ""}
      ${p.REGION ? `<div><b>Region:</b> ${p.REGION}</div>` : ""}
    </div>
  `);
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────
export default function AirspaceIntel({ defaultLocation, cachedData, onCacheUpdate }) {
  const [query, setQuery] = useState(defaultLocation || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [coords, setCoords] = useState(cachedData?.coords || null);
  const [displayName, setDisplayName] = useState(cachedData?.displayName || null);
  const [gridData, setGridData] = useState(cachedData?.gridData || null);
  const [pointGrid, setPointGrid] = useState(cachedData?.pointGrid || null);
  const [mapCenter, setMapCenter] = useState(cachedData?.coords ? [cachedData.coords.lat, cachedData.coords.lng] : [39.5, -98.35]);
  const [mapZoom, setMapZoom] = useState(cachedData?.coords ? 12 : 5);
  const mapRef = useRef(null);

  const handleSearch = useCallback(async (locationOverride) => {
    const loc = (locationOverride || query).trim();
    if (!loc) return;
    setLoading(true);
    setError(null);
    setGridData(null);
    setPointGrid(null);
    setCoords(null);
    setDisplayName(null);
    try {
      // Step 1: Geocode
      const geo = await geocodeAddress(loc);
      setCoords(geo);
      setDisplayName(geo.display);
      setMapCenter([geo.lat, geo.lng]);
      setMapZoom(12);

      // Step 2: Query FAA
      const grids = await queryFAAGrids(geo.lat, geo.lng);
      setGridData(grids);

      // Step 3: Find exact grid
      const exact = findPointGrid(grids, geo.lat, geo.lng);
      setPointGrid(exact);

      if (onCacheUpdate) onCacheUpdate({ coords: geo, displayName: geo.display, gridData: grids, pointGrid: exact });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [query, onCacheUpdate]);

  // Auto-fetch on mount if no cached data and location is available
  useEffect(() => {
    if (!cachedData && defaultLocation) handleSearch(defaultLocation);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKey = (e) => { if (e.key === "Enter") handleSearch(); };

  // Derive airspace info
  const ceilingVal = pointGrid?.properties?.CEILING;
  const ceilingInfo = ceilingVal !== undefined && ceilingVal !== null ? CEILING_COLORS[ceilingVal] : null;
  const airspaceType = pointGrid?.properties?.AIRSPACE_1?.replace(/Class\s*/i, "").trim().charAt(0).toUpperCase();
  const airspaceInfo = airspaceType ? AIRSPACE_INFO[airspaceType] : null;
  const isClassG = !pointGrid || (coords && !gridData?.features?.length);
  // const laancEnabled = pointGrid?.properties?.APT1_LAANC === 1;

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, background: "linear-gradient(135deg, #3498db, #2471a3)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2l8 6v10H4V8l8-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M2 22h20M8 14h8M10 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1, fontFamily: "'Chakra Petch', sans-serif" }}>AIRSPACE ANALYSIS</h2>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 1.5, marginTop: 2 }}>FAA UAS FACILITY MAP · LAANC GRID DATA · LIVE QUERY</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, background: "rgba(30,30,34,0.8)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 6 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKey}
          placeholder="Enter address — e.g. 1234 Main St, Dallas, TX"
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f1f1f1", fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, padding: "10px 14px", letterSpacing: 0.5 }} />
        <button onClick={() => handleSearch()} disabled={loading}
          style={{ background: loading ? "rgba(52,152,219,0.3)" : "linear-gradient(135deg, #3498db, #2471a3)", border: "none", borderRadius: 6, color: "#fff", fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 600, padding: "10px 24px", cursor: loading ? "wait" : "pointer", letterSpacing: 1, textTransform: "uppercase" }}>
          {loading ? "SCANNING..." : "SCAN AIRSPACE"}
        </button>
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 20, paddingLeft: 4 }}>
        Queries FAA UAS Facility Map in real-time · ESRI satellite imagery · LAANC grid altitude ceilings
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ background: "rgba(52,152,219,0.08)", border: "1px solid rgba(52,152,219,0.2)", borderRadius: 8, padding: "14px 18px", marginBottom: 20, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#3498db", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 16, height: 16, border: "2px solid #3498db", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Querying FAA airspace data...
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: "rgba(231,76,60,0.1)", border: "1px solid rgba(231,76,60,0.3)", borderRadius: 8, padding: "14px 18px", marginBottom: 20, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#e74c3c", wordBreak: "break-word" }}>
          {error}
        </div>
      )}

      {/* Results */}
      {coords && !loading && (
        <div style={{ animation: "fadeSlideIn 0.5s ease" }}>
          {/* Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
            {/* Verdict Card */}
            <div style={{ background: "linear-gradient(135deg, rgba(30,30,34,0.95), rgba(22,22,26,0.98))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${isClassG ? "#2ecc71" : (ceilingInfo?.fill || "#e74c3c")}, transparent)` }} />
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>DEPLOYMENT VERDICT</div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 22, fontWeight: 700, color: isClassG ? "#2ecc71" : (ceilingInfo?.fill || "#e74c3c"), lineHeight: 1.2 }}>
                {isClassG ? "GOOD TO GO" : (ceilingInfo?.verdict || "CHECK REQUIRED")}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
                {isClassG ? "Class G — No authorization needed under 400ft" : `Controlled airspace — Max ${ceilingVal}ft AGL`}
              </div>
            </div>

            {/* Airspace Class */}
            <div style={{ background: "linear-gradient(135deg, rgba(30,30,34,0.95), rgba(22,22,26,0.98))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${isClassG ? "#2ecc71" : (airspaceInfo?.color || "#95a5a6")}, transparent)` }} />
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>AIRSPACE CLASS</div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 28, fontWeight: 700, color: "#f1f1f1" }}>
                {isClassG ? "G" : (airspaceType || "?")}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
                {isClassG ? "Uncontrolled" : (airspaceInfo?.name || "Unknown")}
              </div>
            </div>

            {/* Altitude Ceiling */}
            <div style={{ background: "linear-gradient(135deg, rgba(30,30,34,0.95), rgba(22,22,26,0.98))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${isClassG ? "#3498db" : (ceilingInfo?.fill || "#e74c3c")}, transparent)` }} />
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>MAX ALTITUDE</div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 28, fontWeight: 700, color: "#f1f1f1" }}>
                {isClassG ? "400" : (ceilingVal ?? "?")}<span style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", marginLeft: 4 }}>ft AGL</span>
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
                {isClassG ? "Standard Part 107 ceiling" : "Per FAA UAS Facility Map"}
              </div>
            </div>

            {/* DroneZone Authorization */}
            <div style={{ background: "linear-gradient(135deg, rgba(30,30,34,0.95), rgba(22,22,26,0.98))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${isClassG ? "#2ecc71" : "#e67e22"}, transparent)` }} />
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>FAA DRONEZONE</div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 22, fontWeight: 700, color: isClassG ? "#2ecc71" : "#e67e22" }}>
                {isClassG ? "NOT REQUIRED" : "REQUIRED"}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
                {isClassG ? "Class G — no airspace authorization needed" : "Controlled airspace — submit via FAA DroneZone or LAANC"}
              </div>
            </div>
          </div>

          {/* Airport Info */}
          {pointGrid?.properties?.APT1_NAME && (
            <div style={{ background: "rgba(30,30,34,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "16px 18px", marginBottom: 20 }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>CONTROLLING AIRPORT(S)</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[1, 2].map((n) => {
                  const name = pointGrid.properties[`APT${n}_NAME`];
                  if (!name) return null;
                  const icao = pointGrid.properties[`APT${n}_ICAO`] || pointGrid.properties[`APT${n}_FAAID`] || "";
                  const laanc = pointGrid.properties[`APT${n}_LAANC`] === 1;
                  return (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, background: "rgba(52,152,219,0.15)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="rgba(52,152,219,0.8)"/></svg></div>
                      <div>
                        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, fontWeight: 600, color: "#f1f1f1" }}>{name}</div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", display: "flex", gap: 8 }}>
                          <span>{icao}</span>
                          <span style={{ color: laanc ? "#2ecc71" : "#e67e22" }}>{laanc ? "LAANC Enabled" : "No LAANC"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Airspace Description */}
          {!isClassG && airspaceInfo && (
            <div style={{ background: `rgba(${airspaceType === 'B' ? '231,76,60' : airspaceType === 'C' ? '230,126,34' : '52,152,219'},0.08)`, border: `1px solid rgba(${airspaceType === 'B' ? '231,76,60' : airspaceType === 'C' ? '230,126,34' : '52,152,219'},0.2)`, borderRadius: 8, padding: "14px 18px", marginBottom: 20, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
              <strong style={{ color: airspaceInfo.color }}>{airspaceInfo.name} Airspace:</strong> {airspaceInfo.desc}
            </div>
          )}

          {/* MAP */}
          <div style={{ background: "rgba(30,30,34,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5 }}>
                SATELLITE VIEW · FAA UASFM GRID OVERLAY
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </div>
            </div>
            <div style={{ height: 500 }}>
              <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: "100%", width: "100%" }} ref={mapRef}>
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution='&copy; <a href="https://www.esri.com">Esri</a> World Imagery'
                  maxZoom={19}
                />
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                  opacity={0.6}
                />
                <MapFlyTo center={[coords.lat, coords.lng]} zoom={14} />
                {gridData && gridData.features && (
                  <GeoJSON data={gridData} style={gridStyle} onEachFeature={gridPopup} />
                )}
                <Marker position={[coords.lat, coords.lng]}>
                  <Popup>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                      <strong>Target Location</strong><br />
                      {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                    </div>
                  </Popup>
                </Marker>
              </MapContainer>
            </div>
          </div>

          {/* Altitude Legend */}
          <div style={{ background: "rgba(30,30,34,0.5)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 8, padding: "16px 18px", marginBottom: 20 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>UASFM Altitude Ceiling Legend</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(CEILING_COLORS).map(([val, info]) => (
                <div key={val} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: info.fill, opacity: 0.7 }} />
                  {info.label}
                </div>
              ))}
            </div>
          </div>

          {/* Location */}
          {displayName && (
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center", padding: "8px 0" }}>
              Resolved via {coords.source}: {displayName}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!coords && !loading && !error && (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "rgba(255,255,255,0.2)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, marginBottom: 16, opacity: 0.3, fontFamily: "'Chakra Petch', sans-serif" }}>AIRSPACE</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>AWAITING TARGET LOCATION</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>Enter a deployment address to scan FAA airspace and LAANC grid data</div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
