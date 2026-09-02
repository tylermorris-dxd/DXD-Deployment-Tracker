// Tactical loading phrases used in place of the default "Loading..."
// string. Callers pull one at random per render — no rotation state.
// Free personality per unit of shipping effort.

const PHRASES: string[] = [
  'SCANNING AIRSPACE',
  'ACQUIRING TARGETS',
  'GEOCODING WAYPOINTS',
  'BUILDING TASK QUEUE',
  'RETRIEVING TELEMETRY',
  'AUTHENTICATING OPERATOR',
  'CROSS-REFERENCING FLEET',
  'SYNCING PIPELINE STATE',
  'READING DECK POSTURE',
  'VERIFYING PERIMETER',
]

export function pickLoadingPhrase(): string {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)]
}
