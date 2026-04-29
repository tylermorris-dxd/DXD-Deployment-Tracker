import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ error: 'missing q' }, { status: 400 })

  const params = new URLSearchParams({
    format: 'json',
    limit: '1',
    q,
    addressdetails: '1',
    email: 'tyler.morris@deusxdefense.com',
  })

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        'User-Agent': 'DXD-Deployment-Tracker/1.0 (tyler.morris@deusxdefense.com)',
        'Accept-Language': 'en',
        'Accept': 'application/json',
      },
      next: { revalidate: 86400 }, // cache results for 24h
    })
    if (!res.ok) return NextResponse.json({ error: `Nominatim error ${res.status}` }, { status: 502 })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
