#!/usr/bin/env node
// Generates CHANGELOG.md from git history.
//
// Deliberately derived rather than hand-maintained. A changelog someone has to
// remember to update drifts from reality the first busy week; this one cannot,
// because git already holds every fact it needs — when the change landed, what
// it touched, and which model wrote it.
//
// Model attribution comes from the Co-Authored-By trailer on each commit. That
// convention is what makes the "which model did this" column possible, so
// keeping it is not cosmetic — see CLAUDE.md.
//
//   node scripts/changelog/build-changelog.mjs            # write CHANGELOG.md
//   node scripts/changelog/build-changelog.mjs --check    # fail if out of date
//   node scripts/changelog/build-changelog.mjs --stdout   # print, write nothing

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(REPO, 'CHANGELOG.md');

const RS = '\x1e'; // record separator
const FS = '\x1f'; // field separator

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Commits that only regenerate the changelog. Excluded, because a file cannot
 *  describe the commit that contains it: including them would leave CHANGELOG.md
 *  permanently one commit stale and --check permanently red. The rule this
 *  implies is in CLAUDE.md — regenerate as its own commit, never alongside code. */
function changelogOnlyCommits() {
  const raw = git(['log', `--pretty=format:${RS}%H`, '--name-only']);
  const skip = new Set();
  for (const chunk of raw.split(RS)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const [hash, ...files] = lines;
    if (files.every((f) => f === 'CHANGELOG.md')) skip.add(hash);
  }
  return skip;
}

/** hash, ISO date, author, subject, body — one record per commit. */
function readCommits() {
  const skip = changelogOnlyCommits();
  const raw = git(['log', `--pretty=format:${RS}%H${FS}%aI${FS}%an${FS}%s${FS}%b`]);
  return raw
    .split(RS)
    .filter((c) => c.trim())
    .filter((c) => !skip.has(c.split(FS)[0]))
    .map((chunk) => {
      const [hash, iso, author, subject, ...rest] = chunk.split(FS);
      const body = rest.join(FS);
      // "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
      const m = body.match(/^Co-Authored-By:\s*(.+?)\s*<[^>]*>\s*$/im);
      return {
        hash,
        iso,
        author,
        subject,
        model: m ? m[1].trim() : null,
        // First paragraph of the body, minus trailers — the "why" in one bite.
        lede: body
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter((p) => p && !/^(Co-Authored-By|Signed-off-by|Generated with):/im.test(p))[0] || '',
      };
    });
}

/** hash -> "N files, +A -D". A separate pass: bodies contain newlines, so
 *  interleaving stats into the same output is not safely parseable. */
function readStats() {
  const raw = git(['log', `--pretty=format:${RS}%H`, '--shortstat']);
  const stats = new Map();
  for (const chunk of raw.split(RS)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const hash = lines[0];
    const line = lines.find((l) => l.includes('file') && l.includes('changed'));
    if (!line) continue; // merge or empty commit
    const files = /(\d+) files? changed/.exec(line)?.[1] ?? '0';
    const ins = /(\d+) insertions?\(\+\)/.exec(line)?.[1] ?? '0';
    const del = /(\d+) deletions?\(-\)/.exec(line)?.[1] ?? '0';
    stats.set(hash, `${files} file${files === '1' ? '' : 's'}, +${ins} −${del}`);
  }
  return stats;
}

function localTime(iso) {
  // Keep the committer's own offset rather than normalising to UTC — "which
  // evening did this land" is the question people actually ask.
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : '';
}

function build() {
  const commits = readCommits();
  const stats = readStats();

  const byModel = new Map();
  for (const c of commits) {
    const k = c.model ?? 'unattributed';
    byModel.set(k, (byModel.get(k) ?? 0) + 1);
  }

  const days = new Map();
  for (const c of commits) {
    const day = c.iso.slice(0, 10);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(c);
  }

  const first = commits[commits.length - 1]?.iso.slice(0, 10) ?? '';
  const last = commits[0]?.iso.slice(0, 10) ?? '';

  const out = [];
  out.push('# Changelog');
  out.push('');
  out.push('Generated from git history — **do not edit by hand.** Regenerate with:');
  out.push('');
  out.push('```bash');
  out.push('node scripts/changelog/build-changelog.mjs');
  out.push('```');
  out.push('');
  out.push(
    `${commits.length} commits from ${first} to ${last}. ` +
      'Each entry records when the change landed, which model wrote it, and what it touched.',
  );
  out.push('');
  out.push('| Model | Commits |');
  out.push('|---|---:|');
  for (const [model, n] of [...byModel.entries()].sort((a, b) => b[1] - a[1])) {
    out.push(`| ${model} | ${n} |`);
  }
  out.push('');
  out.push(
    'Attribution comes from each commit\'s `Co-Authored-By` trailer. ' +
      'Commits marked *unattributed* predate the convention or were written by hand.',
  );
  out.push('');

  for (const [day, list] of days) {
    out.push(`## ${day}`);
    out.push('');
    for (const c of list) {
      const meta = [
        `\`${c.hash.slice(0, 8)}\``,
        localTime(c.iso),
        c.model ?? '_unattributed_',
        stats.get(c.hash),
      ]
        .filter(Boolean)
        .join(' · ');
      out.push(`### ${c.subject}`);
      out.push(meta);
      if (c.lede) {
        out.push('');
        out.push(c.lede.split('\n').join(' '));
      }
      out.push('');
    }
  }

  return out.join('\n');
}

const args = process.argv.slice(2);
const text = build();

if (args.includes('--stdout')) {
  process.stdout.write(text);
} else if (args.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current.trim() !== text.trim()) {
    console.error('CHANGELOG.md is out of date. Run: node scripts/changelog/build-changelog.mjs');
    process.exit(1);
  }
  console.log('CHANGELOG.md is up to date.');
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text + '\n', 'utf8');
  const lines = text.split('\n').length;
  console.log(`wrote CHANGELOG.md (${lines} lines)`);
}
