# Changelog

Generated from git history — **do not edit by hand.** Regenerate with:

```bash
node scripts/changelog/build-changelog.mjs
```

254 commits from 2026-03-24 to 2026-09-25. Each entry records when the change landed, which model wrote it, and what it touched.

| Model | Commits |
|---|---:|
| Claude Sonnet 4.6 | 158 |
| Claude Opus 4.7 | 46 |
| unattributed | 34 |
| Claude Opus 5 (1M context) | 14 |
| Claude Sonnet 4.5 | 2 |

Attribution comes from each commit's `Co-Authored-By` trailer. Commits marked *unattributed* predate the convention or were written by hand.

## 2026-09-25

### Make the optimiser solve for a ring that is actually on the map
`01c43083` · 15:43 · Claude Opus 5 (1M context) · 1 file, +51 −14

The SLA was a free 45-600s slider, so the solver sized its circles to a reach the map never drew - you could ask for 435s against a Dock 3 whose rings stop at 248s, and the proposed docks then looked wrong next to the placement rings sitting right beside them. They were arithmetically right and visually unrecognisable, which is worse.

### Stop the changelog invalidating itself on every commit
`d1a48b59` · 15:39 · Claude Opus 5 (1M context) · 2 files, +23 −0

A generated changelog that is committed alongside the code it describes is stale the instant it lands: the file cannot contain the hash of the commit that contains the file, so --check went red immediately after the first real use. Exclude commits that touch nothing but CHANGELOG.md, and document the matching rule - regenerate as its own commit - so the exclusion is never a surprise to whoever reads the script next.

### Generate a changelog from git, with model attribution
`e6ada6b8` · 15:35 · Claude Opus 5 (1M context) · 3 files, +1544 −0

There was no record of which model made which change, and no changelog at all. Both now exist, and neither depends on anyone remembering.

## 2026-09-16

### Make the Fleet Copilot agentic, and fix stale model IDs
`e66cc354` · 15:34 · Claude Opus 5 (1M context) · 10 files, +600 −82

The copilot could only discuss what the page had already loaded: the browser stuffed fleet state into a system prompt and got one answer back. "Which deals carry a critical RF risk" was unanswerable, because nothing in that prompt knew about emitters.

### Add the coverage optimiser to the site map
`f1507afa` · 15:23 · Claude Opus 5 (1M context) · 3 files, +305 −0

Puts the solver behind a control. The BOUNDARY tool already draws a closed polygon, so that is the service area — no second polygon tool to learn. Set an SLA and a coverage target, solve, and the proposed docks land on the map numbered in the order greedy chose them, each with its reach ring, with unreachable ground stippled red underneath.

### Add the multi-dock coverage optimiser
`93bd7628` · 15:18 · Claude Opus 5 (1M context) · 4 files, +450 −0

Answers the question a DFR customer is actually buying an answer to: how many docks to reach anywhere in this jurisdiction within N seconds, and where do they go. Until now the map could show what a placement covered; it could not solve for the placement.

### Deploy the FCC ingest as an Azure Container Apps Job
`ba0fd106` · 14:42 · Claude Opus 5 (1M context) · 3 files, +177 −11

The ingest was manual and reached the database through a firewall rule pinned to a workstation whose IP rotates. It now runs weekly inside Azure, where the server's "Allow Azure services" rule covers it and no firewall rule is opened at all.

### Add both automation paths for the FCC ingest
`f1ca6b46` · 14:17 · Claude Opus 5 (1M context) · 3 files, +191 −0

The ingest is manual and depends on a firewall rule pinned to a personal workstation whose IP rotates. Two routes out, written but not switched on, because each needs a decision that is not mine to make.

### Make terrain line-of-sight actually usable: USGS 3DEP + a cache
`8273073c` · 14:10 · Claude Opus 5 (1M context) · 3 files, +246 −83

The terrain toggle was a trap. It fetched from public OpenTopoData, which allows roughly 1000 requests a day at 100 points each, while one survey of 700 emitters at 49 samples needs ~35,000 points. Three surveys exhausted the daily quota, and at ~14 s a request it would have taken eight minutes anyway.

### Surface registered structures, unscored, and warn when a survey truncates
`01238f70` · 14:00 · Claude Opus 5 (1M context) · 4 files, +265 −3

197,456 ASR structures were loaded and then ignored. The survey filters on a frequency being present, and a structure registration records height and position but never says what transmits from it — so at RCSO four towers between 113 and 130 m tall, within 83 m of the dock, contributed nothing to the verdict.

### Ingest TV broadcast with its columns actually verified
`f2993a13` · 13:45 · Claude Opus 5 (1M context) · 3 files, +102 −20

TV was held back last round because its ERP column was ambiguous between two candidates and a guessed power field is the mistake the ASR indices already caused here. Resolved by regulatory cap rather than by eyeballing: low-power digital stations have a p90 of exactly 15.00 kW at column [15], which is the LPTV limit. The rival column [17] shows a 929 kW median for those same low-power stations, which is impossible, so it is a height field. Height is [40], where full-power stations give p10/median/p90 of 219/377/583 m — right for TV, and [44] yields sub-metre values.

### Ingest FM broadcast, and let the rubric see it
`4d090a0b` · 13:36 · Claude Opus 5 (1M context) · 3 files, +162 −16

Four broadcast towers sit 59-83 m from the RCSO dock. None were visible: broadcast is not in ULS, and ASR registrations carry no frequency, so the tool scored the loudest thing on that rooftop at zero.

### Group the sweep checklist by bearing; stop reading unknown ERP as low
`1e3d7f8c` · 13:24 · Claude Opus 5 (1M context) · 4 files, +140 −35

Against the live FCC data the RCSO dock flags 322 of 657 emitters, and the checklist printed a line for every one of them. The verdict was right and the action list was unusable — and the action list is the part a tech actually carries.

### Commit sqlx offline query cache; drop the database from CI builds
`d6fb7318` · 13:08 · Claude Opus 5 (1M context) · 97 files, +2184 −23

sqlx::query! validates SQL against a live database at compile time, but this project's migrations run at startup. That mismatch has shaped every backend change made here: the Rust could only be compiled somewhere that could reach a database, and on a developer machine that meant a firewall rule for a residential IP that rotates. Changes shipped parse-checked instead of compiled, and one reached CI broken because a struct gained fields that a third constructor never got.

## 2026-09-14

### Vacuum after each ingest source
`646499ae` · 21:12 · _unattributed_ · 2 files, +22 −2

A full reload leaves one dead tuple behind for every row it replaces, and nothing was reclaiming them. The bad 72M-row ULS load left the table at 18 GB for 4M live rows; aggregate queries took minutes and the verification pass lost its connection outright. A VACUUM FULL brought it to 841 MB.

### Join ULS frequencies to their own location, not every location
`fe88377e` · 19:19 · _unattributed_ · 1 file, +47 −28

A frequency authorisation is granted at a specific location on a licence. The ingest was cross-producting every frequency against every location, which was wrong in kind, not just in volume: one paging licence holds 140 sites and 141 frequency records, and all 141 frequencies were being planted at all 140 sites. A survey near any one of them would have seen phantom emitters at coordinates they do not transmit from — and scored dock placements against them.

### Stream ULS rows into COPY instead of materializing them
`2dccda12` · 17:58 · _unattributed_ · 2 files, +60 −33

The ULS ingest died with a V8 out-of-memory fatal error partway through l_LMpriv.zip, before a single row reached the database. Raising the heap alone would have papered over a structural problem.

### Add RF survey tab with bearing/range scope
`f21ac4da` · 16:46 · _unattributed_ · 6 files, +710 −1

Makes the ported engine visible. New RF tab on the deal page: confirm the dock coordinates (seeded from the site address), set antenna height and radius, and run. Results persist to the deal via rf_cache.

### Retarget FCC ingest to Postgres and fix wrong ASR field indices
`65138f92` · 16:38 · _unattributed_ · 5 files, +1434 −0

Turns the RF survey from "emitters I typed in" into "emitters the tool found". The ingest now writes rf_emitters in the app's Postgres instead of a separate Azure SQL database.

### Port RF survey engine from TypeScript to Rust
`0fe1915a` · 16:26 · _unattributed_ · 5 files, +789 −0

Phase 0 of the RF work (#3). The engine in lib/rf-survey/ was a real, field-tuned implementation but it could never run in production: it targeted Next API routes, which do not exist under output:'export', and Azure SQL rather than the app's Postgres.

### Fix build: initialize schedule fields in create_project
`fa41d678` · 16:19 · _unattributed_ · 1 file, +7 −0

The new-project response builds a ProjectSummary by hand and was missed when migration 020's scheduling fields were added to the struct, so CI failed with E0063. Values mirror the column defaults — a new deal has nothing scheduled until ops puts it on the timeline.

### Add master install timeline with NWS severe-weather alerts
`355f0fb6` · 16:14 · _unattributed_ · 9 files, +1018 −69

Master timeline (#14) and NWS alerts (#12), built as one feature rather than two screens: the point of knowing there's a tornado watch on the 24th is seeing it against the crew you have rolling on the 24th.

### Remove Job Estimator and Event Pricing tabs, expand active deployments
`e3f0f001` · 15:37 · _unattributed_ · 5 files, +4 −52

Both tabs are dropped from the sidebar, the command palette, and the MainTab union; their iframe wrapper components are deleted. The backing public/*.html files are left in place so the tools stay reachable directly if they are ever wanted again.

### Add install photos, pin-drop airspace probe, FAA obstacles, wind reach
`6d655929` · 15:31 · _unattributed_ · 9 files, +1466 −100

Four field tools for ops and solutions architects:

### Render installation guide PDFs inline with PDF.js
`a60aaa03` · 13:16 · _unattributed_ · 1 file, +134 −38

iOS Safari refuses to render PDFs inside iframes and instead triggers a download prompt every time. Switching the viewer to PDF.js (loaded from cdnjs) fixes it: each PDF page renders as a canvas stacked in the panel, so the guide is just already there when you click the tab. Works on desktop, iOS, and Android — no download, no plugin, no external viewer.

### Embed installation guide PDFs inline with sub-tab switcher
`2f32f407` · 12:57 · _unattributed_ · 1 file, +80 −174

Replaces the card-grid + fullscreen-modal flow with a sub-tab bar at the top and the selected PDF embedded directly on the page. The PDF uses the browser's native viewer inside a tall iframe, so it scrolls and zooms like any other document — no popup, no extra clicks.

### Add DJI Dock 3, DroneTag Scout, and Site Assessment guide PDFs
`5385cb52` · 12:47 · _unattributed_ · 3 files, +0 −0

### Replace Cost Estimator tab with Installation Guides
`dbb9905e` · 12:09 · _unattributed_ · 5 files, +256 −24

Adds an Installation Guides tab with three field cards: DJI Dock 3 DroneSense Installation, DroneTag Scout Installation Guide, and Site Assessment Field Guide. Each card opens the PDF in a fullscreen viewer or downloads it. Command palette entry and page routing updated; unused CostEstimator component removed.

### ui: unify Proposal / Active Deployment terminology + drop Constellation tab
`9038156a` · 11:34 · Claude Opus 4.7 · 11 files, +45 −441

Rename sweep — every user-facing "Steady State" and (context-dependent) "Active" is now the DXD-consistent language:

### deals: rename sections — Solution Proposals / Active Deployments
`333b66a7` · 11:28 · Claude Opus 4.7 · 1 file, +2 −2

Two label changes on the deals list:   ACTIVE DEPLOYMENTS  →  SOLUTION PROPOSALS   (non-steady-state deals)   STEADY STATE        →  ACTIVE DEPLOYMENTS   (steady-state deals)

## 2026-09-03

### sitemap: AR Site Preview — mobile camera + compass + distance
`a64dfa95` · 12:55 · Claude Opus 4.7 · 2 files, +319 −0

New "AR PREVIEW" button in the SiteMapper toolbar (mobile only). Full-screen camera + HUD showing where the site is in physical space relative to the operator's phone.

### signoff: live customer signature link — watch in real time
`265f22b7` · 12:53 · Claude Opus 4.7 · 7 files, +784 −0

Operator taps "Generate live signoff link" and gets back a URL + QR code. Customer opens it on any device, signs, and the strokes appear on the operator's screen stroke-by-stroke.

### sitemap: live ADS-B traffic overlay + 3D building extrusions
`1f7cf88e` · 12:48 · Claude Opus 4.7 · 1 file, +202 −0

Two new toggles in the SiteMapper toolbar. Both self-contained, no backend changes required.

### signoff: strip Google Fonts from html2canvas clone
`1bff33ad` · 12:46 · Claude Opus 4.7 · 1 file, +29 −8

Previous fix moved @import to <link rel="stylesheet"> hoping the rasterizer would leave it alone. It didn't — html2canvas-pro walks every stylesheet regardless of how it entered the document, and Google's response still has the modern CSS syntax that trips its parser.

### signoff: fix PDF build "unexpected EOF" caused by Google Fonts @import
`ffc71121` · 12:10 · Claude Opus 4.7 · 1 file, +19 −2

The customer signoff PDF was failing at the rasterization step with   Error parsing CSS component value, unexpected EOF even on html2canvas-pro. Root cause: an inline @import inside the signoff's <style> block pulling Google Fonts.

## 2026-09-02

### signoff: surface HubSpot attach errors + fix file access level
`598d8226` · 20:23 · Claude Opus 4.7 · 2 files, +33 −4

Two changes so the "signoff to HubSpot" flow stops failing silently.

### mobile: stabilize useIsMobile + fix MRR calc + block hidden copilot from stealing taps
`c09b0bc5` · 20:20 · Claude Opus 4.7 · 3 files, +43 −15

Three fixes.

### fix: mobile boot overlay could get stuck covering the whole page
`de601376` · 20:14 · Claude Opus 4.7 · 1 file, +12 −4

Boot sequence blocked the entire app on iOS Safari if either the auto-dismiss setTimeout got throttled (backgrounded tab, low-power mode) or the user tapped to skip — because the skip handler only listened to keydown and mousedown. Neither fires reliably on iOS.

### mobile: fix iOS Safari URL-bar height, popover anchoring, view transitions
`efb11e66` · 18:35 · Claude Opus 4.7 · 15 files, +54 −19

Six mobile problems in one pass.

### fix: HubSpot webhook build — enable reqwest multipart + drop query! macros
`90d8ff2b` · 17:06 · Claude Opus 4.7 · 2 files, +39 −32

Two build failures on Azure fixed in one commit:

### dashboard: Steady-State MRR card + live weather strip
`bd2d698c` · 15:56 · Claude Opus 4.7 · 2 files, +196 −1

Sub-metrics grew a Steady MRR card. Value = sum of HubSpot amounts across all steady-state deals, divided by 12. Conservative annual- contract-value ÷ 12 assumption; deals not linked to HubSpot are skipped. A small "ARR ÷ 12" subtitle makes the derivation explicit so nobody misreads the number.

### hubspot: inbound webhooks + signoff PDF attaches back to HubSpot
`179bb0d3` · 15:54 · Claude Opus 4.7 · 7 files, +363 −1

Inbound webhooks   migrations/017_hubspot_events.sql     - hubspot_events table with (deal_id, subscription_type,       property_name, property_value, occurred_at, received_at, raw).       Two indices: (deal_id, received_at) for per-deal queries and a       plain received_at DESC for the fleet-wide feed.     - projects.hs_synced_at TEXT column marks the last time each       project was touched by a HubSpot event.

### hubspot: rich enrichment on every deal — owner, company, timeline, line items
`e48a994b` · 15:51 · Claude Opus 4.7 · 4 files, +466 −77

Extended /api/hubspot/deal/:id to fetch and return, in one shot:   - properties: adds hubspot_owner_id   - associations: notes + calls + line_items (in addition to companies + contacts)   - companyDetails: adds industry, numberofemployees, annualrevenue,                     city/state/country, description   - noteDetails:      hs_note_body + hs_timestamp + author   - callDetails:      title, body, direction, duration, disposition, status   - lineItemDetails:  name, quantity, price, amount, SKU

### ai: Fleet Sentry — proactive daily AI alerts
`0f3f6868` · 15:40 · Claude Opus 4.7 · 3 files, +362 −0

Once per browser per day, Claude scans the fleet + HubSpot state and returns a short JSON array of operator-facing alerts. Cached until the next 24h refresh, rendered in a topbar bell popover.

### ui: universal @mentions + deal notes panel
`5aeaf4f0` · 15:38 · Claude Opus 4.7 · 4 files, +310 −1

lib/nav.ts       — tiny global custom-event bus. requestOpenDeal(id)                    dispatches, page.tsx listens and opens the panel.                    Now anywhere in the app can navigate to a deal                    without threading callbacks through the tree.

### ui: cinematic transitions — View Transitions API + zoom-open on deals
`f77a422d` · 15:35 · Claude Opus 4.7 · 4 files, +103 −6

Wrapped the important state changes in the browser's View Transitions API so navigating the tool visually morphs instead of hard-cutting.

### ui: constellation → orbital solar-system galaxy
`b0aaf6f8` · 15:32 · Claude Opus 4.7 · 1 file, +232 −302

Rewrote ConstellationView as a living orbital system. Every client is a golden star at the center of its own solar system; every deal is a planet orbiting that star with actual rotational motion. Speed slider runs the simulation from 0× to 5×, and the whole galaxy also rotates slowly for cinematic effect.

### stakeholders: generative avatars on every contact row
`145c3f3e` · 15:26 · Claude Opus 4.7 · 2 files, +86 −2

components/Avatar.tsx — deterministic SVG avatar. Hashes name+email into a hue pair, renders a radial gradient background with angled scanlines, and centers the person's initials in the display font. Same name always produces the same look, so the operator learns to recognize contacts by shape as much as by text.

### airspace: TFR proxy + clear-to-fly countdown
`f7869961` · 15:25 · Claude Opus 4.7 · 4 files, +328 −0

Backend   routes/tfr.rs — new GET /api/tfr?lat=&lng=&radius_nm= endpoint.   Fetches the FAA's public TFR list (https://tfr.faa.gov/tfrapi/   exportTfrList), reduces each entry to what the UI needs, and   filters to TFRs whose sum of (radius + caller radius) intersects   the caller's point. Great-circle distance via haversine, so the   filter is real-world accurate. Sorted nearest-first.

### ui: Constellation — force-directed graph of deals + clients
`fd756951` · 15:22 · Claude Opus 4.7 · 3 files, +478 −1

New "Constellation" top-level tab. Every deal is a node, every client is a node, an edge runs from each deal to its client. The picture tells you which clients have multiple deals (they become bright nuclei), which deals live alone, and which patches of the fleet cluster.

### ui: Command Bridge — fullscreen tactical HUD (press F)
`7be8ef35` · 15:19 · Claude Opus 4.7 · 3 files, +313 −0

Full-screen mission-control overlay meant for a spare monitor, a boardroom TV, or the "hey what does DXD do?" moment. Reads like a NORAD board:

### ai: Fleet Copilot — Cmd+J natural-language assistant
`098eedf6` · 15:17 · Claude Opus 4.7 · 2 files, +440 −0

Slide-in right sidebar (⌘J or the Copilot chip in the topbar). Reads the operator's live fleet + HubSpot state and passes it as a system prompt so answers reference specific deals by name.

### fix: FleetMap tiles + working overlays + drop scrubber
`92dc0610` · 15:07 · Claude Opus 4.7 · 1 file, +45 −141

Three fixes tangled into one commit.

### ui: polish sweep — ? cheatsheet, loading phrases, spring physics
`63444d18` · 14:57 · Claude Opus 4.7 · 5 files, +166 −5

lib/loadingPhrases.ts   - Tactical replacements for "Loading…" — SCANNING AIRSPACE,     ACQUIRING TARGETS, GEOCODING WAYPOINTS, etc. pickLoadingPhrase()     returns one at random per render so the tool has personality     without repeating itself.

### ui: dashboard hero + activity feed + sparklines on deal cards
`ca176085` · 14:55 · Claude Opus 4.7 · 2 files, +134 −21

Dashboard   - Hero header now reads a time-of-day greeting instead of a static     "DXD OPERATIONS" line:       < 05:00   OPERATIONS · EYES OPEN       (blue)       < 12:00   GOOD MORNING, OPERATOR       (red)       < 17:00   DXD OPERATIONS               (red)       < 21:00   GOOD EVENING, OPERATOR       (amber)       else      OPERATIONS · NIGHT WATCH     (purple)     Each variant has a two-line message + accent color. UTC clock is     appended so the header always shows the current time.

### ui: Fleet Map — scrubber, weather overlay, ops-area, crosshair
`7a058e74` · 14:52 · Claude Opus 4.7 · 1 file, +333 −49

Four independent upgrades layered onto the fleet map.

### ui: command palette now runs actions, not just navigation
`8935b9f4` · 14:49 · Claude Opus 4.7 · 1 file, +181 −28

Cmd+K now recognizes verb-prefixed queries and generates state-changing actions against the best-matched deal:

### ui: sound design + interface settings popover
`b3a0aaa0` · 14:47 · Claude Opus 4.7 · 5 files, +301 −2

lib/settings.ts       User-level UI preferences persisted to                         localStorage. sound / crosshair / physics toggles,                         each with safe defaults, subscribable so                         components re-render as they change.

### ui: foundation — boot sequence, toast/undo system, activity log
`d80b261d` · 14:45 · Claude Opus 4.7 · 8 files, +546 −5

Three new primitives underpin the next round of polish:

### ui: mobile-first pass across dashboard, deal view, fleet map
`d343a25e` · 14:29 · Claude Opus 4.7 · 5 files, +60 −29

Extracted the useIsMobile hook from app/page.tsx into lib/useIsMobile so any component can share the same 768px breakpoint. The old duplicate in page.tsx is gone.

### ui: dashboard — hero + live fleet map
`83e02ace` · 14:26 · Claude Opus 4.7 · 1 file, +87 −27

Rebuilt the dashboard so it reads as one intentional composition instead of a grid of half-empty stat cards.

### ui: Fleet Map — every deal on one map
`76ef6fd5` · 14:25 · Claude Opus 4.7 · 3 files, +317 −1

New top-level 'Fleet Map' tab that plots every deal with a site address onto a single dark-themed Leaflet map (Carto Dark tiles).

### ui: deal top bar — status pills + overflow menu
`f299a059` · 14:22 · Claude Opus 4.7 · 1 file, +149 −50

The top bar inside a deal had three separate toggle buttons (FAA, Steady State, Delete) crowding out the deal identity. Reorganized so the status of a deal reads at a glance and the toggles live where they belong.

### ui: deals list gets chips, sort/filter, collapsible steady-state
`16faaf37` · 14:20 · Claude Opus 4.7 · 1 file, +220 −58

Three linked upgrades to the Deals screen:

### ui: Cmd+K command palette
`a49d3579` · 14:18 · Claude Opus 4.7 · 2 files, +286 −0

Global palette that opens with Cmd/Ctrl+K (and closes with Esc). Two kinds of results:   - Deals   — every project/deal, filtered by subsequence match against               deal name, client, and site. Enter opens the deal.   - Views   — the top-level tabs (Dashboard, Deals, Admin, etc.).               Enter switches tabs and closes any open deal view.

### hubspot: pull service_locations into project site
`66f3829b` · 13:26 · Claude Opus 4.7 · 2 files, +35 −6

HubSpot exposes a free-text address field on deals called "service_locations" ("These are the locations where the customer who is signing the quote will receive services"). The tool's per-deal site column was always seeded empty and had to be filled by hand.

### dashboard: prune task-derived widgets and cards
`a1879956` · 13:22 · Claude Opus 4.7 · 1 file, +59 −172

The tracker no longer surfaces per-task state to operators, so the dashboard widgets that read from doneTasks/totalTasks/currentStage were showing stale/misleading numbers.

### projects: partition deals list by steady-state flag
`f3d475fa` · 13:10 · Claude Opus 4.7 · 2 files, +87 −25

The Projects screen used to be one flat grid — a comment even called out the removed Active/Steady State partition. Now that steady_state is an explicit per-deal flag (not derived from task completion), the partition is back and driven by the flag.

### projects: steady-state toggle on each deal
`143b7620` · 10:44 · Claude Opus 4.7 · 5 files, +67 −1

Mirrors the FAA-auth flag end-to-end: a per-deal boolean + a timestamp that stamps when the deal first crossed into steady state (so we can report "in steady state since X" later).

### pricing: replace quote builder with DXD Solutions Tool 3.0
`950eb6f0` · 10:22 · Claude Opus 4.7 · 3 files, +2132 −797

Same iframe + postMessage pattern used by the Customer Signoff tab: the pricing tab now hosts the standalone Solutions Tool HTML and the parent React app handles per-deal persistence.

### projects: drop progress ring, default new deal view to Airspace
`ba1ef31d` · 09:46 · Claude Opus 4.7 · 1 file, +1 −21

- Removed the overall-progress ring + %% badge from the deal top bar.   totalTasks / doneTasks / overallPct are gone too since nothing else   read them. - Clicking into a deal now lands on the Airspace tab instead of   Stakeholders. Matches the "airspace-first" workflow — operator sees   BVLOS constraints before anything else.

### weather: drop thunderstorms from flyability classifier
`66ed1bed` · 09:39 · Claude Opus 4.7 · 1 file, +9 −8

Two-step:   1. Revert 5d1fda62 (gust-based rewrite + hourly thunder detection) —      went in as 1eed2c93 just before this.   2. From that reverted state, strip thunder from the classifier so it      no longer contributes to no-fly or marginal day counts.

### Revert "weather: gust-based flyability classifier + hourly thunder detection"
`1eed2c93` · 09:38 · _unattributed_ · 1 file, +33 −128

This reverts commit 5d1fda628ea8d0176225d9e3991e50ad08cfa442.

### weather: gust-based flyability classifier + hourly thunder detection
`5d1fda62` · 09:27 · Claude Opus 4.7 · 1 file, +128 −33

Two independent bugs the operator caught in the flyability matrix:

## 2026-09-01

### signoff: swap html2canvas 1.4.1 -> html2canvas-pro so PDF actually builds
`e8cc7c3c` · 15:49 · Claude Opus 4.7 · 1 file, +11 −2

html2canvas 1.4.1 has been unmaintained since 2021 and its CSS parser chokes on anything post-2020: :has(), all: unset, double-position gradient stops, oklch(), color-mix(). Each one triggers "Error parsing CSS component value, unexpected EOF" and aborts before the canvas is ever produced.

### signoff: replace :has() with a JS class so html2canvas can build the PDF
`d694fd63` · 15:10 · Claude Sonnet 4.6 · 1 file, +12 −1

html2canvas 1.4.1 (which the Save to Deal & Email button uses to rasterize the .page element into a Letter PDF) can't parse the :has() selector \u2014 it throws 'Error parsing CSS component value, unexpected EOF' the moment it walks past that rule and the whole Save flow aborts before the PDF is built.

### signoff: Customer Signoff tool inside each deal, PDF archived + emailed
`434dd855` · 14:25 · Claude Sonnet 4.6 · 9 files, +1442 −2

New end-to-end flow:   Operator opens a deal → new "Signoff" tab     → renders the customer-signoff HTML tool in an iframe     → tool pre-fills project/client/site from parent context     → operator collects checkboxes, dock SNs, exceptions, and       customer + DXD signatures on canvas pads     → operator clicks "Save to Deal & Email"         → tool rasterizes the .page element with html2canvas,           builds a Letter PDF with jsPDF, posts it up to React         → React uploads to /projects/:id/attachments (kind=signoff)         → React POSTs /send-signoff-email which relays the PDF           through Resend to SIGNOFF_EMAIL_RECIPIENT

### mobile: move DEBUG chip to raw HTML/vanilla-JS so it works without React
`bbf827e6` · 13:42 · Claude Sonnet 4.6 · 1 file, +126 −2

User reported the DEBUG chip isn't appearing on their phone. Root problem: my prior chip was a React component that only mounted once the app bundle hydrated. If hydration fails on mobile Safari — which is one of the exact failure modes we're trying to diagnose — the diagnostic that's supposed to reveal the failure fails along with everything else.

### mobile: add ErrorBoundary + on-page diagnostic overlay
`5e3ec3aa` · 13:33 · Claude Sonnet 4.6 · 2 files, +175 −3

Symptoms user reported: sidebar drawer fix shipped, but on iPhone Safari the dashboard numbers still don't show and taps still don't respond. Since we can't attach a devtools inspector to their phone, we need on-page instrumentation to figure out whether it's a JS load failure, an API auth failure, or something else.

### mobile: responsive sidebar drawer + iOS Safari touch fixes
`cbdb5f6b` · 13:02 · Claude Sonnet 4.6 · 2 files, +96 −19

User report: "the website pulls up but i cant click on anything" on iPhone Safari. Diagnosed as two stacking problems:

## 2026-06-12

### summary: drop site map from PDF, switch to black background
`b884cf6c` · 11:45 · Claude Sonnet 4.6 · 1 file, +36 −127

User feedback:   1. "remove the site map from the summary, it just doesn't look right"   2. "give the summary a black background"

### summary: PDF map auto-fits to property boundary per deal
`c1b49701` · 10:52 · Claude Sonnet 4.6 · 2 files, +34 −2

User feedback: the map image in the 1-page deal summary PDF was always rendering at whatever zoom/center the user had last set, so big-property deals showed only a corner and small-property deals showed a wide blank area. They want each PDF's map to zoom to fit that deal's actual boundary.

### summary: restore the data-sitemap-mapwrap marker SummaryView needs
`5ee949b0` · 10:07 · Claude Sonnet 4.6 · 1 file, +7 −2

User reported the Summary tab's "↓ GENERATE 1-PAGE PDF" button inside each deal still isn't working.

## 2026-06-11

### map: extend DJI Dock 3 distance rings out to 2 mi
`d77e1e61` · 13:50 · Claude Sonnet 4.6 · 1 file, +1 −1

The rings on the deal-page Map tool (SiteMapper) are time-based: each ring shows the drone's reachable radius at a given total time from command, accounting for launch delay + cruise speed.

## 2026-06-10

### job-estimator: install full v9 estimator at /job-estimator.html
`7585c82e` · 10:41 · Claude Sonnet 4.6 · 1 file, +1987 −90

Replaced the placeholder shell in public/job-estimator.html with the complete DXD Business Model v9 tool from your attachment. The file is now ~2,061 lines / ~108K of JS plus the styling head.

### ui: replace Security Estimator with Job Estimator tool
`4fbe1ecc` · 10:20 · Claude Sonnet 4.6 · 3 files, +183 −6

Per request: drop "Security Estimator" from the sidebar and add a new "Job Estimator" tool sourced from the attached Business_Model_v10 HTML.

## 2026-06-05

### drone-tevi: OEM spec URL extraction now runs entirely locally
`4d87fecc` · 12:13 · Claude Sonnet 4.6 · 1 file, +181 −70

Replaced the Claude-API path in the OEM Specifications Source "Fetch & Pre-fill" flow with a pure-regex extractor so the feature works when the org's Anthropic usage cap has been hit.

### drone-tevi: OEM specs URL also pre-fills per-test Min Standards
`87171432` · 12:05 · Claude Sonnet 4.6 · 1 file, +79 −12

Two changes:

### drone-tevi: generate exec summaries fully offline, no Anthropic API
`e0ffc562` · 11:54 · Claude Sonnet 4.6 · 1 file, +408 −155

User reported their Anthropic usage cap was hit, so the "Generate Executive Summary" button was failing in production. Switched the feature to run entirely from local evaluation state — same quality output, no external dependency.

### drone-tevi: fix garbled exec summary after first 1-2 tabs
`f9495d2a` · 11:40 · Claude Sonnet 4.6 · 2 files, +64 −21

User reported that the Overview and Drone executive summaries generated cleanly, but every subsequent tab spat out nonsense — "PASSING TESTS" listed evaluator note fragments like "• Notes: Opens within 2.75 seconds from command." instead of real test names.

### drone-tevi: longer summaries, complete sentences, no mid-thought cuts
`374feab8` · 11:24 · Claude Sonnet 4.6 · 2 files, +21 −6

User asked for: - Overview tab summary: 1000–1500 words, high-level across all tabs - Per-tab summary: 500–900 words, detailed for that section - Both must finish their final sentence cleanly — no truncation

## 2026-06-04

### drone-tevi: detailed per-tab + overview reports, OEM spec URL prefill
`fa382ce5` · 21:05 · Claude Sonnet 4.6 · 4 files, +454 −30

Four changes to the Drone TEVI Products tool:

### ui: remove All Deals tab + collapse sidebar to one flat section
`aa81dc5f` · 11:49 · Claude Sonnet 4.6 · 1 file, +10 −33

Two cleanup changes to frontend/app/page.tsx:

### ui: drop stage/task/progress UI from Deals and All Deals lists
`cc3c2578` · 11:39 · Claude Sonnet 4.6 · 2 files, +51 −142

Since the task tracker (List + Kanban tabs) was removed, the stage/task/percentage indicators in the deal lists are stale — they always show 0% / 0 tasks because no tasks ever get created. Clearing them out so the cards/table actually reflect what we track now.

### ui: replace dropdown menu with persistent left-sidebar of tool cards
`0fba11ab` · 11:23 · Claude Sonnet 4.6 · 1 file, +207 −79

Top-bar "Menu ▾" dropdown is gone. Tools now live as a vertical stack of cards in a sticky left sidebar (232px wide). Each card has an SVG icon + label, gets a subtle hover effect, and the active one is highlighted in brand red with a small red rail.

## 2026-06-02

### summary: robust map capture — poll readiness instead of fixed wait
`6ac44241` · 14:22 · Claude Sonnet 4.6 · 1 file, +46 −15

Map render was failing because the previous implementation:   1. Used a fixed 4.5s wait that wasn't enough for Leaflet to load      its JS and pull tiles on first run / slow connections.   2. Mounted the hidden SiteMapper AFTER cache updates already      started — those updates trigger project re-fetches which can      re-render the hidden SiteMapper mid-tile-load.   3. Sized the hidden container at 1100x700, but SiteMapper's      internal CSS demands minHeight 820 on wrap + 760 on mapWrap,      so the map element was being clipped which can confuse      Leaflet's tile-bounds calculation.

### summary: 1-page PDF combining Airspace + Weather + Network + Map
`2c865043` · 14:06 · Claude Sonnet 4.6 · 2 files, +588 −1

New Summary tab on every deal that generates a single-page PDF matching the layout you sketched — verdict cards from the three intel tools plus a snapshot of the configured Map tab.

### products: fix ReferenceError on Products tab — activeSite undefined
`bfb168ae` · 13:40 · Claude Sonnet 4.6 · 1 file, +4 −1

The previous commit (section-scoped exec summaries) added an overviewCtx string that referenced `activeSite.label`, but `activeSite` is only defined inside the sub-components ExecSummaryBtn and OverviewPanel — not in the main DroneTeviApp scope where overviewCtx is built. Result: ReferenceError at render time, client-side exception, tab crashed.

### ui: re-add Pricing tab to project view
`bb82683b` · 10:26 · Claude Sonnet 4.6 · 1 file, +17 −1

Reverses the Pricing removal portion of commit f96b301f. List and Kanban stay gone — only Pricing comes back.

### products: section-scoped executive summaries, Overview is the only comprehensive one
`49d4f64f` · 09:48 · Claude Sonnet 4.6 · 1 file, +28 −4

User wanted each section's Generate Executive Summary button to use ONLY that section's data. The Drone tab's summary should summarize only flight-performance results, the Dock tab only dock-integration results, etc. The Overview section remains the single comprehensive roll-up across every section.

## 2026-06-01

### ui: remove Pipeline tool from main menu and dashboard
`9be80138` · 14:05 · Claude Sonnet 4.6 · 2 files, +1 −51

User requested the Pipeline tool be removed.

### network: Census API key support + graceful degradation
`fa14a7ab` · 13:33 · Claude Sonnet 4.6 · 1 file, +55 −34

Root cause of "Census API returned non-JSON: error decoding response body": the Census ACS Data API now requires an API key on every request (the free anonymous tier was retired). Without a key, the endpoint returns plaintext "A valid _key_ must be included with each data API request." which reqwest's .json() can't parse, blowing up the whole network lookup.

### network: proxy FCC + Census + Overpass through the backend
`072d1b73` · 13:22 · Claude Sonnet 4.6 · 3 files, +308 −101

ConnectivityView's "Failed to fetch" error came from one of three third-party APIs the frontend hit directly (FCC, Census ACS data, OpenStreetMap Overpass). All three are CORS-dependent and at least one was blocking the browser request. Solution: route all three through our own backend so the browser only talks to our origin.

### ui: remove List, Kanban, and Pricing tabs from project view
`f96b301f` · 12:57 · Claude Sonnet 4.6 · 1 file, +3 −259

User asked to remove these three sub-tools from the Deal/Project view. Backend code, data, and tables are left intact (less risky, fully reversible).

## 2026-05-29

### backend: remove duplicate /claude route from misc.rs
`358d6dd9` · 14:21 · Claude Sonnet 4.6 · 1 file, +3 −29

Log Stream showed the startup panic:

## 2026-05-28

### backend: force rebuild when migrations change (build.rs)
`832218bc` · 16:28 · Claude Sonnet 4.6 · 2 files, +26 −0

Root cause of the "migration 13 was previously applied but is missing in the resolved migrations" startup failure: sqlx::migrate!() embeds migrations/*.sql contents into the binary at compile time, but Cargo's incremental compilation and the CI rust-cache had no way to know that migration file changes should invalidate the compiled db.rs object. The deploy was running a binary that had been compiled back when migration 013 didn't exist, so the binary's embedded migration set was missing 13 even though the source tree contained the file.

### products: hardened /api/claude proxy for Executive Summary
`0a061bb9` · 16:13 · Claude Sonnet 4.6 · 2 files, +182 −0

Re-introduce the Anthropic proxy needed by the Generate Executive Summary buttons in the Drone TEVI tool. Hardened against accidental misuse (no auth on the app means anyone hitting the endpoint could otherwise burn the API key budget).

### products: re-add Drone TEVI shared-state backend (clean retry)
`250ca485` · 15:58 · Claude Sonnet 4.6 · 3 files, +78 −0

Re-introduce the single endpoint the frontend's Save button needs. Doing this in isolation so any breakage is unambiguous.

### backend: restore migrations 013/014 (sqlx requires applied files to stay)
`e9e06428` · 15:50 · Claude Sonnet 4.6 · 2 files, +24 −0

Last revert deleted the migration files but the DB had already recorded migrations 13 and 14 as applied. sqlx fails startup with "migration N was previously applied but is missing in the resolved migrations" — the file must remain so the checksum validates.

### revert: drop recent backend additions to restore known-good state
`46cf53cd` · 15:36 · Claude Sonnet 4.6 · 7 files, +0 −227

Stripping out the backend changes added in the last few days while the production deploy was broken. Backend now lines up with the state right after the pricing catalog work (adbd397d), which is the last point we know cleanly built and ran.

### backend: use EXCLUDED in upsert queries to fix startup/build
`e87ab442` · 14:23 · Claude Sonnet 4.6 · 2 files, +2 −2

Two UPSERT queries (drone_tevi_state and tool_state) used the same $N placeholders in both the INSERT VALUES and the ON CONFLICT UPDATE clauses. sqlx 0.7's macro analysis can be strict about parameter positional usage and this pattern is more brittle than the canonical Postgres idiom using EXCLUDED.column references — which keeps each placeholder referenced exactly once.

### products: local executive summary fallback when /api/claude fails
`2964d65e` · 14:18 · Claude Sonnet 4.6 · 1 file, +137 −14

With ANTHROPIC_API_KEY now configured in Azure, the AI-written summary works as the primary path. Added a deterministic local generator that runs entirely client-side as a fallback for:

## 2026-05-27

### products: add /api/claude proxy for Executive Summary button
`eb94b8e0` · 15:00 · Claude Sonnet 4.6 · 3 files, +96 −4

The "Generate Executive Summary" buttons in the Drone TEVI tool POST to /api/claude, but that route never existed on the backend — every call returned an HTML 404 page, frontend's response.json() threw or returned a JSONless object, and the user saw "No summary generated" or "Error generating summary" every time.

### api: fix apiFetch throwing on 204 No Content responses
`4451d6ed` · 09:12 · Claude Sonnet 4.6 · 1 file, +9 −1

The Drone TEVI Save button always showed "SAVE FAILED" even when the backend successfully wrote the row. Root cause was in lib/api.ts: apiFetch unconditionally called res.json() on every 2xx response. The PUT /drone-tevi-state route returns StatusCode::NO_CONTENT (204) with an empty body, and res.json() on an empty body throws a SyntaxError. The await in handleSave unwrapped that rejection and landed in the catch branch, flipping the indicator to "SAVE FAILED".

## 2026-05-26

### tools: backend persistence for the three iframe tools
`35adbd7d` · 13:06 · Claude Sonnet 4.6 · 7 files, +336 −2

Audit showed three tools had no backend save: Cost Estimator, Security Job Estimator, and Event Pricing. Cost Estimator and Security Job Estimator had no persistence at all (reload = lost work); Event Pricing only had localStorage. All other tools (Pricing, Map, Airspace, WX, Network, Ops, Tasks, Equipment, Stakeholders, Products, project Settings) already persist server-side.

### products: backend persistence for Drone TEVI shared state
`e0483aba` · 11:49 · Claude Sonnet 4.6 · 6 files, +131 −12

The Save button now writes through to the backend in addition to localStorage, so the entire team sees the same vendor evaluations, test results, weekly checks, and sign-offs across browsers/devices.

### products: add SAVE button to Drone TEVI tool, persist to localStorage
`29216255` · 11:35 · Claude Sonnet 4.6 · 1 file, +67 −3

The Products tab (DroneTeviApp) held every vendor evaluation, test result, weekly check, sign-off, and procurement decision in useReducer state only — reload wiped everything.

## 2026-05-21

### airspace: verdict card now leads with CONTROLLED / UNCONTROLLED
`48b31ab2` · 15:30 · Claude Sonnet 4.6 · 1 file, +6 −3

The left-most "Deployment Verdict" card previously led with the ceiling verdict text (GOOD TO GO / NO-FLY / RESTRICTED / etc.). Now the top line in big type is either:

## 2026-05-20

### airspace: match FAA UAS Facility Map renderer colors exactly
`69dce54e` · 17:34 · Claude Sonnet 4.6 · 1 file, +21 −12

Verified my CEILING_COLORS against the FAA's own FeatureServer drawingInfo.uniqueValueInfos (the same renderer their official web app at faa.maps.arcgis.com uses). My old colors were a generic "red-yellow-blue gradient" — close but not actually FAA-correct.

### airspace: load the full facility map grid, auto-fit map bounds
`c9218886` · 17:25 · Claude Sonnet 4.6 · 1 file, +73 −4

Previously queried a fixed 3-mile radius around the site, which cut off the surrounding grid. User wants to see where the facility map starts and ends, so:

### pricing: master catalog now editable via API + admin UI
`adbd397d` · 12:38 · Claude Sonnet 4.6 · 7 files, +517 −18

The hard-coded PRICING_CATALOG is replaced by a backend-stored catalog that can be edited at any time without a code deploy. Lets the team do master cost updates (e.g., DJI raises prices 5% across the board) and add new line items as products change.

### pricing: show both total + amortized when in monthly mode (UI + PDF)
`3701b522` · 12:23 · Claude Sonnet 4.6 · 1 file, +93 −20

When the payment mode is 12/24/36 months, both views previously showed only the amortized monthly figure. Now they show both — the amortized monthly is the prominent value, and the full upfront price appears beneath it as a smaller secondary line.

### pricing: backend-persisted pricingCache for cross-device sync
`05e2fdce` · 11:27 · Claude Sonnet 4.6 · 6 files, +58 −12

Adds true cross-device persistence for the Quote Builder, matching the pattern of mapCache / airspaceCache / networkCache / weatherCache.

### pricing: persist inputs per-project across sessions via localStorage
`44c32611` · 11:19 · Claude Sonnet 4.6 · 1 file, +65 −10

Pricing inputs were component-only state, lost on navigation/refresh. Now persisted to localStorage keyed by project.id so each deal preserves its own quote builder state. Saved fields:

## 2026-05-19

### airspace: expand FAA grid query to 3-mile radius
`5bf91159` · 12:25 · Claude Sonnet 4.6 · 1 file, +2 −2

queryFAAGrids default radius bumped from 3219m (2 miles) to 4828m (3 miles, 3 * 1609.344). flyTo zoom dropped from 13 to 12 so the larger area frames cleanly without users needing to zoom out.

### geocoding: add ArcGIS World Geocoder to fill Census coverage gaps
`285d0b84` · 12:07 · Claude Sonnet 4.6 · 1 file, +30 −6

Census Bureau, despite being authoritative, has gaps. Verified empty result for "5623 Two Notch Rd, Columbia, SC" (Richland County Sheriff's Dept) — a real, well-known US address. Nominatim also fell back to generic Two Notch Road segments without the house number, dropping the pin ~1.5 miles from the actual building. Photon returned a completely wrong place ~3 miles off.

### airspace: replace EXPORT PDF with EXPORT / PRINT (matches map tool)
`7c9dd51e` · 11:50 · Claude Sonnet 4.6 · 1 file, +26 −153

Drops the jsPDF/html2canvas-based PDF download. The airspace tool now uses the same window.print() approach as the site map tool:

### Revert "sitemapper: PDF export matching the airspace tool"
`308f3cfe` · 11:40 · _unattributed_ · 1 file, +23 −154

This reverts commit dc8eeebd81945f5c01a39e843bd17baa42ad0b95.

### sitemapper: PDF export matching the airspace tool
`dc8eeebd` · 11:30 · Claude Sonnet 4.6 · 1 file, +154 −23

Replaced the old EXPORT / PRINT button (which only opened the browser print dialog) with EXPORT PDF that produces a true downloadable PDF, same pattern as AirspaceIntel.

### sitemapper: solid red boundary + higher-res Google satellite tiles
`2d6c5f4f` · 11:17 · Claude Sonnet 4.6 · 1 file, +11 −12

Two visibility improvements requested by user:

### airspace: PDF export with map screenshot + project info
`2e466b82` · 11:14 · Claude Sonnet 4.6 · 1 file, +167 −4

New EXPORT PDF button in the map card header. Generates a letter-size PDF containing:

### geocoding: shared module for all four location-aware tools
`1734b260` · 11:06 · Claude Sonnet 4.6 · 5 files, +134 −187

WeatherIntel and ConnectivityView had their own copies of the geocoder that only knew about Nominatim. So when the airspace tool was fixed with Census JSONP, those two stayed broken — they still hit Nominatim only, which has no record of many US street addresses (verified empty for "9200 Blocker Ln, Austin, TX").

### airspace: default input to last-resolved address, not raw project.site
`bddddd71` · 10:52 · Claude Sonnet 4.6 · 1 file, +7 −1

Two changes to AirspaceIntel:

### geocoding: fix Census Bureau CORS failure with JSONP
`1c144986` · 10:44 · Claude Sonnet 4.6 · 2 files, +68 −20

Root cause finally found. The US Census Bureau geocoder does not send Access-Control-Allow-Origin headers, so browser fetch() calls have been silently failing this entire time. Every previous attempt fell through to Nominatim, which has no data for many specific US addresses (verified empty for "9200 Blocker Ln, Austin, TX 78719"), then either returned a wrong Photon result or threw "Location not found".

### geocoding: sequential Census-first strategy, drop Photon
`93a4bc8a` · 10:34 · Claude Sonnet 4.6 · 2 files, +41 −51

Promise.any was letting whichever geocoder responded first win. Nominatim is usually faster but Census Bureau is the authoritative source for US street addresses (uses TIGER data). Switched to strict sequential: Census first, then Nominatim only if Census has no match. Photon dropped — verified via direct API tests that it returns coordinates 100-200m off and replaces street addresses with nearby POI names.

### airspace: fix blank tiles, missing grid, stale layers on remount
`73696cca` · 10:21 · Claude Sonnet 4.6 · 1 file, +34 −13

Three Leaflet bugs in MapViewInner:

## 2026-04-30

### geocoding: parallel fetch + direct coordinate passthrough
`0e180672` · 11:27 · Claude Sonnet 4.6 · 2 files, +74 −41

Census and Nominatim now run in parallel (Promise.any) so the faster valid result wins instead of sequential 5s+5s waits. Timeout bumped to 7s each. Both tools now accept raw lat,lng input and bypass geocoding entirely — useful for verified coordinates where geocoders disagree. Photon kept as final fallback. Error message tells user to try coordinates if address lookup fails.

## 2026-04-29

### airspace: rewrite map with raw Leaflet, 2-mile FAA grid radius
`9b729c59` · 15:59 · Claude Sonnet 4.6 · 1 file, +97 −90

Drops react-leaflet (require() pattern unreliable in Next.js 15). MapViewInner now uses raw Leaflet via useRef+useEffect — same pattern as SiteMapper. GeoJSON layer is explicitly removed and redrawn on each search so results always update. FAA query radius changed from 5 miles to 2 miles (3219m). flyTo zoom set to 13 to frame the 2-mile grid.

### geocoding: add US Census Bureau as primary source for accuracy
`6815c55a` · 15:24 · Claude Sonnet 4.6 · 2 files, +43 −13

Census geocoder gives pinpoint accuracy for US street addresses with no auth required. Chain is now: Google Maps (if key) → Census Bureau → Nominatim (place names/international) → Photon (last resort). Added fetchWithTimeout to prevent any geocoder from hanging.

### geocoding: Nominatim primary, Photon fallback
`37d1e643` · 15:14 · Claude Sonnet 4.6 · 2 files, +26 −26

Photon ranking is less accurate for US street addresses. Nominatim with email param is the better primary source; Photon stays as fallback for addresses Nominatim can't resolve.

### fix geocoding: use Photon instead of Nominatim direct calls
`b750c7a6` · 15:08 · Claude Sonnet 4.6 · 4 files, +31 −32

output:export (static site) means no API routes. Photon (komoot.io) is OSM-backed, CORS-open, and requires no User-Agent/email — works from the browser without headers Nominatim requires server-side. Nominatim (with email param) kept as fallback. Removes the API route that broke the static build.

### proxy geocoding through Next.js API route to fix Nominatim failures
`24145521` · 15:04 · Claude Sonnet 4.6 · 3 files, +36 −9

Browsers cannot set User-Agent (forbidden header) so direct Nominatim calls lacked the required identification, causing rate-limiting. The new /api/geocode route runs server-side where headers can be set properly, includes the required email field per Nominatim ToS, and caches results for 24h. Both SiteMapper and AirspaceIntel now call /api/geocode instead of Nominatim directly.

### fix airspace map and site map address add
`d7ce782a` · 14:43 · Claude Sonnet 4.6 · 2 files, +18 −11

AirspaceIntel: wrap MapViewInner in { default: ... } so Next.js 15 dynamic() receives a proper module object instead of a bare component.

## 2026-04-28

### Add GeoTIFF export to Ops Planner
`e07f2e55` · 13:32 · Claude Sonnet 4.6 · 1 file, +103 −0

Clicking GEOTIFF in the header renders the current map view (tiles + all SVG overlays) via html2canvas, then writes a minimal but valid GeoTIFF with WGS84 (EPSG:4326) georeferencing tags — ModelTiepoint, ModelPixelScale, and a GeoKeyDirectory declaring the CRS. The file can be loaded directly into QGIS, ArcGIS, or any GIS tool and will snap to the correct geographic location.

### Increase font sizes in deal task list and stages
`04dc99e9` · 10:22 · Claude Sonnet 4.6 · 4 files, +22 −22

Task titles 13→15, subtask text 11→13, priority badges 8→9, stage sidebar labels up one step throughout, phase/stage headers slightly larger. Makes the list view substantially easier to read.

## 2026-04-27

### Edit equipment inline via fixed bottom drawer
`aba16b37` · 15:56 · Claude Sonnet 4.6 · 1 file, +127 −72

Clicking EDIT on any card now slides up a fixed panel at the bottom of the viewport instead of scrolling to a form at the top of the page. The drawer shows the item name in the header so it's always clear what is being edited, and closes on save or cancel.

### Add bulk edit for equipment tracker
`4c134b12` · 15:37 · Claude Sonnet 4.6 · 1 file, +126 −7

Select multiple items via checkboxes then click EDIT (N) to open a shared edit panel. Only filled fields are applied — blank means keep existing. Supports status, operator, group, dates, notes, and reassign to any deal or section.

### Move Steady State card next to Active Deals on dashboard
`a9b8bb05` · 11:31 · Claude Sonnet 4.6 · 1 file, +1 −1

### Fix broken quote nesting in Dashboard font strings
`0c9a8834` · 11:23 · Claude Sonnet 4.6 · 1 file, +7 −7

Previous replace turned 'Syne, sans-serif' into ''Chakra Petch', sans-serif' (invalid JS). Re-quote all Chakra Petch values with double quotes.

### Match Dashboard fonts to rest of site
`6c4b692e` · 11:15 · Claude Sonnet 4.6 · 1 file, +27 −27

Replace Syne → Chakra Petch and JetBrains Mono → IBM Plex Mono throughout Dashboard.tsx.

### Match Ops Planner fonts to rest of site
`5498afb4` · 11:09 · Claude Sonnet 4.6 · 1 file, +72 −72

Replace Barlow Condensed → Chakra Petch and Barlow → IBM Plex Mono throughout ops-planner.html (CSS, inline styles, JS popup strings, SVG ring labels). Also replaces Courier New with IBM Plex Mono.

### Persist Ops Planner state to database per project
`3e5c4f70` · 11:07 · Claude Sonnet 4.6 · 5 files, +184 −104

Previously all Ops Planner data lived only in browser localStorage, meaning it was lost on cache clear or when switching devices/browsers.

## 2026-04-24

### Add equipment reassignment and fix syntax error in EquipmentTracker
`7fa11382` · 12:23 · Claude Sonnet 4.6 · 4 files, +36 −15

- Edit form now shows 'Reassign To' selector pre-filled with the item's   current project/section; changing it and saving moves the item - Backend: UpdateEquipment accepts reassignProjectId / reassignSectionId;   each clears the other FK so an item is always in exactly one place - Fix: if/else without braces in toggleSelect caused build failure

### Add bulk delete and custom equipment sections
`a446955a` · 12:20 · Claude Sonnet 4.6 · 6 files, +589 −40

- Bulk delete: checkboxes on every equipment card, "DELETE (N)" button   appears in header when items are selected; works across projects and sections - Custom sections: named groups not tied to any deal, with full   CRUD (create, rename, delete); equipment can be added/edited/deleted   within a section; sections are collapsible like project groups - Backend: new equipment_sections table (migration 009), project_id made   nullable on equipment, section_id FK added; new routes for section CRUD   and section equipment CRUD - Add form now shows a combined "Assign To" selector with both Deals and   Sections as optgroups; CSV import target also supports sections

### Add Monday.com CSV import to Equipment Tracker
`7a2a4bdd` · 10:23 · Claude Sonnet 4.6 · 1 file, +235 −4

Bulk-import equipment from a Monday.com board CSV export instead of manual entry. Includes auto column mapping, status normalization, project selector, 3-row preview, and per-row result count.

### Add Steady State stat card to dashboard
`e5853d24` · 10:06 · Claude Sonnet 4.6 · 1 file, +3 −1

### Steady State: stages 11-12 excluded from % complete; deals section renamed
`6b10bbb8` · 09:56 · Claude Sonnet 4.6 · 3 files, +22 −22

- Stages 11 and 12 no longer count toward total/done tasks in backend   queries or frontend progress ring, so Go-Live completion = 100% - Deals list replaces Completed section with Steady State (green dot) - Cards in Steady State show ⟳ STEADY STATE badge - Stages 11 and 12 checklists remain fully functional in the deal view

### Split deal topbar into two rows to prevent address/progress overlap
`41c5a36b` · 09:41 · Claude Sonnet 4.6 · 1 file, +62 −57

Project name, client, site and progress ring now share a dedicated top row with room to breathe. View mode tabs move to their own row below, eliminating the cramped single-row layout that caused the overlay.

### Show subtasks for all tasks regardless of hasEquipmentPicker flag
`1fffef84` · 09:22 · Claude Sonnet 4.6 · 1 file, +1 −3

The equipment picker guard was incorrectly hiding the entire subtask section for stages 4 and 7, leaving those cards blank when expanded.

### Add migration 008 to repair missing stage 4 and 7 tasks
`a757dbfe` · 09:13 · Claude Sonnet 4.6 · 1 file, +95 −0

Deletes legacy empty tasks for stages 4/7 (from before subtasks model), then re-seeds the correct single task with all 13 subtasks per stage for any project that is now missing them.

## 2026-04-22

### Compact PDF export to 1-page landscape layout for security job estimator
`215d3479` · 15:18 · Claude Sonnet 4.6 · 1 file, +82 −50

### Use 4.33 weeks/month for working days calculation in security estimator
`296164a6` · 15:06 · Claude Sonnet 4.6 · 1 file, +3 −3

Input is now working days per week (1-7); multiplied by 4.33 internally to derive monthly hours — no more guessing calendar days.

### Remove Rob Tesh / Leadership from security job estimator header
`9260edec` · 14:59 · Claude Sonnet 4.6 · 1 file, +0 −1

### Add Security Job Estimator tab with PDF export
`7ff64047` · 14:51 · Claude Sonnet 4.6 · 3 files, +1017 −11

New tool for UAS security job costing — pilot cost per drone, equipment amortization, and service charges with margin. Download PDF button uses window.print() with @media print styles for clean white output.

### Add Event Pricing tab back to Menu dropdown
`b81e2b7d` · 13:43 · Claude Sonnet 4.6 · 1 file, +4 −1

Re-wires EventPricingApp (/event-pricing.html) as a top-level 'Event Pricing' tab in the Menu dropdown.

### Route TEVI summary generation through backend Claude proxy
`6ba16c94` · 12:31 · Claude Sonnet 4.6 · 1 file, +2 −2

Frontend was calling api.anthropic.com directly (no API key, blocked by CORS). Now calls /api/claude which proxies through the backend using ANTHROPIC_API_KEY set on the server.

### Fix TEVI tool: inputs lose focus after every keystroke
`dadb8f7f` · 12:22 · Claude Sonnet 4.6 · 1 file, +949 −916

Inner component functions defined inside DroneTeviApp got new function identities on every render, causing React to unmount/remount them on each dispatch (keystroke), which reset input focus. Extracted all 14 inner components to module level and shared state via React Context (TeviCtx). Replaced tabContent/<ActiveTab/> with a renderActiveTab() switch function to eliminate the tab-wrapper identity issue.

### Add Products tab back to Menu dropdown
`20f6bca9` · 11:59 · Claude Sonnet 4.6 · 1 file, +4 −1

Re-wires DroneTeviApp (Drone TEVI evaluation platform) as a top-level 'Products' tab in the Menu dropdown.

### Restyle cost estimator with dark theme and add PDF export
`c695513f` · 11:49 · Claude Sonnet 4.6 · 1 file, +430 −351

Rewrote cost-estimator.html to match the app's dark theme with CSS variables, sticky branded topbar, and window.print()-based PDF download with clean white print styles.

### Fix deal view transparency — use solid background instead of rgba
`49c0e7a7` · 11:28 · _unattributed_ · 1 file, +1 −1

### Consolidate nav into Menu dropdown; rename HubSpot→Admin; remove DXD Defense
`6b903a2a` · 11:22 · Claude Sonnet 4.6 · 2 files, +71 −64

- All nav tabs + tools items merged into a single Menu ▾ dropdown on the left - Tabs: Dashboard, Deals, Pipeline, All Deals, Admin, Equipment, Cost Estimator - HubSpot tab renamed to Admin throughout - Tools dropdown removed; items absorbed into Menu - Topbar brand now shows logo + Deus X Defense / Ops Tracker - DXD Defense removed from Dashboard date line

### Replace DX square with logo.png in topbar; remove 'Drone Deployment Ops' subtitle
`33274793` · 11:16 · _unattributed_ · 2 files, +2 −9

### Lighten background overlay so image is more visible
`29012eb9` · 11:07 · _unattributed_ · 1 file, +1 −1

### Add DXD background image with frosted glass UI overlay
`79359cd2` · 10:59 · Claude Sonnet 4.6 · 3 files, +15 −4

- Background image fixed/cover across the full site - Dark gradient overlay (72-88% opacity) keeps content readable - Topbar uses backdrop-filter blur for frosted glass effect - Card and topbar colors switched to semi-transparent rgba values

### FAA auth toggle, fix cost estimator, show all subtasks by default
`7c61babf` · 09:56 · Claude Sonnet 4.6 · 8 files, +78 −7

- Add faa_authorization_required + faa_auth_started_at columns (migration 007) - Backend: expose new fields in ProjectSummary/ProjectFull; PATCH handler sets   start timestamp on first activation, clears it on disable - ProjectView: FAA Auth toggle button in deal top bar (blue when active) - Dashboard Regulatory Tracker: filters by faaAuthorizationRequired flag,   timeline starts from faaAuthStartedAt rather than project createdAt - page.tsx: wire up CostEstimator component for the 'cost' Tools tab - TaskCard: isVisible now defaults to visible when conditionKey has no answer,   so all subtasks show until a branch question explicitly hides them

### Remove Kanban/RACI tabs; open deals full page
`870413a9` · 09:09 · Claude Sonnet 4.6 · 1 file, +10 −38

- Drop Kanban and RACI Map from top nav (Kanban lives inside each deal) - Replace 680px slide-in panel with full-screen fixed overlay

## 2026-04-21

### Redesign UI: new dark theme, topbar nav, Pipeline/AllDeals views, Dashboard overhaul
`89a7d3a5` · 18:05 · Claude Sonnet 4.6 · 5 files, +824 −440

- New dark palette (#0a0b0d bg) with Syne + JetBrains Mono fonts and SVG noise texture - Sticky 52px topbar: DXD brand, 7 nav tabs, Tools dropdown, Sync, New Deal - Dashboard: 5 stat cards + 2-column widget layout with critical handoffs, pipeline stage chart - PipelineView: funnel rows per stage with deal chips, phase A/B/C legend - AllDealsTable: sortable/searchable table with stage badge, progress bar, HubSpot indicator - Slide-in deal panel (680px) with backdrop blur; NewDealModal with name/client/site fields - MainTab type exported from page.tsx for cross-component tab switching

### Migration 006: backfill stage_number and role_tag for tasks created before 005
`76335833` · 17:39 · Claude Sonnet 4.6 · 1 file, +17 −0

### Fix build: add role_tag, stage_number, priority, condition_key to task/subtask constructors in tasks.rs
`d7943f7d` · 17:30 · Claude Sonnet 4.6 · 1 file, +4 −0

### DxD Deal Playbook: 12-stage tracker with phase nav, handoff cards, exit gates, and stage distribution chart
`8f2af1d6` · 17:25 · Claude Sonnet 4.6 · 13 files, +743 −242

### Dashboard: show only pinned deals, exclude closed-lost
`6e9d264d` · 15:25 · Claude Sonnet 4.6 · 1 file, +8 −6

Switch data source from getDeals() (all HubSpot deals) to getActive() (only deals pinned to projects in the app). Filter out closedlost stage.

### Add pipeline dashboard + dropdown navigation
`ea8f27d6` · 15:16 · Claude Sonnet 4.6 · 7 files, +804 −18

- Replace horizontal tab bar with dropdown nav; dashboard is default route - New Dashboard component: KPI row (deals, total value, avg, closing soon),   deals-by-stage bar chart, value-by-stage bar chart, deals-by-owner bar chart,   value-over-time area chart, and close-date timeline (≤30d highlighted) - Wire up api.hubspot.getOwners() for owner name resolution in charts/timeline - Add hubspot_owner_id to deal properties fetched from HubSpot API - recharts used for all charts (already in package.json)

### Team member edit + email domain shortcut
`b2ed5c78` · 14:28 · Claude Sonnet 4.6 · 3 files, +84 −21

- Backend: PATCH /team/:id to update name/role/email - Admin panel: EDIT button on each member card pre-fills the form - Form header/border turns orange in edit mode, button shows SAVE CHANGES - Email field shows @deusxdefense.com suffix automatically — just type the prefix

### Populate HubSpot contacts into project Contacts view
`340f3f2f` · 12:58 · Claude Sonnet 4.6 · 4 files, +87 −34

- Backend: get_deal now resolves contact details (name, email, phone,   job title, company) alongside company details - Frontend: HubSpot contacts appear live at the top of the Contacts   tab with an orange HS badge, separate from manually added contacts

### Fetch all HubSpot deals via cursor pagination
`65f2d022` · 12:45 · Claude Sonnet 4.6 · 1 file, +49 −24

Previously capped at 100. Now follows paging.next.after until all deals are returned regardless of total count.

### Add search filter to HubSpot deal browser
`e6deb487` · 12:34 · Claude Sonnet 4.6 · 1 file, +25 −4

Type partial deal name or company name to filter the list instantly.

## 2026-04-16

### Add HubSpot deal panel to project view
`5641415c` · 16:52 · Claude Sonnet 4.6 · 1 file, +83 −0

Live deal panel sits below the top bar on HubSpot-linked projects. Shows stage, pipeline, amount, close date, company, last modified, and a direct link to open the deal in HubSpot. Collapses/expands. Refreshes live from HubSpot every 60s.

### Add HubSpot live integration
`f1242ca1` · 16:48 · Claude Sonnet 4.6 · 9 files, +604 −20

- Backend: settings table + hubspot_deal_id column on projects - Backend: /api/hubspot/* routes (status, token, deals, pin/unpin, active, deal detail) - Backend: shadow projects created on pin, seeded with full phase/task template - Frontend: HubSpot types + api client methods - Frontend: Admin panel HUBSPOT tab (connect token, browse deals, toggle tracking) - Frontend: Project list shows live HS badge + deal stage for linked projects - Frontend: Active deals refresh every 60s from HubSpot API

### Fix TypeScript build: move @ts-nocheck before 'use client'
`87c76d7a` · 14:22 · Claude Sonnet 4.6 · 1 file, +2 −1

### Replace DroneTeviApp iframe with full React TEVI evaluation platform
`7e17cb49` · 13:48 · Claude Sonnet 4.6 · 3 files, +2001 −14

Replaces the iframe wrapper with the complete ~1400-line React component featuring OEM comparison, test tracking, METAR weather, weekly inspections, evaluation checklists, demo missions, and AI-powered executive summaries. Also includes package dependency updates.

### Add Event Pricing tab (DXD Event Business Model v5) and Deals Tracker
`c0a77c96` · 10:32 · Claude Sonnet 4.6 · 4 files, +2919 −2

- New EVENT PRICING tab renders event-pricing.html as iframe with full   VLOS/BVLOS cost modeling, HW package library, 5-year P&L analysis - New deals-tracker.html added to public assets for future DEALS tab - EventPricingApp.tsx component wraps the pricing tool as an iframe

## 2026-04-08

### Update ops planner import/export and print preview to include docks, measures, and boundaries
`bc1b2208` · 14:48 · Claude Sonnet 4.6 · 1 file, +154 −10

### Add ops planner maximize — hides tab bar for full window view
`82dc7fbd` · 13:50 · Claude Sonnet 4.6 · 2 files, +26 −7

- Clicking ⛶ icon (next to tab bar when on Ops tab) hides the sticky   header and tab bar, giving the ops planner the full window height - Floating RESTORE button appears top-right of the iframe to exit - OpsPlanner grows to 100vh when maximized vs calc(100vh - 56px) normally

### Add fullscreen toggle button to ops planner header
`8edca532` · 13:38 · Claude Sonnet 4.6 · 1 file, +26 −0

Click 'FULL SCREEN' to expand the ops planner to fill the entire display. Click 'EXIT FULL SCREEN' (or press Escape) to return. Button highlights when active.

### Keep OpsPlanner iframe always mounted to preserve map state across tabs
`4be21759` · 13:00 · Claude Sonnet 4.6 · 1 file, +6 −3

Instead of unmounting the iframe when switching tabs (which destroys all drawn layers, docks, boundaries, and measurements), always render it and toggle display:none. The iframe stays alive so state is fully preserved.

### Fix map dragging disabled for dock/boundary/measure/line/marker modes
`260bb2d7` · 10:59 · Claude Sonnet 4.6 · 1 file, +3 −3

Only rect and circle modes need map.dragging.disable() since they use click+drag gestures. All other click-to-place tools now keep panning enabled so the map can be moved between clicks.

### Fix boundary tool: interactive:false, close button, multiple boundaries, delete
`e5da7ba2` · 10:46 · Claude Sonnet 4.6 · 1 file, +27 −10

- Set interactive:false + bubblingMouseEvents:false on finalized polygons   so clicks and map drags inside boundaries work normally - Remove right-click/dblclick boundary finalize (was ambiguous with other tools) - Add floating green 'CLOSE BOUNDARY' button that appears when 3+ points placed,   disappears after closing or switching mode - Stay in boundary mode after closing so user can immediately draw another - Add fly-to (📍) button per boundary in sidebar list - Fix temp polygon fill opacity to match finalized version

### Rework ops planner dock tool: drone SVG icon, drag-to-move, opacity slider
`a4e77e4d` · 10:33 · Claude Sonnet 4.6 · 1 file, +111 −38

- Replace house emoji with tactical drone SVG icon (4-arm with rotors)   matching the SiteMapper.tsx design exactly - All rings use a single color (the active toolbar color) instead of   multi-color — cleaner look - Rings sync position on drag so they follow the marker in real time - Ring SVG distance/time labels also sync during drag - Ring opacity slider in sidebar dock panel (applies globally to all docks) - Popup on click shows model info + Remove Dock button - Sidebar list shows fly-to (📍) and delete (✕) per dock - fmtTime helper matches SiteMapper format (1m30s style)

### Add dock placement, multi-distance measure, and boundary tools to ops planner
`5206d04b` · 10:20 · Claude Sonnet 4.6 · 1 file, +284 −7

- DOCK: place DJI Dock 3 / Skydio X10 / Sunflower Labs with flight-time   rings (60–210s) showing range in feet based on each drone's speed - MEASURE: draw multi-point distance segments, each labeled with ft/mi,   deletable individually from sidebar list - BOUNDARY: draw polygon, auto-calculates area in acres and perimeter   in feet, deletable individually from sidebar list - All three tools use right-click or double-click to finalize - Sidebar MAP tab has collapsible panels for each new tool type

### Fix garbled unicode in drone-tevi.html Product tab
`1e00ebe6` · 09:59 · Claude Sonnet 4.6 · 1 file, +205 −205

Replaced all stray backslash+unicode sequences (e.g. \— \·) with their actual Unicode characters. These were left over from partial \uXXXX escape processing in previous builds.

### Fix duplicate useState declaration in drone-tevi.html
`55421f13` · 09:47 · Claude Sonnet 4.6 · 1 file, +0 −3

Removed manually prepended React destructure — Babel output already includes it, causing a redeclaration SyntaxError and black screen.

### Fix drone-tevi.html: pre-compile JSX, remove Babel CDN dependency
`cd8cb74e` · 09:40 · Claude Sonnet 4.6 · 1 file, +6092 −1385

- Pre-compiled JSX to plain JS using @babel/preset-react offline - Removed Babel Standalone CDN (was causing CSP/cross-origin issues) - Fixed \u{XXXXX} unicode escapes that were invalid in JSX text nodes - No eval() or CDN-loaded transpiler at runtime

## 2026-04-06

### Switch drone-tevi.html to manual Babel.transform for error visibility
`7ffde739` · 21:57 · Claude Sonnet 4.6 · 1 file, +19 −16

Uses text/plain script tag + Babel.transform() in a try/catch so parse/runtime errors are shown directly on screen instead of being swallowed as cross-origin Script errors.

### Add error display to drone-tevi.html for debugging
`d938e2ef` · 17:04 · Claude Sonnet 4.6 · 1 file, +15 −1

### Fix Babel preset for drone-tevi.html JSX transpilation
`368ddda5` · 16:49 · Claude Sonnet 4.6 · 1 file, +1 −1

Add data-presets="react" to the Babel script tag so JSX is correctly compiled by @babel/standalone.

### Add Product tab with Drone TEVI Platform
`65cb6ca1` · 16:43 · Claude Sonnet 4.6 · 3 files, +1429 −2

Adds a new home page tab ('PRODUCT') that embeds the Drone TEVI evaluation platform as a standalone HTML iframe app using React CDN + Babel Standalone.

### Auto-navigate Ops Planner map to project address
`7e6d3e8e` · 16:07 · Claude Sonnet 4.6 · 3 files, +1278 −625

OpsPlanner.tsx now accepts site/name props and passes them as URL query params. ops-planner.html reads those params on load: sets the op-title to the project name and geocodes the site address via Nominatim to fly the map to the project location.

### Fix garbled encoding in ops-planner.html
`864286fb` · 16:00 · Claude Sonnet 4.6 · 1 file, +622 −622

The file had double-encoded UTF-8 (original UTF-8 bytes were treated as latin-1 then re-encoded as UTF-8). Decode UTF-8 -> latin-1 -> UTF-8 to restore correct symbols and emoji throughout the tool.

### Add Ops Planner tab to project view
`405eb9fd` · 15:52 · Claude Sonnet 4.6 · 3 files, +643 −2

Saves uas_ops_sandbox_v11.html as a static asset and wraps it in an iframe component, adding a new 'Ops Planner' tab inside ProjectView.

### Add Cost Estimator tab
`fbe2ab16` · 14:57 · Claude Sonnet 4.6 · 3 files, +618 −3

Serves the job costing sheet as a static HTML file in an iframe under a new COST ESTIMATOR tab in the main navigation.

### Optimistic cache update for subtask checkboxes
`ea38a21c` · 14:32 · Claude Sonnet 4.6 · 1 file, +20 −1

Same pattern as task toggle: update cache immediately in onMutate, roll back on error, revalidate on settle.

### Fix task checkbox: optimistic cache update for instant feedback
`6323a49a` · 14:22 · Claude Sonnet 4.6 · 1 file, +21 −10

Use onMutate to update the React Query cache immediately so the checkbox and strikethrough reflect the new state without waiting for the server round-trip or refetch.

### Optimistic task checkbox with red accent; phase owner dropdown
`d9dbc2ac` · 14:13 · Claude Sonnet 4.6 · 2 files, +26 −11

- Task checkbox updates instantly (optimistic local state) with red   accent color; reverts if the server call fails - Phase owner field is now a dropdown populated from team members   (falls back to free-text input if no team members exist)

### Replace task status dot with interactive checkbox
`5899529a` · 14:06 · Claude Sonnet 4.6 · 1 file, +7 −1

Task headers now have a clickable checkbox to toggle task completion directly, without needing to open the task panel.

### Add delete button to ProjectView top bar
`97600031` · 14:04 · Claude Sonnet 4.6 · 1 file, +15 −1

Clicking the trash icon confirms and deletes the project, then returns to the project list.

### Rebuild project template from DxD Deal Playbook (13 stages, 4 phases)
`13f1f3d8` · 13:51 · Claude Sonnet 4.6 · 1 file, +243 −296

Replaces the old 4-phase/24-task template with the full 13-stage deal playbook: Pre-Deal (Stage 0), Phase A Capture It (Stages 1-3), Phase B Build It (Stages 4-6), Phase C Run It & Grow It (Stages 7-12). Each stage includes P0 universal checklist items as subtasks plus exit gates, handoff checklists, and branch conditions. Equipment picker and date tracking enabled on procurement stages; stakeholder fields on discovery, close, and go-live stages.

### Fix: cast priority select value to literal union type
`5dff85be` · 13:33 · Claude Sonnet 4.6 · 1 file, +2 −2

### Add Admin tab with team members and task management
`62850b03` · 13:30 · Claude Sonnet 4.6 · 2 files, +307 −3

- New AdminPanel component matching old CRA admin panel - TEAM MEMBERS tab: add/remove team members (name, role, email),   avatar initials, task count per member, card grid layout - TASKS tab: 3-column kanban (To Do / In Progress / Done),   priority badges (Low/Medium/High/Urgent), assignee, due date,   move-between-columns buttons, delete - Both backed by existing /api/team and /api/admin-tasks endpoints - Add ADMIN tab to main page nav

### ProjectList: restore old card grid layout
`d251d354` · 13:20 · Claude Sonnet 4.6 · 1 file, +147 −51

- Grid layout: repeat(auto-fill, minmax(310px, 1fr)) matching old CRA app - Full-card click to open project - Colored left border accent (progressColor-based) - Phase pill badge top-left (PHASE 1-5 / COMPLETE) - Large percentage number top-right with delete button - Project name, client, site (with pin icon) - Glowing progress bar - Footer: task count + creation date - Active / Completed section headers with colored dots - fadeSlideIn animation with staggered delay per card - Hover: lift + glow border

### Equipment tracker: card layout + FAA/dates/group fields
`4769ff83` · 13:01 · Claude Sonnet 4.6 · 5 files, +495 −290

- Add migration 003: faa_reg_number, date_ordered, date_received,   group_name columns to equipment table - Update Rust models and equipment routes to include new fields in   SELECT, INSERT, and per-field PATCH queries (macro-based updates) - Update frontend types (EquipmentItem, CreateEquipment, UpdateEquipment) - Rewrite EquipmentTracker: card grid layout with status top-border accent,   click-to-cycle status dropdown, inline note editor per card,   stats row (total/deployed/in-transit/maintenance), search bar,   full add/edit form (FAA reg, dates, group, operator, qty),   items grouped by project with collapsible sections

### Fix map tools: Leaflet CSS, FAA grid overlay, images
`5e3ca2ee` · 12:31 · Claude Sonnet 4.6 · 6 files, +90 −21

- Add Leaflet CSS link to layout.tsx (fixes black tile squares in SiteMapper) - Fix AirspaceIntel FAA grid overlay: correct polygon outer-ring extraction   for both Polygon and MultiPolygon geometries (was treating full coordinates   array as a single ring instead of coordinates[0]) - Remove unused useRef import from AirspaceIntel.tsx - Add public images (bg.jpg, logo.png, bg-fallback.svg) to frontend/public - CRA: consolidate battery entries, add inline notes UI in EquipmentTracker

### Port all tools from CRA app to Next.js: map, airspace, weather, pricing, network, kanban, stakeholders, settings
`ae9d6361` · 12:17 · Claude Sonnet 4.6 · 9 files, +3417 −62

### Never crash on startup: serve diagnostic error via HTTP instead
`72dbcc6a` · 11:13 · Claude Sonnet 4.6 · 1 file, +50 −6

If the DB connection fails, start a minimal HTTP server that returns the exact error on every request. Azure stops showing Application Error and /api/health shows what's actually wrong.

### Add 15s DB connection timeout with clear error logging
`c350c611` · 11:04 · Claude Sonnet 4.6 · 1 file, +23 −5

### Add Node.js wrapper so Azure auto-runs the Rust binary
`5d442a99` · 10:35 · Claude Sonnet 4.6 · 2 files, +8 −1

Azure detects server.js and runs it via npm start. The wrapper simply spawns dxd-tracker with all env vars inherited (PORT, DATABASE_URL, etc). No Azure portal startup command configuration needed.

### Remove startup-command (not supported with publish-profile auth)
`32c7cf75` · 10:22 · Claude Sonnet 4.6 · 1 file, +1 −1

Azure runs npm start from the deployed package.json, which points to ./dxd-tracker. The package.json override in dist/ handles startup.

### Fix Azure startup: set startup-command and override package.json
`45e37985` · 10:17 · Claude Sonnet 4.6 · 1 file, +2 −0

Azure was auto-detecting the old Node.js server.js app (via the root package.json with start: node server.js) instead of running the Rust binary. Two fixes: - Set startup-command in webapps-deploy so Azure runs the binary directly - Include a package.json in the dist artifact that overrides the old one,   pointing npm start at ./dxd-tracker as a fallback

### Fix CI: spin up local postgres for sqlx compile-time query verification
`8e97bc5e` · 09:37 · Claude Sonnet 4.6 · 1 file, +26 −0

All sqlx::query! macros need a live DB at compile time. Instead of requiring Azure PostgreSQL to be reachable from GitHub Actions (blocked by firewall) or needing DATABASE_URL as a repo secret, spin up a local postgres:16 service in the CI job. Migrations run against it, then the build verifies all queries locally. The deployed binary connects to the real Azure PostgreSQL via its DATABASE_URL app setting at runtime.

### Fix CI: switch equipment queries to runtime, remove DB dependency from build
`d6f5ea79` · 09:23 · Claude Sonnet 4.6 · 2 files, +83 −73

- Replace sqlx::query! macros in equipment.rs with runtime sqlx::query()   calls so the build no longer needs a live PostgreSQL connection - Remove sqlx migrate run CI step (db::create_pool already runs migrations   at startup via sqlx::migrate!) - Remove DATABASE_URL env var from the build step (no longer needed)

### Add version to health endpoint for deploy verification
`480b9d84` · 08:56 · _unattributed_ · 1 file, +5 −1

## 2026-04-03

### Fix static file path: auto-detect frontend/ dir on Azure vs local
`5d1f3cbb` · 11:49 · _unattributed_ · 1 file, +9 −2

## 2026-04-01

### Add Equipment Tracker: DB migration, Rust CRUD routes, Next.js component with inline notes and battery qty badge
`74cbc0ef` · 17:27 · _unattributed_ · 8 files, +650 −1

## 2026-03-31

### Build statically-linked musl binary to fix glibc incompatibility on Azure
`e6827457` · 19:11 · _unattributed_ · 1 file, +11 −5

### Switch Azure deploy auth to publish profile (no SP needed)
`24710a81` · 15:46 · _unattributed_ · 1 file, +1 −15

### Remove old CRA azure-deploy workflow
`9e3efe6b` · 15:32 · _unattributed_ · 1 file, +0 −33

### Remove npm cache config to fix lockfile sync error
`66d14928` · 15:30 · _unattributed_ · 1 file, +0 −2

### Use npm install instead of npm ci to avoid lockfile sync issues
`e5f46dee` · 15:26 · _unattributed_ · 1 file, +1 −1

### Trigger deploy - role assignment complete
`093d4a15` · 15:12 · _unattributed_

### Fix i32/i64 type mismatches for PostgreSQL integer columns
`30b338bd` · 11:46 · _unattributed_ · 2 files, +4 −4

### Fix sqlx-cli: add native-tls for Azure PostgreSQL SSL
`99bc5529` · 11:37 · _unattributed_ · 1 file, +1 −3

### Fix CI: update package-lock.json and run migrations before cargo build
`2092288c` · 11:33 · _unattributed_ · 1 file, +11 −0

### Retry deploy with fixed DATABASE_URL
`18613edb` · 11:18 · _unattributed_

### Trigger CI deploy
`7c649e5a` · 10:19 · _unattributed_

### Migrate backend from SQLite to Azure PostgreSQL Flexible Server
`02b8c5dc` · 10:05 · Claude Sonnet 4.6 · 12 files, +3326 −182

- Swap sqlx sqlite feature for postgres - Update all queries from ? placeholders to / positional params - Use BOOLEAN/BIGSERIAL/BYTEA types in migration - Update db.rs to use PgPool - Update models for i32/bool types returned by postgres - CI workflow passes DATABASE_URL to cargo build for sqlx compile-time checks - PostgreSQL server: dxd-tracker-pg.postgres.database.azure.com

## 2026-03-30

### Switch Azure deploy to service principal auth (basic auth disabled)
`c583eb71` · 13:00 · _unattributed_ · 1 file, +5 −1

### Migrate to Next.js + Rust/Axum backend architecture
`3fbc5328` · 12:58 · Claude Sonnet 4.6 · 34 files, +9189 −0

SECURITY: All data moved server-side. Zero localStorage. Rust/Axum REST API with SQLite handles all persistence. Meets compliance frameworks by keeping data behind server-side protocols rather than exposed in the browser.

### Fix asset paths for Azure by setting homepage to /
`c7a35f01` · 11:20 · Claude Sonnet 4.6 · 1 file, +1 −1

Was set to GitHub Pages URL, causing white screen on Azure deployment.

### Add subtask notes, drag-and-drop attachments, and unlock phase navigation
`5c99efa0` · 11:12 · Claude Sonnet 4.6 · 1 file, +53 −19

- Per-subtask note button (chat bubble icon) with inline textarea - Drag-and-drop file attachment to task attachment zones from OneDrive/Explorer - Remove sequential phase locking so phases can be worked simultaneously - Fix nested template literal syntax error in drag-drop style attribute - Fix missing closing div for drag-drop wrapper (caused build failure)

## 2026-03-25

### Add project settings and stakeholders tabs
`ec1dd0b6` · 16:02 · Claude Sonnet 4.6 · 1 file, +149 −13

- ProjectSettingsView: edit project name, client, site address after creation - StakeholdersView: full CRUD for project contacts (name, title, company, email, phone) - Added Contacts and Settings tabs to ProjectView nav bar

### Configure Azure App Service deployment
`aa7397b2` · 15:24 · Claude Sonnet 4.6 · 3 files, +46 −3

- server.js serves React build in production - PORT reads from environment (Azure sets this automatically) - GitHub Actions workflow builds and deploys on push to main - npm start now runs node server.js for production

### Add GitHub Pages deployment
`f6c94c99` · 15:18 · Claude Sonnet 4.6 · 2 files, +135 −1

### Equipment tracker overhaul + task list cleanup
`9cc14698` · 15:10 · Claude Sonnet 4.6 · 3 files, +630 −220

- Add inline editing for serial #, FAA reg #, operator, status in all equipment rows - Add custom groups with + New Group button in header - Fix custom groups to show all items regardless of project assignment - Update status labels: Shipped, Delivered, Operational, Maintenance Req. - Remove operator-assigned equipment section - Remove gate badges from task lists - New groups prepend to top of list - Group field in add form shows dropdown of existing groups - Delete works on all items including AUTO

## 2026-03-24

### Fix all ESLint warnings for clean Azure deployment build
`6196ad09` · 14:37 · Claude Sonnet 4.5 · 3 files, +7 −7

Remove unused vars, fix unnecessary escape characters, fix JSX comment syntax.

### Initial commit — DXD Deployment Tracker
`337b1f0b` · 12:55 · Claude Sonnet 4.5 · 29 files, +23363 −0

Full-stack React ops platform: project tracker, site mapper (Leaflet + Google geocoding), weather intelligence, airspace intel, pricing tool, and network/power connectivity analysis.

