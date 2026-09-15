// Weekly ingest of FCC bulk data into the rf_emitters table (Postgres).
//
//   cd scripts/ingest-fcc && npm install
//   DATABASE_URL=postgres://... npx tsx fcc-ingest.ts            # all sources
//   DATABASE_URL=postgres://... npx tsx fcc-ingest.ts asr        # subset
//
// Full reload per source, wrapped in a transaction, so a failed run leaves the
// prior week's data intact.
//
// =====================================================================================
// FIELD INDICES — VERIFIED 2026-09-14 against live FCC downloads, not inferred.
//
// The ULS maps (HD / LO / FR) were already correct. The ASR maps (CO / RA / EN) were
// NOT, and would have produced garbage coordinates and heights:
//
//   CO  lat was read from the coordinate-type field; lon was read from the latitude
//       direction and the lat-in-total-seconds field. Real layout puts latD at 6 and
//       lonD at 11, because a type code precedes the latitude and a total-seconds
//       value sits between the latitude and longitude groups.
//   RA  overall height was read from an application date. Real index is 30.
//   EN  owner name was read from an empty slot. Real index is 9.
//
// Validated by full parse of r_tower.zip: 202,595 of 202,721 structures usable,
// 98.1% inside the CONUS bounding box, median height 61 m, owners resolving to
// American Towers / Crown Castle / etc. Re-run that sanity check after any FCC
// layout change. Every index below is 0-based into the pipe-split row.
// =====================================================================================

import { Client } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import * as unzipper from 'unzipper';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { Readable, pipeline } from 'node:stream';
import { promisify } from 'node:util';

const pipe = promisify(pipeline);

// ---- source config -------------------------------------------------------------------

const ULS_BASE = process.env.FCC_ULS_BASE ?? 'https://data.fcc.gov/download/pub/uls/complete';
// ULS weekly complete files, scoped to the services that threaten the DXD bands.
// FCC_ULS_FILES narrows the set — useful for a fast dry run, since the full
// pull is roughly 700 MB.
const ULS_FILES = (process.env.FCC_ULS_FILES ?? 'l_LMpriv.zip,l_LMcomm.zip,l_paging.zip,l_micro.zip')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ASR_URL = process.env.FCC_ASR_URL ?? `${ULS_BASE}/r_tower.zip`;

// ULS record field indices (0-based). Verified correct as written.
const HD = { usi: 1, callSign: 4, status: 5, service: 6 }; // status 'A' = active
const LO = {
  usi: 1, locNum: 8, address: 11, city: 12, state: 14,
  groundElev: 18,
  latD: 19, latM: 20, latS: 21, latDir: 22,
  lonD: 23, lonM: 24, lonS: 25, lonDir: 26,
  supportHeightM: 38, overallHeightM: 39,
};
const FR = { usi: 1, locNum: 6, freqAssigned: 10, powerOutput: 15, powerErp: 16 };

// ASR record field indices (0-based). CORRECTED — see the block above.
// Join key is the Unique System Identifier at [3]; [2] is the human-facing
// registration number (Annnnnnn) used for display.
const CO = {
  usi: 3, reg: 2,
  latD: 6, latM: 7, latS: 8, latDir: 9,
  lonD: 11, lonM: 12, lonS: 13, lonDir: 14,
};
const RA = { usi: 3, structHeightM: 28, groundElevM: 29, overallHeightM: 30 };
const EN_REG = { usi: 3, name: 9 };

// ---- helpers -------------------------------------------------------------------------

function dms(d: string, m: string, s: string, dir: string): number | null {
  const D = parseFloat(d);
  if (!isFinite(D)) return null;
  const M = parseFloat(m), S = parseFloat(s);
  let v = D + (isFinite(M) ? M / 60 : 0) + (isFinite(S) ? S / 3600 : 0);
  const u = (dir || '').toUpperCase();
  if (u === 'S' || u === 'W') v = -v;
  return v;
}

const wattsToDbw = (w: number) => (w > 0 ? 10 * Math.log10(w) : null);

// The tallest antenna structure ever built was ~646 m. Anything above this cap
// is a mis-keyed record (ULS height fields sometimes carry site elevation),
// and a bogus height would inflate the radio horizon and flip the LOS factor.
const MAX_STRUCTURE_M = 700;

function sanitizeHeight(v: number): number | null {
  return isFinite(v) && v > 0 && v <= MAX_STRUCTURE_M ? v : null;
}

function validCoord(lat: number | null, lon: number | null): boolean {
  return (
    lat != null && lon != null &&
    isFinite(lat) && isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

// Streamed to disk — l_LMpriv is over 400 MB and must not be buffered in memory.
async function download(url: string, dest: string): Promise<void> {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`download ${url} -> ${r.status}`);
  await pipe(Readable.fromWeb(r.body as any), fs.createWriteStream(dest));
}

async function extractDat(zipPath: string, outDir: string, names: string[]): Promise<void> {
  const dir = await unzipper.Open.file(zipPath);
  for (const entry of dir.files) {
    const base = path.basename(entry.path).toUpperCase();
    if (names.some((n) => base === n.toUpperCase())) {
      await pipe(entry.stream(), fs.createWriteStream(path.join(outDir, base)));
    }
  }
}

/**
 * Stream a pipe-delimited .dat, invoking cb(fields) per row of the given record
 * type. The callback may be async — awaiting it is what gives the ULS pass
 * backpressure while it flushes batches into COPY.
 */
async function eachRow(
  file: string,
  recordType: string,
  cb: (f: string[]) => void | Promise<void>,
): Promise<void> {
  if (!fs.existsSync(file)) return;
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });
  const prefix = recordType + '|';
  for await (const line of rl) {
    if (!line.startsWith(prefix)) continue;
    const r = cb(line.split('|'));
    if (r) await r;
  }
}

interface Row {
  id: string;
  source: 'asr' | 'uls' | 'broadcast';
  name: string;
  lat: number;
  lon: number;
  freqMhz: number | null;
  erpDbw: number | null;
  heightM: number | null;
}

// ---- ULS parse -----------------------------------------------------------------------

const ULS_BATCH = 50_000;

// Streams straight into the sink rather than returning an array.
//
// The location x frequency cross product for l_LMpriv alone is tens of millions
// of rows; materialising it exhausted a 4 GB heap before a single row reached
// the database. Frequencies are read last and emitted as they are encountered,
// so nothing larger than one batch is ever held. Returns the row count.
async function streamUls(dir: string, sink: Sink): Promise<number> {
  const active = new Map<string, { call: string; service: string }>();
  await eachRow(path.join(dir, 'HD.DAT'), 'HD', (f) => {
    if ((f[HD.status] || '').toUpperCase() === 'A') {
      active.set(f[HD.usi], { call: f[HD.callSign] || '', service: f[HD.service] || '' });
    }
  });

  // Keyed by licence AND location number, because a frequency authorisation is
  // granted at a specific location — not at every location on the licence.
  // Cross-producting the two inflated the load 21x and, worse, placed
  // transmitters at sites they do not operate from: one paging licence has 140
  // locations and 141 frequency records, and every frequency was being planted
  // at every site. Verified against l_paging: 100% of FR records carry a
  // locNum that matches an LO record on the same licence.
  //
  // Height comes from the location record. The pre-port version discarded it,
  // which made every ULS emitter a zero-height antenna and the radio-horizon
  // LOS test far too pessimistic.
  const locs = new Map<string, { lat: number; lon: number; heightM: number | null }>();
  await eachRow(path.join(dir, 'LO.DAT'), 'LO', (f) => {
    const usi = f[LO.usi];
    if (!active.has(usi)) return;
    const lat = dms(f[LO.latD], f[LO.latM], f[LO.latS], f[LO.latDir]);
    const lon = dms(f[LO.lonD], f[LO.lonM], f[LO.lonS], f[LO.lonDir]);
    if (!validCoord(lat, lon)) return;
    const h = parseFloat(f[LO.overallHeightM]) || parseFloat(f[LO.supportHeightM]);
    locs.set(`${usi}:${f[LO.locNum]}`, { lat: lat!, lon: lon!, heightM: sanitizeHeight(h) });
  });

  let emitted = 0;
  let frIdx = 0;
  let orphaned = 0;
  let batch: Row[] = [];

  await eachRow(path.join(dir, 'FR.DAT'), 'FR', async (f) => {
    const usi = f[FR.usi];
    const meta = active.get(usi);
    if (!meta) return;
    const freq = parseFloat(f[FR.freqAssigned]);
    if (!isFinite(freq) || freq <= 0) return;

    const loc = locs.get(`${usi}:${f[FR.locNum]}`);
    // No matching location record. Skipped rather than guessed — inventing
    // coordinates for a transmitter is worse than omitting it.
    if (!loc) { orphaned++; return; }

    const erpW = parseFloat(f[FR.powerErp]) || parseFloat(f[FR.powerOutput]) || 0;
    batch.push({
      id: `uls:${usi}:${f[FR.locNum]}:${frIdx++}`,
      source: 'uls',
      name: `${meta.service} ${meta.call}`.trim() || `ULS ${usi}`,
      lat: loc.lat, lon: loc.lon,
      freqMhz: freq, erpDbw: wattsToDbw(erpW), heightM: loc.heightM,
    });

    if (batch.length >= ULS_BATCH) {
      await sink.write(batch);
      emitted += batch.length;
      batch = [];
    }
  });

  if (batch.length) {
    await sink.write(batch);
    emitted += batch.length;
  }
  if (orphaned) {
    console.log(`    (${orphaned.toLocaleString()} frequency records had no matching location)`);
  }
  return emitted;
}

// ---- ASR parse -----------------------------------------------------------------------

async function parseAsr(dir: string): Promise<Row[]> {
  const coords = new Map<string, { lat: number; lon: number; reg: string }>();
  await eachRow(path.join(dir, 'CO.DAT'), 'CO', (f) => {
    if (f.length <= CO.lonDir) return;
    const usi = f[CO.usi];
    if (coords.has(usi)) return; // first coordinate record per structure wins
    const lat = dms(f[CO.latD], f[CO.latM], f[CO.latS], f[CO.latDir]);
    const lon = dms(f[CO.lonD], f[CO.lonM], f[CO.lonS], f[CO.lonDir]);
    if (!validCoord(lat, lon)) return;
    coords.set(usi, { lat: lat!, lon: lon!, reg: f[CO.reg] || usi });
  });

  const height = new Map<string, number>();
  await eachRow(path.join(dir, 'RA.DAT'), 'RA', (f) => {
    if (f.length <= RA.overallHeightM) return;
    const h = sanitizeHeight(parseFloat(f[RA.overallHeightM]));
    if (h != null) height.set(f[RA.usi], h);
  });

  const owner = new Map<string, string>();
  await eachRow(path.join(dir, 'EN.DAT'), 'EN', (f) => {
    if (f.length <= EN_REG.name) return;
    const n = (f[EN_REG.name] || '').trim();
    if (n) owner.set(f[EN_REG.usi], n);
  });

  const rows: Row[] = [];
  for (const [usi, c] of coords) {
    const own = owner.get(usi);
    rows.push({
      id: `asr:${usi}`,
      source: 'asr',
      name: `ASR ${c.reg}${own ? ' · ' + own : ''}`,
      lat: c.lat, lon: c.lon,
      // Bare structure — the registration says nothing about what transmits
      // from it. Survey scoring skips null-frequency rows; these are carried
      // for "there is a tall thing here" context.
      freqMhz: null,
      erpDbw: null,
      heightM: height.get(usi) ?? null,
    });
  }
  return rows;
}

// ---- Broadcast parse (FM/TV) ---------------------------------------------------------
// Broadcast is NOT in ULS. It comes from the FCC Media Bureau (CDBS engineering files or
// the current LMS extract). Left as a documented seam: implement fetch+map here and it
// flows through the same loader. FM/TV matter mainly as high-power out-of-band desense.
async function parseBroadcast(_dir: string): Promise<Row[]> {
  return [];
}

// ---- DB load -------------------------------------------------------------------------

// Postgres COPY text format: backslash is the escape character, and tab /
// newline / carriage return must be escaped or they break the row framing.
function esc(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function num(v: number | null): string {
  return v == null || !isFinite(v) ? '\\N' : String(v);
}

// Rows are streamed into COPY as each source file is parsed rather than
// accumulated first. The full ULS pull is tens of millions of rows across four
// archives — holding them to hand off in one array both exhausts the heap and
// overflows the call stack on `push(...rows)`.
interface Sink {
  write(rows: Row[]): Promise<void>;
  finish(): Promise<void>;
}

async function makeDbSink(client: Client, source: string): Promise<Sink> {
  const updatedAt = new Date().toISOString();
  let count = 0;

  await client.query('BEGIN');
  await client.query('DELETE FROM rf_emitters WHERE source = $1', [source]);

  const stream = client.query(
    copyFrom(
      `COPY rf_emitters (id, source, name, lat, lon, freq_mhz, erp_dbw, height_agl_m, updated_at) FROM STDIN`,
    ),
  ) as any;

  const done = new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return {
    async write(rows: Row[]) {
      for (const r of rows) {
        const line =
          [
            esc(r.id),
            esc(r.source),
            esc(r.name.slice(0, 200)),
            String(r.lat),
            String(r.lon),
            num(r.freqMhz),
            num(r.erpDbw),
            num(r.heightM),
            esc(updatedAt),
          ].join('\t') + '\n';
        if (!stream.write(line)) {
          await new Promise((res) => stream.once('drain', res));
        }
        count++;
      }
    },
    async finish() {
      stream.end();
      await done;
      await client.query('COMMIT');
      console.log(`[${source}] loaded ${count.toLocaleString()} rows`);
    },
  };
}

// ---- orchestrator --------------------------------------------------------------------

// Dry run: accumulate only summary statistics, never the rows themselves, so a
// full-set dry run costs the same memory as a small one. The point is to catch
// an FCC layout change that has silently turned coordinates into noise — a
// healthy ASR run is ~197k rows, ~98% inside CONUS, median height ~61 m.
function makeDryRunSink(source: string): Sink {
  let rows = 0, valid = 0, conus = 0, withFreq = 0;
  const heights: number[] = []; // bounded reservoir — enough for a median sanity check
  const samples: Row[] = [];

  return {
    async write(batch: Row[]) {
      for (const r of batch) {
        rows++;
        if (validCoord(r.lat, r.lon)) {
          valid++;
          if (r.lat >= 24 && r.lat <= 50 && r.lon >= -125 && r.lon <= -66) conus++;
        }
        if (r.freqMhz != null) withFreq++;
        if (r.heightM != null && heights.length < 200_000) heights.push(r.heightM);
        if (samples.length < 5) samples.push(r);
      }
    },
    async finish() {
      heights.sort((a, b) => a - b);
      console.log(`\n[${source}] DRY RUN`);
      console.log(`  rows              ${rows.toLocaleString()}`);
      console.log(`  valid coords      ${valid.toLocaleString()}`);
      console.log(`  inside CONUS      ${conus.toLocaleString()} (${rows ? ((100 * conus) / rows).toFixed(1) : '0'}%)`);
      console.log(`  with frequency    ${withFreq.toLocaleString()}`);
      console.log(`  with height       ${heights.length.toLocaleString()}${heights.length >= 200_000 ? '+ (sampled)' : ''}`);
      if (heights.length) {
        console.log(`  height m min/med/max  ${heights[0].toFixed(1)} / ${heights[heights.length >> 1].toFixed(1)} / ${heights[heights.length - 1].toFixed(1)}`);
      }
      console.log('  sample:');
      for (const r of samples) {
        console.log(
          `    ${r.lat.toFixed(5).padStart(10)} ${r.lon.toFixed(5).padStart(11)}  ` +
          `${(r.freqMhz != null ? r.freqMhz.toFixed(3) + ' MHz' : 'no freq').padStart(12)}  ` +
          `${(r.heightM != null ? r.heightM.toFixed(1) + ' m' : '-').padStart(8)}  ${r.name.slice(0, 40)}`,
        );
      }
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const sources = args.filter((a) => !a.startsWith('--'));
  const want = new Set(sources.length ? sources : ['uls', 'asr']);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString && !dryRun) throw new Error('DATABASE_URL is required (or pass --dry-run)');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-'));
  const client = new Client({
    connectionString,
    ssl: connectionString && !connectionString.includes('localhost') ? { rejectUnauthorized: false } : undefined,
    // Parsing HD.dat and LO.dat for a large archive leaves the socket idle for
    // minutes between COPY batches, and Azure's gateway drops idle connections.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  if (!dryRun) await client.connect();

  try {
    const openSink = (source: string) =>
      dryRun ? Promise.resolve(makeDryRunSink(source)) : makeDbSink(client, source);

    if (want.has('uls')) {
      // Two phases on purpose. Fetching ~700 MB takes long enough that a
      // transaction opened beforehand sits idle and gets dropped by the Azure
      // gateway, so every archive lands on disk before the database is touched.
      const staged: Array<{ file: string; dir: string }> = [];
      for (const file of ULS_FILES) {
        const zip = path.join(tmp, file);
        const outDir = path.join(tmp, file.replace('.zip', ''));
        fs.mkdirSync(outDir, { recursive: true });
        console.log(`downloading ${file}…`);
        await download(`${ULS_BASE}/${file}`, zip);
        await extractDat(zip, outDir, ['HD.dat', 'LO.dat', 'FR.dat']);
        fs.rmSync(zip, { force: true }); // keep only the .dat files
        staged.push({ file, dir: outDir });
      }

      console.log('parsing + loading…');
      const sink = await openSink('uls');
      for (const { file, dir } of staged) {
        const n = await streamUls(dir, sink);
        console.log(`  ${file}: ${n.toLocaleString()} emitters`);
        fs.rmSync(dir, { recursive: true, force: true });
      }
      await sink.finish();
    }

    if (want.has('asr')) {
      const zip = path.join(tmp, 'r_tower.zip');
      const outDir = path.join(tmp, 'asr');
      fs.mkdirSync(outDir, { recursive: true });
      // An already-downloaded copy can be reused via FCC_ASR_LOCAL, which keeps
      // a re-parse from pulling 37 MB again while tuning.
      const local = process.env.FCC_ASR_LOCAL;
      if (local && fs.existsSync(local)) {
        console.log(`using local ASR archive ${local}`);
        fs.copyFileSync(local, zip);
      } else {
        console.log('downloading ASR…');
        await download(ASR_URL, zip);
      }
      await extractDat(zip, outDir, ['CO.dat', 'RA.dat', 'EN.dat']);
      const sink = await openSink('asr');
      await sink.write(await parseAsr(outDir));
      await sink.finish();
    }

    if (want.has('broadcast')) {
      const sink = await openSink('broadcast');
      await sink.write(await parseBroadcast(tmp));
      await sink.finish();
    }
  } finally {
    if (!dryRun) await client.end();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().then(
  () => process.exit(0),
  (e) => { console.error(e); process.exit(1); },
);
