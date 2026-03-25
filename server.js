const dotenv = require("dotenv");
const result = dotenv.config();
const envVars = result.parsed || {};

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = envVars.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json({ limit: "1mb" }));

app.post("/api/claude", async (req, res) => {
  if (!API_KEY || API_KEY === "your-key-here") {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in .env file" });
  }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Geocode proxy — Census Bureau (primary) → Nominatim (fallback)
app.get("/api/geocode", async (req, res) => {
  const address = req.query.address;
  if (!address) return res.status(400).json({ error: "address required" });

  // 1) US Census Bureau
  try {
    const params = new URLSearchParams({ address, benchmark: "Public_AR_Current", format: "json" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const r = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`, { signal: controller.signal });
      const data = await r.json();
      const match = data?.result?.addressMatches?.[0];
      if (match) {
        return res.json({ lat: match.coordinates.y, lng: match.coordinates.x, display: match.matchedAddress, source: "US Census Bureau" });
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (_) { /* fall through */ }

  // 2) Nominatim fallback
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`, {
      headers: { "User-Agent": "DXD-Deployment-Tracker/1.0" },
    });
    const data = await r.json();
    if (data.length) {
      return res.json({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name, source: "OpenStreetMap" });
    }
  } catch (_) { /* fall through */ }

  res.status(404).json({ error: "Location not found. Try a more specific address." });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", hasKey: !!API_KEY && API_KEY !== "your-key-here" });
});

// Serve React build in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "build")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "build", "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`\n  DXD Server running on port ${PORT}`);
  console.log(`  API Key: ${API_KEY && API_KEY !== "your-key-here" ? "configured" : "NOT SET -- edit .env file"}\n`);
});
