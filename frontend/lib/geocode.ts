// Shared geocoder used by AirspaceIntel, SiteMapper, WeatherIntel,
// ConnectivityView so they all resolve to the same coordinates for any
// given address.
//
// Strategy:
//   1. Direct coordinate passthrough ("lat, lng")
//   2. Google Maps (if NEXT_PUBLIC_GOOGLE_MAPS_KEY is set)
//   3. US Census Bureau — authoritative for US street addresses,
//      called via JSONP because Census does NOT send CORS headers.
//      Without JSONP, every browser fetch() silently fails and we fall
//      through to Nominatim, which has poor coverage of newer/specific
//      US street addresses.
//   4. Nominatim — global, good for venue names and international.

export interface GeocodeResult {
  lat: number
  lng: number
  displayName: string
  source: 'Direct' | 'Google' | 'Census' | 'Nominatim'
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 8000): Promise<Response> {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(id) }
}

// Census Bureau API doesn't support CORS — must use JSONP via <script> tag.
// Returns null on timeout or no match.
function censusGeocodeJSONP(
  address: string,
  timeoutMs = 9000,
): Promise<{ lat: number; lng: number; matchedAddress: string } | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(null); return }
    const cbName = `__census_cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=jsonp&callback=${cbName}`
    const script = document.createElement('script')
    const cleanup = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { delete (window as any)[cbName] } catch { /* ignore */ }
      if (script.parentNode) script.parentNode.removeChild(script)
    }
    const timer = setTimeout(() => { cleanup(); resolve(null) }, timeoutMs)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any)[cbName] = (data: any) => {
      clearTimeout(timer)
      cleanup()
      const m = data?.result?.addressMatches?.[0]
      if (m && m.coordinates) {
        resolve({ lat: m.coordinates.y, lng: m.coordinates.x, matchedAddress: m.matchedAddress })
      } else {
        resolve(null)
      }
    }
    script.onerror = () => { clearTimeout(timer); cleanup(); resolve(null) }
    script.src = url
    document.head.appendChild(script)
  })
}

export async function geocodeAddress(input: string): Promise<GeocodeResult | null> {
  const q = (input || '').trim()
  if (!q) return null

  // 0) Direct coordinate passthrough
  const m = q.match(/^(-?\d{1,3}\.?\d*)[,\s]+(-?\d{1,3}\.?\d*)$/)
  if (m) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2])
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)
      return { lat, lng, displayName: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, source: 'Direct' }
  }

  // 1) Google Maps (if key present)
  const GKEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''
  if (GKEY) {
    try {
      const r = await fetchWithTimeout(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${GKEY}`)
      const d = await r.json()
      if (d.status === 'OK' && d.results.length > 0) {
        const loc = d.results[0].geometry.location
        return { lat: loc.lat, lng: loc.lng, displayName: d.results[0].formatted_address, source: 'Google' }
      }
    } catch (_) { /* fall through */ }
  }

  // 2) US Census Bureau via JSONP (authoritative for US street addresses)
  const census = await censusGeocodeJSONP(q)
  if (census) return { lat: census.lat, lng: census.lng, displayName: census.matchedAddress, source: 'Census' }

  // 3) Nominatim (international + venue names)
  try {
    const qs = new URLSearchParams({
      format: 'json', limit: '1', q,
      addressdetails: '1',
      email: 'tyler.morris@deusxdefense.com',
    })
    const r = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?${qs}`,
      { headers: { 'Accept-Language': 'en' } },
    )
    const data = await r.json()
    if (Array.isArray(data) && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name as string,
        source: 'Nominatim',
      }
    }
  } catch (_) { /* fall through */ }

  return null
}

// Convenience helper that throws instead of returning null, for callers
// that want try/catch flow.
export async function geocodeAddressOrThrow(input: string): Promise<GeocodeResult> {
  const r = await geocodeAddress(input)
  if (!r) throw new Error('Location not found — try a full street address with city + state, or paste coordinates as "lat, lng"')
  return r
}
