// @ts-nocheck
'use client'

import { useState, useReducer, createContext, useContext, useEffect } from "react";
import { api } from "@/lib/api";

// ─── Persistence ──────────────────────────────────────────────────────────
// All TEVI state lives in the useReducer below. Two-tier save:
//   1. localStorage — instant writeback, survives page refresh
//   2. Backend (/api/drone-tevi-state) — single shared team-wide
//      snapshot so anyone opening the Products tool on any device
//      sees the latest evaluations.
// On mount we kick off a fetch for the backend snapshot and merge it
// into the reducer (backend wins over localStorage when present).

const TEVI_STORAGE_KEY = 'dxd-drone-tevi-state';

function loadTeviSaved() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TEVI_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveTeviSnapshotLocal(state) {
  if (typeof window === 'undefined') return false;
  try { localStorage.setItem(TEVI_STORAGE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}

function isValidTeviState(s) {
  return s && typeof s === 'object' && Array.isArray(s.oems) && s.oems.length > 0;
}

const ROLES = ["Lead Evaluator","Co-Evaluator","Technical Specialist","Safety Officer","Commanding Officer / Approver"];
const TABS  = ["Overview","Drone","Dock","Sensors","Payload","Reliability","Use Cases","Compare","Weekly Checks","6-Month Plan","Demo Missions","Test Results","Evaluation Checklist","Chief Pilot Final Eval & Sign-Off"];

const TAB_COLORS = {
  "Overview":              {color:"#c8c8c8",active:"rgba(200,200,200,0.15)",border:"rgba(200,200,200,0.4)"},
  "Drone":                 {color:"#2dd4bf",active:"rgba(45,212,191,0.15)", border:"rgba(45,212,191,0.5)"},
  "Dock":                  {color:"#f59e0b",active:"rgba(245,158,11,0.15)",border:"rgba(245,158,11,0.5)"},
  "Sensors":               {color:"#34d399",active:"rgba(52,211,153,0.15)",border:"rgba(52,211,153,0.5)"},
  "Payload":               {color:"#a78bfa",active:"rgba(167,139,250,0.15)",border:"rgba(167,139,250,0.5)"},
  "Reliability":           {color:"#ff6b4a",active:"rgba(204,34,0,0.15)",  border:"rgba(204,34,0,0.5)"},
  "Use Cases":             {color:"#fbbf24",active:"rgba(251,191,36,0.15)",border:"rgba(251,191,36,0.5)"},
  "Test Results":          {color:"#fb923c",active:"rgba(251,146,60,0.15)",border:"rgba(251,146,60,0.5)"},
  "Chief Pilot Final Eval & Sign-Off": {color:"#86efac",active:"rgba(134,239,172,0.15)",border:"rgba(134,239,172,0.5)"},
  "Evaluation Checklist":  {color:"#c084fc",active:"rgba(192,132,252,0.15)",border:"rgba(192,132,252,0.5)"},
  "Compare":               {color:"#a78bfa",active:"rgba(167,139,250,0.15)",border:"rgba(167,139,250,0.5)"},
  "Weekly Checks":         {color:"#fde68a",active:"rgba(253,230,138,0.15)",border:"rgba(253,230,138,0.5)"},
  "6-Month Plan":          {color:"#6ee7b7",active:"rgba(110,231,183,0.15)",border:"rgba(110,231,183,0.5)"},
  "Demo Missions":         {color:"#f472b6",active:"rgba(244,114,182,0.15)",border:"rgba(244,114,182,0.5)"},
};

const TESTS = {
  "Flight Performance":[
    {id:"fp1",test:"Launch Time to 150ft",standard:"Per OEM spec — target <30 sec from command"},
    {id:"fp2",test:"Landing Precision",standard:"Per OEM spec — target 95%, <3in avg offset"},
    {id:"fp3",test:"Flight Time",standard:"Per OEM spec — target >20 min useable"},
    {id:"fp4",test:"C2 Signal Strength",standard:"Per OEM spec — target >1.0mi (5,280ft) with control"},
    {id:"fp5",test:"Max Speed",standard:"Per OEM spec — target >25 mph"},
    {id:"fp6",test:"Wind Resistance & Stability",standard:"Per OEM spec — target stable in 20 mph sustained"},
    {id:"fp7",test:"Climb Rate",standard:"Per OEM spec — target >10 sec"},
    {id:"fp8",test:"Descent Rate",standard:"Per OEM spec — target <10 sec"},
  ],
  "Dock Integration":[
    {id:"di1",test:"Charge Time",standard:"Per OEM spec — target 1:1 flight:charge ratio"},
    {id:"di2",test:"Dock Lid Open/Close Cycle",standard:"Per OEM spec — target <15 sec actuation"},
    {id:"di3",test:"Auto-Launch (Scheduled)",standard:"Per OEM spec — target launch within 30 sec of schedule"},
    {id:"di4",test:"Auto-Return to Dock",standard:"Per OEM spec — target RTD within 6in of dock center"},
    {id:"di5",test:"Remote Mission Trigger",standard:"Per OEM spec — target <5 sec response from command"},
    {id:"di6",test:"Manual Override to Auto Resume",standard:"Per OEM spec — seamless handoff, no mission abort"},
    {id:"di7",test:"GCS/VMS Integration",standard:"Per OEM spec — connects without manual steps"},
    {id:"di8",test:"Geofencing Compliance",standard:"Per OEM spec — stays within pre-programmed boundary"},
    {id:"di11",test:"Required Power Supply",standard:"Per OEM spec — verify voltage/amperage meets dock spec"},
    {id:"di13",test:"Internet Connectivity Primary",standard:"Per OEM spec — target <100ms latency to GCS"},
  ],
  "Sensors & Payload":[
    {id:"sp1", test:"EO Camera — Object ID @ 50ft",standard:"Per OEM spec — clear object/face ID, stable gimbal"},
    {id:"sp2", test:"EO Camera — Object ID @ 100ft",standard:"Per OEM spec — readable detail, minimal distortion"},
    {id:"sp3", test:"EO Camera — Object ID @ 150ft",standard:"Per OEM spec — subject identifiable, 4K preferred"},
    {id:"sp4", test:"EO Camera — Object ID @ 200ft",standard:"Per OEM spec — subject identifiable with zoom"},
    {id:"sp5", test:"EO Camera — Object ID @ 300ft",standard:"Per OEM spec — zoom required, useable image quality"},
    {id:"sp6", test:"EO Camera — Object ID @ 400ft",standard:"Per OEM spec — max zoom, subject distinguishable"},
    {id:"sp7", test:"Optical Zoom — @ 100ft",standard:"Per OEM spec — zoom stable, no image shake"},
    {id:"sp8", test:"Optical Zoom — @ 200ft",standard:"Per OEM spec — plate/feature readable at max zoom"},
    {id:"sp9", test:"Optical Zoom — @ 300ft",standard:"Per OEM spec — useable zoom ID at standoff distance"},
    {id:"sp10",test:"Optical Zoom — @ 400ft",standard:"Per OEM spec — subject distinguishable at max zoom"},
    {id:"sp11",test:"Wide Angle — Coverage @ 50ft",standard:"Per OEM spec — full scene capture, no barrel distortion"},
    {id:"sp12",test:"Wide Angle — Coverage @ 100ft",standard:"Per OEM spec — wide scene useable for situational awareness"},
    {id:"sp13",test:"Wide Angle — Coverage @ 200ft",standard:"Per OEM spec — broad area visible, operator can track subjects"},
    {id:"sp14",test:"Thermal — Human Detection @ 100ft",standard:"Per OEM spec — heat signature clearly distinguishable"},
    {id:"sp15",test:"Thermal — Human Detection @ 200ft",standard:"Per OEM spec — human outline visible against background"},
    {id:"sp16",test:"Thermal — Human Detection @ 300ft",standard:"Per OEM spec — detectable heat signature at range"},
    {id:"sp17",test:"Thermal — Human Detection @ 400ft",standard:"Per OEM spec — signature detectable, lower resolution acceptable"},
    {id:"sp18",test:"Thermal — Hot Spot Detection",standard:"Per OEM spec — anomaly flagged vs ambient background"},
    {id:"sp19",test:"Night / Low-Light EO @ 50ft",standard:"Per OEM spec — useable image without spotlight"},
    {id:"sp20",test:"Night / Low-Light EO @ 150ft",standard:"Per OEM spec — subject shape and movement identifiable"},
    {id:"sp21",test:"Streaming Latency",standard:"Per OEM spec — target <500ms end-to-end to GCS"},
    {id:"sp22",test:"Gimbal Stability — All Altitudes",standard:"Per OEM spec — no jitter or drift during hover and transit"},
    {id:"sp23",test:"Payload Swap Time",standard:"Per OEM spec — target <5 min with standard tools"},
  ],
  "Operations & Reliability":[
    {id:"or1",test:"Mission Success Rate",standard:"Per OEM spec — target 90% over 10+ missions"},
    {id:"or2",test:"Flight Hours Between Failures",standard:"Per OEM spec — target >=20 flight hours"},
    {id:"or3",test:"Pre-Flight Self-Check Accuracy",standard:"Per OEM spec — all faults flagged, no false positives"},
    {id:"or4",test:"Emergency RTH Trigger",standard:"Per OEM spec — target <3 sec activation, successful return"},
    {id:"or5",test:"Low Battery RTH",standard:"Per OEM spec — initiates at threshold, lands safely"},
    {id:"or6",test:"Signal Loss Failsafe",standard:"Per OEM spec — executes RTH, operator notified"},
    {id:"or7",test:"Operator Alert/Notification",standard:"Per OEM spec — target alert to remote operator <5 sec"},
    {id:"or8",test:"Signal Loss Failsafe (2)",standard:"Per OEM spec — executes RTH, operator notified"},
  ],
  "Law Enforcement":[
    {id:"le1",test:"Alert-to-Airborne Response Time",standard:"target <3 min from trigger to on-scene"},
    {id:"le2",test:"Operator Situational Awareness",standard:"live feed to command within 60 sec"},
    {id:"le3",test:"License Plate/ID Legibility — 100ft",standard:"readable at 100ft altitude, 4K zoom"},
    {id:"le3b",test:"License Plate/ID Legibility — 150ft",standard:"readable at 150ft altitude, 4K zoom"},
    {id:"le3c",test:"License Plate/ID Legibility — 200ft",standard:"readable at 200ft altitude, 4K zoom"},
    {id:"le3d",test:"License Plate/ID Legibility — 250ft",standard:"readable at 250ft altitude, 4K zoom"},
    {id:"le3e",test:"License Plate/ID Legibility — 300ft",standard:"readable at 300ft altitude, zoom required"},
    {id:"le3f",test:"License Plate/ID Legibility — 350ft",standard:"readable at 350ft altitude, max zoom"},
    {id:"le3g",test:"License Plate/ID Legibility — 400ft",standard:"readable at 400ft altitude, max zoom"},
    {id:"le4",test:"Suspect/Subject Tracking",standard:"operator maintains lock through 3+ turns"},
    {id:"le5",test:"Evidence-Grade Recording",standard:"tagged, timestamped, chain-of-custody intact"},

    {id:"le7",test:"CAD/Dispatch Integration",standard:"mission auto-triggered from CAD alert"},
  ],
  "Campus Security":[
    {id:"cs1",test:"Scheduled Perimeter Patrol",standard:"autonomous loop, 0 missed waypoints"},
    {id:"cs2",test:"Intrusion Detection Response",standard:"on-scene within 3 min of access alert"},
    {id:"cs3",test:"After-Hours Autonomous Coverage",standard:"full patrol cycle, operator notified"},
    {id:"cs4",test:"Privacy Geofence Enforcement",standard:"no flight over excluded/private zones"},
    {id:"cs5",test:"Access Control Integration",standard:"alarm triggers auto-launch, no manual step"},
    {id:"cs6",test:"Perimeter Monitoring",standard:"operator tracks 3+ subjects simultaneously"},
  ],
  "Critical Infrastructure":[
    {id:"ci1",test:"Perimeter Breach Detection",standard:"detect intrusion, alert operator within 30 sec"},
    {id:"ci2",test:"Thermal Anomaly Scan",standard:"flag equipment fault at operational alt"},
    {id:"ci3",test:"Long-Linear Asset Patrol",standard:"full corridor covered, <2 deviations"},
    {id:"ci4",test:"Night/Low-Light Asset Monitoring",standard:"operator confirms asset status via thermal"},
    {id:"ci5",test:"RF-Denied Environment Response",standard:"executes pre-programmed RTH, no mission abort"},
    {id:"ci6",test:"Restricted Airspace Geofence",standard:"no excursion beyond pre-programmed boundary"},
    {id:"ci7",test:"Incident Documentation",standard:"evidence-grade recording with GPS tagging"},
  ],
};

const WEEKLY_ITEMS = [
  "Propellers — no cracks chips or deformation",
  "Motor mounts — secure no play or vibration",
  "Battery health — capacity >80% rated no swelling",
  "Gimbal and payload mount — secure calibrated",
  "Dock lid actuator — opens/closes freely",
  "Dock charging contacts — clean no corrosion",
  "GCS comms link confirmed",
  "GPS acquisition <90 sec",
  "Remote operator station tested and confirmed",
  "FAA airspace checks completed TFRs NOTAMs",
  "Privacy geofences loaded and verified",
  "Weather conditions logged",
  "All test results entered in evaluation log",
  "Anomalies and maintenance actions documented",
];

const catColors = {
  "Optical / EO":  {color:"#4a9eff",bg:"rgba(74,158,255,0.08)",border:"rgba(74,158,255,0.3)"},
  "Thermal / IR":  {color:"#f59e0b",bg:"rgba(245,158,11,0.08)",border:"rgba(245,158,11,0.3)"},
  "Multispectral": {color:"#34d399",bg:"rgba(52,211,153,0.08)",border:"rgba(52,211,153,0.3)"},
  "LiDAR":         {color:"#a78bfa",bg:"rgba(167,139,250,0.08)",border:"rgba(167,139,250,0.3)"},
  "Communication": {color:"#ff6b4a",bg:"rgba(204,34,0,0.08)",  border:"rgba(204,34,0,0.3)"},
  "Spotlight":     {color:"#fde68a",bg:"rgba(253,230,138,0.08)",border:"rgba(253,230,138,0.3)"},
  "Speaker":       {color:"#6ee7b7",bg:"rgba(110,231,183,0.08)",border:"rgba(110,231,183,0.3)"},
  "Other":         {color:"#94a3b8",bg:"rgba(148,163,184,0.06)",border:"rgba(148,163,184,0.25)"},
};

const PAYLOAD_LIST = [
  {id:"eo_rgb",category:"Optical / EO",label:"EO / RGB Camera"},
  {id:"eo_4k",category:"Optical / EO",label:"4K Camera"},
  {id:"eo_zoom",category:"Optical / EO",label:"Optical Zoom Camera"},
  {id:"thermal_ir",category:"Thermal / IR",label:"Thermal / IR Camera"},
  {id:"thermal_rad",category:"Thermal / IR",label:"Radiometric Thermal"},
  {id:"multi",category:"Multispectral",label:"Multispectral Sensor"},
  {id:"lidar",category:"LiDAR",label:"LiDAR Scanner"},
  {id:"comm_lte",category:"Communication",label:"LTE / 5G Module"},
  {id:"spotlight",category:"Spotlight",label:"Spotlight"},
  {id:"speaker",category:"Speaker",label:"Speaker / PA"},
  {id:"other",category:"Other",label:"Other Payload"},
];

const EVAL_MATRIX = [
  {id:"compliance",label:"Compliance",icon:"📋",color:"#4a9eff",bg:"rgba(74,158,255,0.08)",border:"rgba(74,158,255,0.3)",rows:[
    {id:"ndaa",label:"NDAA Compliant",type:"toggle"},{id:"blueuas",label:"Blue UAS Listed",type:"toggle"},
    {id:"faa",label:"FAA Part 107 Fit",type:"toggle"},{id:"remoteid",label:"Remote ID Broadcast",type:"toggle"},
    {id:"radio",label:"Radio / FCC Approvals",type:"toggle"},{id:"data",label:"Data Handling",type:"toggle"},
    {id:"comp_score",label:"Compliance Result",type:"pfn"},{id:"comp_notes",label:"Notes",type:"notes"},
  ]},
  {id:"payloads",label:"Payloads",icon:"📷",color:"#f59e0b",bg:"rgba(245,158,11,0.08)",border:"rgba(245,158,11,0.3)",rows:[
    {id:"eo",label:"EO / RGB Camera",type:"toggle"},{id:"thermal",label:"Thermal / IR",type:"toggle"},
    {id:"zoom",label:"Optical Zoom",type:"text"},{id:"radiometric",label:"Radiometric Capability",type:"toggle"},
    {id:"lowlight",label:"Low-Light Performance",type:"toggle"},{id:"firstparty",label:"First-Party Payload",type:"toggle"},
    {id:"thirdparty",label:"Third-Party Payload Support",type:"toggle"},{id:"pay_score",label:"Payload Result",type:"pfn"},
    {id:"pay_notes",label:"Notes",type:"notes"},
  ]},
  {id:"aircraft",label:"Aircraft Performance",icon:"✈",color:"#34d399",bg:"rgba(52,211,153,0.08)",border:"rgba(52,211,153,0.3)",rows:[
    {id:"flighttime",label:"Flight Time (min)",type:"text"},{id:"range",label:"Range (mi)",type:"text"},
    {id:"windresist",label:"Wind Resistance (mph)",type:"text"},{id:"optemp",label:"Operating Temp Range",type:"text"},
    {id:"launchmethod",label:"Launch / Recovery Method",type:"text"},{id:"iprating",label:"IP Rating",type:"text"},
    {id:"ac_score",label:"Aircraft Performance Result",type:"pfn"},{id:"ac_notes",label:"Notes",type:"notes"},
  ]},
  {id:"autonomy",label:"Autonomy & Safety",icon:"🤖",color:"#a78bfa",bg:"rgba(167,139,250,0.08)",border:"rgba(167,139,250,0.3)",rows:[
    {id:"obsavoid",label:"Obstacle Avoidance",type:"toggle"},{id:"daa",label:"Detect & Avoid (DAA)",type:"toggle"},
    {id:"parachute",label:"Parachute System",type:"toggle"},{id:"dockreliab",label:"Docking Reliability",type:"toggle"},
    {id:"bvlos",label:"BVLOS Capable",type:"toggle"},
    {id:"au_score",label:"Autonomy & Safety Result",type:"pfn"},{id:"au_notes",label:"Notes",type:"notes"},
  ]},
  {id:"support",label:"Support & Lifecycle",icon:"🔧",color:"#ff6b4a",bg:"rgba(204,34,0,0.08)",border:"rgba(204,34,0,0.3)",rows:[
    {id:"partsavail",label:"Parts Availability",type:"text"},{id:"repair",label:"Repair Turnaround",type:"text"},
    {id:"warranty",label:"Warranty",type:"text"},{id:"training",label:"Training Provided",type:"toggle"},
    {id:"swlicense",label:"Software Licensing Model",type:"text"},{id:"oemresp",label:"OEM Responsiveness",type:"text"},
    {id:"su_score",label:"Support & Lifecycle Result",type:"pfn"},{id:"su_notes",label:"Notes",type:"notes"},
  ]},
];

const OPSITES = [
  {key:"site_TRG",badge:"TRG",label:"Training Site — Downtown / Urban",dock:true},
  {key:"site_TS1",badge:"RROB",label:"Training Site — Rural",dock:true},
  {key:"site_DXD",badge:"DXD",label:"DXD HQ",dock:false},
  {key:"site_NEW",badge:"NEW",label:"New Site",dock:false},
];

const DEMO_MISSIONS = [
  {id:"m01",num:"01",icon:"🚀",title:"First on Scene",duration:"3-4 min",platforms:"DJI Dock / Sunflower Labs / Skydio / Quantum Systems",capability:"Autonomous Rapid Deployment",color:"#4a9eff",bg:"rgba(74,158,255,0.08)",border:"rgba(74,158,255,0.3)",platformNotes:[{name:"DJI Dock",note:"Primary platform — dock lid auto-opens, drone airborne in <90 sec from trigger."},{name:"Sunflower Labs",note:"Perimeter sensor triggers auto-launch."},{name:"Skydio",note:"Demonstrates autonomous flight to incident waypoint with obstacle avoidance."},{name:"Quantum Systems",note:"Showcases long-range autonomous response."}],scenario:"A triggered alarm comes in. Before any patrol unit can respond, the drone is already airborne.",flow:[{t:"T+0:00",step:"Alarm trigger simulated. Dock lid opens autonomously."},{t:"T+0:30",step:"Drone airborne, navigating to incident. No pilot input."},{t:"T+1:30",step:"Live EO feed on screen."},{t:"T+2:30",step:"Drone holds stable hover."},{t:"T+3:30",step:"Drone autonomously returns to dock."}],talking:["Average police response: 7-11 min. This drone is on scene in under 90 seconds.","No pilot required — fully autonomous.","Continuous 24/7 readiness."]},
  {id:"m02",num:"02",icon:"🔍",title:"License Plate Identification",duration:"2-3 min",platforms:"DJI Dock / Skydio / Quantum Systems / Sunflower Labs",capability:"License Plate Reading at Multiple Altitudes",color:"#f59e0b",bg:"rgba(245,158,11,0.08)",border:"rgba(245,158,11,0.3)",platformNotes:[{name:"DJI Dock",note:"Zoom payload reads plates from each altitude."},{name:"Skydio",note:"AI subject lock holds plate in frame."},{name:"Quantum Systems",note:"Fixed-wing altitude transitions."},{name:"Sunflower Labs",note:"Autonomous intercept and hover positioning."}],scenario:"The drone identifies a vehicle license plate at progressively increasing altitudes.",flow:[{t:"T+0:00",step:"Drone launches and hovers over target vehicle."},{t:"T+0:30",step:"50ft — Plate captured and read."},{t:"T+1:00",step:"100ft — Zoom adjusted."},{t:"T+1:30",step:"150ft — Plate legibility assessed."},{t:"T+2:00",step:"200ft — Near-max zoom."},{t:"T+2:30",step:"400ft — Maximum zoom."}],talking:["200ft is the operational sweet spot for urban DFR.","400ft separates platforms.","All footage GPS-tagged for chain of custody."]},
  {id:"m03",num:"03",icon:"🌡",title:"Heat Signature",duration:"3-5 min",platforms:"DJI Dock / Skydio / Quantum Systems / Sunflower Labs",capability:"Thermal / FLIR Detection",color:"#ff6b4a",bg:"rgba(204,34,0,0.08)",border:"rgba(204,34,0,0.3)",platformNotes:[{name:"DJI Dock",note:"Zenmuse H20T dual-sensor."},{name:"Skydio",note:"Autonomous thermal search pattern."},{name:"Quantum Systems",note:"Wide-area thermal sweep."},{name:"Sunflower Labs",note:"Triggered by motion sensor."}],scenario:"A suspect fled on foot into a darkened area. The drone goes in first.",flow:[{t:"T+0:00",step:"Drone deploys autonomously."},{t:"T+0:45",step:"Payload switches to thermal."},{t:"T+1:15",step:"Human heat signature visible."},{t:"T+2:00",step:"Drone detects heat signature. Operator pins location."},{t:"T+3:30",step:"Location radioed to ground units."}],talking:["Thermal works in zero-light.","Dual-sensor payloads allow simultaneous feeds.","Reduces officer risk."]},
  {id:"m04",num:"04",icon:"👁",title:"Eyes On",duration:"3-4 min",platforms:"DJI Dock / Skydio / Quantum Systems / Sunflower Labs",capability:"Suspect Tracking + Wide-Area Zoom",color:"#a78bfa",bg:"rgba(167,139,250,0.08)",border:"rgba(167,139,250,0.3)",platformNotes:[{name:"DJI Dock",note:"Zoom payload maintains subject ID at standoff."},{name:"Skydio",note:"AI subject tracking — locks and follows autonomously."},{name:"Quantum Systems",note:"Long-range persistent overwatch."},{name:"Sunflower Labs",note:"Detects subject crossing boundary and hands off."}],scenario:"A subject is moving through a crowded urban environment. Officers need persistent eyes on.",flow:[{t:"T+0:00",step:"Subject identified. Operator taps to lock."},{t:"T+0:30",step:"Autonomous tracking activates."},{t:"T+1:30",step:"Subject hides in crowd. Zoom tightens."},{t:"T+2:30",step:"Thermal layered in as subject moves into shadow."},{t:"T+3:00",step:"Ground units guided in. Subject intercepted."}],talking:["Skydio leads in autonomous obstacle avoidance.","AI tracking removes need for skilled pilot.","Continuous GPS + video creates chain of custody."]},
  {id:"m05",num:"05",icon:"🔎",title:"Crime Scene",duration:"2-3 min",platforms:"DJI Dock / Skydio / Quantum Systems / Sunflower Labs",capability:"Evidence Documentation",color:"#34d399",bg:"rgba(52,211,153,0.08)",border:"rgba(52,211,153,0.3)",platformNotes:[{name:"DJI Dock",note:"Grid survey with high-res EO + zoom."},{name:"Skydio",note:"Autonomous 3D mapping flight."},{name:"Quantum Systems",note:"Wide-area grid survey."},{name:"Sunflower Labs",note:"Triggered deployment the moment scene is declared."}],scenario:"A crime scene has been secured. Investigators need a full aerial survey.",flow:[{t:"T+0:00",step:"Drone deploys and begins grid survey."},{t:"T+0:45",step:"EO zoom scans methodically."},{t:"T+1:30",step:"High-resolution stills captured. GPS-tagged."},{t:"T+2:00",step:"2D orthomosaic map generated."},{t:"T+2:30",step:"Imagery exported for investigative record."}],talking:["Aerial perspective reveals spatial context.","GPS-tagged imagery is court-admissible.","Eliminates premature scene entry."]},
  {id:"m06",num:"06",icon:"🛡",title:"The Perimeter",duration:"3-4 min",platforms:"Sunflower Labs / DJI Dock",capability:"Autonomous Perimeter Patrol",color:"#fbbf24",bg:"rgba(251,191,36,0.08)",border:"rgba(251,191,36,0.3)",platformNotes:null,scenario:"A large commercial campus needs continuous perimeter monitoring overnight.",flow:[{t:"T+0:00",step:"Scheduled patrol auto-launches."},{t:"T+0:30",step:"Drone flies pre-mapped perimeter route."},{t:"T+1:30",step:"Simulated intrusion: person crosses perimeter."},{t:"T+2:00",step:"Drone investigates. Thermal activates."},{t:"T+2:45",step:"Alert escalated."},{t:"T+3:30",step:"Drone resumes patrol or returns to dock."}],talking:["Sunflower Labs purpose-built for this.","One drone covers multiple static cameras.","Alerts AI-filtered — reduces false alarms."]},
];

// ── CHECKLIST DATA ─────────────────────────────────────────────────────────
const SUBJ_CHECKS = [
  "Ease of Use","Quality of the User Interface","Trust in the OEM",
  "How Polished the Demo Feels","How Easy the System Seems to Maintain",
  "How Responsive the Sales or Support Team Seems",
  "How Confident You Feel in the Documentation",
  "How Well the Product Fits Your Mission",
  "Whether the Workflow Feels Clunky or Clean",
  "Whether the Solution Looks Mature or Experimental",
];
const COMP_CHECKS = [
  {cat:"Platform comparison",items:[
    {id:"cmp1",n:"Platform comparison — sensor performance",d:"EO and thermal on identical targets at identical altitudes across platforms",t:"Compare"},
    {id:"cmp2",n:"Autonomy comparison — obstacle avoidance",d:"Identical route with obstacles — avoidance behavior compared",t:"Compare"},
    {id:"cmp3",n:"Autonomy comparison — subject tracking",d:"AI lock and follow through corners, crowds, and shadows",t:"Compare"},
  ]},
  {cat:"Repeatability",items:[
    {id:"rep1",n:"Landing precision — 10 run average",d:"Offset from dock center measured per landing",t:"Repeat"},
    {id:"rep2",n:"Mission consistency — 5 identical waypoint runs",d:"Variance in flight time, path deviation, and completion rate",t:"Repeat"},
  ]},
  {cat:"Endurance / longevity",items:[
    {id:"end1",n:"Battery capacity after 50 cycles",d:"Useable flight time vs cycle 1 baseline — degradation scored",t:"Endurance"},
    {id:"end2",n:"Dock charge/discharge cycle reliability",d:"50+ cycles — contact wear and charge time drift",t:"Endurance"},
    {id:"end3",n:"Component degradation — 20hr flight hours",d:"Motor, prop, gimbal condition at 20hr vs baseline",t:"Endurance"},
  ]},
];
const FMEA_CHECKS = [
  {id:"fm1",n:"Signal loss failsafe",d:"C2 link cut mid-mission at 150ft — confirms RTH and operator notification",t:"RF block"},
  {id:"fm2",n:"Low battery RTH trigger",d:"Battery threshold forced — RTH initiation and dock landing",t:"Threshold"},
  {id:"fm3",n:"Emergency landing behavior",d:"Sensor fault injected — safe descent and landing zone selection",t:"Fault inject"},
  {id:"fm4",n:"RTH reliability — 10 consecutive runs",d:"Repeated RTH — dock accuracy and success rate measured",t:"Repeated"},
];
const ENV_CHECKS = [
  {cat:"Wind resistance",items:[
    {id:"env1",n:"Moderate wind — 13–18mph",d:"Hover stability and mission completion at moderate sustained wind",ph:"e.g. 16mph, 280°"},
    {id:"env2",n:"Strong wind — 25–31mph",d:"Near OEM rated limit — stable flight and RTH under stress",ph:"e.g. 28mph, gusts 34mph"},
  ]},
  {cat:"Temperature extremes",items:[
    {id:"env3",n:"High temperature performance",d:"Flight and dock at or above OEM max rated temp",ph:"e.g. 104°F / 40°C, 80% RH"},
    {id:"env4",n:"Cold temperature performance",d:"Battery and motor at or below OEM min rated temp",ph:"e.g. 14°F / -10°C"},
  ]},
  {cat:"Rain / water ingress",items:[
    {id:"env5",n:"IP rating — rain ingress under flight",d:"Flight in measured precipitation — IP rating confirmed",ph:"e.g. 0.3in/hr, IP43"},
    {id:"env6",n:"Dock seal — water ingress when closed",d:"Dock lid under simulated rain — no ingress to charging bay",ph:"e.g. simulated spray, IP44"},
  ]},
];
const BENCH_CHECKS = [
  {id:"bnc1",n:"C2 signal integrity — 0.25mi",d:"Video latency, command response, link quality at 0.25mi",t:"Range"},
  {id:"bnc2",n:"C2 signal integrity — 0.5mi",d:"Full command and video feed stability at half-mile",t:"Range"},
  {id:"bnc3",n:"C2 signal integrity — 1.0mi",d:"OEM rated max range — link quality and dropout frequency",t:"Range"},
];

const VENDORS = ["DJI","Skydio","Sunflower","Quantum"];

const mkSig = () => ({name:"",role:"",date:"",phase:"",signature:"",notes:"",approved:false,customRole:""});
const mkOEM = (name: string) => ({
  name:name||"",manufacturer:"",model:"",serial:"",dockModel:"",dockSerial:"",
  evaluator:"",startDate:"",location:"",activeSite:"site_TRG",
  specsUrl:"",specsFetchedAt:"",specsFetchStatus:"",
  oemStandards:{},
  scores:{},results:{},notes:{},
  flightLogs:[],weeklyChecks:{},payloadTests:{},
  signoffs:[mkSig()],matrix:{},checklist:{},advChecklist:{},
  procurement:{score:"",decision:"",conditions:"",sites:"",date:"",evaluatorName:""},
  site_TRG:"",site_TS1:"",site_DXD:"",site_NEW:"",
  site_TRG_notes:"",site_TS1_notes:"",site_DXD_notes:"",site_NEW_notes:"",
});

function reducer(state,action){
  const clone=()=>state.oems.map((o,i)=>i===state.activeOEM?{...o}:o);
  const ai=state.activeOEM;
  switch(action.type){
    case "REPLACE_STATE": return action.state; // full replace — used to hydrate from backend
    case "ADD_OEM":    return {...state,oems:[...state.oems,mkOEM(action.name)],activeOEM:state.oems.length};
    case "DEL_OEM":  {const oems=state.oems.filter((_,i)=>i!==action.idx);return {...state,oems,activeOEM:Math.min(state.activeOEM,oems.length-1)};}
    case "SET_ACTIVE": return {...state,activeOEM:action.idx};
    case "UPD_FIELD":  {const o=clone();o[ai][action.f]=action.v;return {...state,oems:o};}
    case "UPD_RESULT": {const o=clone();o[ai].results={...o[ai].results,[action.id]:action.v};return {...state,oems:o};}
    case "UPD_NOTE":   {const o=clone();o[ai].notes={...o[ai].notes,[action.id]:action.v};return {...state,oems:o};}
    case "ADD_LOG":    {const o=clone();o[ai].flightLogs=[...o[ai].flightLogs,{id:Date.now(),date:"",missionNo:"",site:"",evaluator:"",phase:"",metarRaw:"",windDir:"",windSpeed:"",windGust:"",windSpeedMph:"",windVar:"",visibility:"",sky1:"",sky1Alt:"",tempC:"",tempF:"",dewPointC:"",relHumidity:"",altimeter:"",presentWeather:"",flightConditions:"",goNoGo:"",remarks:"",flightNotes:""}];return {...state,oems:o};}
    case "UPD_LOG":    {const o=clone();o[ai].flightLogs=o[ai].flightLogs.map((l,i)=>i===action.li?{...l,[action.f]:action.v}:l);return {...state,oems:o};}
    case "DEL_LOG":    {const o=clone();o[ai].flightLogs=o[ai].flightLogs.filter((_,i)=>i!==action.li);return {...state,oems:o};}
    case "TOGGLE_WEEK":{const o=clone();const k=action.w+"_"+action.item;o[ai].weeklyChecks={...o[ai].weeklyChecks,[k]:!o[ai].weeklyChecks[k]};return {...state,oems:o};}
    case "ADD_SIG":    {const o=clone();o[ai].signoffs=[...(o[ai].signoffs||[]),mkSig()];return {...state,oems:o};}
    case "UPD_SIG":    {const o=clone();o[ai].signoffs=o[ai].signoffs.map((s,i)=>i===action.si?{...s,[action.f]:action.v}:s);return {...state,oems:o};}
    case "DEL_SIG":    {const o=clone();o[ai].signoffs=o[ai].signoffs.filter((_,i)=>i!==action.si);return {...state,oems:o};}
    case "TOGGLE_APPROVED":{const o=clone();o[ai].signoffs=o[ai].signoffs.map((s,i)=>i===action.si?{...s,approved:!s.approved}:s);return {...state,oems:o};}
    case "UPD_PROC":   {const o=clone();o[ai].procurement={...o[ai].procurement,[action.f]:action.v};return {...state,oems:o};}
    case "ADD_RUN":    {const o=clone();const runs=o[ai].testRuns||[];o[ai].testRuns=[...runs,{id:Date.now(),label:action.label||"Run "+(runs.length+1),date:"",time:"",evaluator:"",section:action.section||"",vendor:o[ai].name||"",wxSummary:"",results:{},notes:{}}];return {...state,oems:o};}
    case "UPD_RUN":    {const o=clone();o[ai].testRuns=o[ai].testRuns.map((r,i)=>i===action.ri?{...r,[action.f]:action.v}:r);return {...state,oems:o};}
    case "UPD_RUN_RESULT":{const o=clone();o[ai].testRuns=o[ai].testRuns.map((r,i)=>i===action.ri?{...r,results:{...r.results,[action.id]:action.v}}:r);return {...state,oems:o};}
    case "DEL_RUN":    {const o=clone();o[ai].testRuns=o[ai].testRuns.filter((_,i)=>i!==action.ri);return {...state,oems:o};}
    case "SET_MATRIX": return {...state,oems:action.oems};
    case "UPD_ADV_CHECKLIST":{const o=clone();o[ai].advChecklist={...o[ai].advChecklist,[action.k]:action.v};return {...state,oems:o};}
    default: return state;
  }
}

function parseMetar(raw){
  const r=raw.trim().toUpperCase(),out={metarRaw:raw};
  const wm=r.match(/\b(VRB|\d{3})(\d{2,3})(G(\d{2,3}))?KT\b/);
  if(wm){out.windDir=wm[1]==="VRB"?"VRB Variable":wm[1];out.windSpeed=parseInt(wm[2]).toString();out.windSpeedMph=(parseInt(wm[2])*1.15078).toFixed(1);if(wm[4])out.windGust=parseInt(wm[4]).toString();}
  const vm=r.match(/\b(\d+(?:\/\d+)?SM)\b/);if(vm)out.visibility=vm[1].replace("SM","");
  const tm=r.match(/\b(M?\d{2})\/(M?\d{2})\b/);if(tm){const p=s=>s.startsWith("M")?-parseInt(s.slice(1)):parseInt(s);const tc=p(tm[1]),dc=p(tm[2]);out.tempC=tc.toString();out.tempF=((tc*9/5)+32).toFixed(0);out.dewPointC=dc.toString();out.relHumidity=Math.round(100*Math.exp((17.625*dc)/(243.04+dc))/Math.exp((17.625*tc)/(243.04+tc)))+"%";}
  const am=r.match(/\bA(\d{4})\b/);if(am)out.altimeter=(parseInt(am[1])/100).toFixed(2);
  const skyMap={SKC:"SKC Clear",CLR:"SKC Clear",FEW:"FEW Few Clouds",SCT:"SCT Scattered",BKN:"BKN Broken",OVC:"OVC Overcast",VV:"VV Vertical Visibility"};
  const sr=/\b(SKC|CLR|FEW|SCT|BKN|OVC|VV)(\d{3})?\b/g;let sm;const sl=[];while((sm=sr.exec(r))!==null)sl.push({cov:skyMap[sm[1]]||sm[1],alt:sm[2]||""});
  if(sl[0]){out.sky1=sl[0].cov;out.sky1Alt=sl[0].alt;}
  const rm=r.match(/\bRMK\b(.+)$/);if(rm)out.remarks=rm[1].trim();
  return out;
}

const C={card:"rgba(12,12,12,0.72)",border:"rgba(255,255,255,0.09)",input:"rgba(255,255,255,0.07)",accent:"#c8c8c8",text:"#e8e8e8",muted:"#888",faint:"#444"};
const pfColor=v=>v==="Pass"?"#86efac":v==="Fail"?"#fca5a5":v==="N/A"?"#fde68a":C.muted;
const pfBg=v=>v==="Pass"?"rgba(20,83,45,0.5)":v==="Fail"?"rgba(127,29,29,0.5)":v==="N/A"?"rgba(120,53,15,0.5)":"rgba(255,255,255,0.04)";
const pfBrd=v=>v==="Pass"?"#166534":v==="Fail"?"#991b1b":v==="N/A"?"#854d0e":C.border;
const inp={background:C.input,border:"1px solid "+C.border,borderRadius:5,color:C.text,padding:"5px 9px",fontSize:12,boxSizing:"border-box",width:"100%"};
const lbl={color:C.muted,fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8};

function PFButtons({value,onChange}){
  return(
    <div style={{display:"flex",gap:4}}>
      {["Pass","Fail","N/A"].map(opt=>(
        <button key={opt} onClick={()=>onChange(opt)}
          style={{padding:"4px 10px",borderRadius:5,border:"1px solid "+(value===opt?pfBrd(opt):C.border),
            background:value===opt?pfBg(opt):"rgba(255,255,255,0.03)",
            color:value===opt?pfColor(opt):"#fff",fontSize:11,fontWeight:value===opt?700:400,
            cursor:"pointer",opacity:value===opt?1:0.45,whiteSpace:"nowrap"}}>
          {opt}
        </button>
      ))}
    </div>
  );
}

// ── Rating buttons for advanced checklist ──────────────────────────────────
function MSButtons({value,onChange,types}){
  const opts=types||[["ms","Met"],["bs","Below"],["na","N/A"]];
  const col=v=>v==="ms"||v==="pass"||v==="yes"?"#86efac":v==="bs"||v==="fail"||v==="no"?"#fca5a5":v==="part"?"#fde68a":"#888";
  const bg=v=>v==="ms"||v==="pass"||v==="yes"?"rgba(20,83,45,0.5)":v==="bs"||v==="fail"||v==="no"?"rgba(127,29,29,0.5)":v==="part"?"rgba(120,53,15,0.5)":"rgba(255,255,255,0.05)";
  const brd=v=>v==="ms"||v==="pass"||v==="yes"?"#166534":v==="bs"||v==="fail"||v==="no"?"#991b1b":v==="part"?"#854d0e":C.border;
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <div style={{display:"flex",gap:3}}>
        {opts.map(([cls,lab])=>(
          <button key={cls} onClick={()=>onChange(cls)}
            style={{fontSize:10,padding:"2px 6px",borderRadius:4,border:"1px solid "+(value===cls?brd(cls):C.border),
              background:value===cls?bg(cls):"rgba(255,255,255,0.03)",
              color:value===cls?col(cls):C.muted,cursor:"pointer",whiteSpace:"nowrap",fontWeight:value===cls?700:400}}>
            {lab}
          </button>
        ))}
      </div>
      {(value==="bs"||value==="fail"||value==="no")&&(
        <textarea placeholder="Note..." style={{...inp,fontSize:10,minHeight:32,resize:"vertical",width:90,padding:"3px 5px"}}/>
      )}
    </div>
  );
}

// ── Context ────────────────────────────────────────────────────────────────
const TeviCtx = createContext(null);

// ── Local executive summary generator ─────────────────────────────────────
// Generates a deterministic, data-driven summary from the test results
// already in state. No API key, no network — always works. The /api/claude
// proxy is still tried first, so if an ANTHROPIC_API_KEY is configured the
// user gets the AI-written version; if not, this fallback kicks in.

function _parseTestsCtx(contextData){
  // The Drone TEVI context comes in two formats:
  //   1. New line-oriented format from buildTestCtx (per-section):
  //        "- Test Name: Pass | Standard: ... | Tester: ..."
  //   2. Legacy single-line/comma-separated format still used by
  //      use-cases / payload contexts:
  //        "LE: Tests: name1: Pass, name2: Fail | Campus: Tests: ..."
  // Try line-anchored first; fall back to legacy if no hits.
  var passes=[],fails=[],pendings=[];
  var lines=String(contextData||'').split('\n');
  lines.forEach(function(ln){
    var m=ln.match(/^\s*-\s+(.+?):\s+(Pass|Fail|Pending|N\/A)\b/i);
    if(!m) return;
    // Stop at the first " | " so trailing pipe-delimited metadata
    // (Standard / Tester / Date / Notes) never leaks into the name.
    var name=m[1].split(' | ')[0].replace(/^Tests:\s*/i,'').trim();
    if(!name||name.length>120) return;
    var r=m[2].toLowerCase();
    if(r==='pass') passes.push(name);
    else if(r==='fail') fails.push(name);
    else if(r==='pending') pendings.push(name);
  });
  if(passes.length+fails.length+pendings.length===0){
    // Legacy single-line format: "<name>: <result>" segments separated
    // by commas or pipes. Anchor each match to start at a separator
    // boundary so we don't grab arbitrary text containing colons.
    var re=/(?:^|[,|])\s*([^,|:]{2,120}?):\s+(Pass|Fail|Pending|N\/A)\b/gi;
    var mm;
    while((mm=re.exec(contextData||''))!==null){
      var nm=mm[1].replace(/^Tests:\s*/i,'').trim();
      if(!nm||nm.length>120) continue;
      var rr=mm[2].toLowerCase();
      if(rr==='pass') passes.push(nm);
      else if(rr==='fail') fails.push(nm);
      else if(rr==='pending') pendings.push(nm);
    }
  }
  return {passes:passes,fails:fails,pendings:pendings};
}

function _recommendation(passes,fails,pendings){
  var total=passes.length+fails.length+pendings.length;
  if(total===0) return "CONDITIONAL — testing has not started; cannot recommend until results are recorded.";
  var rate=Math.round(passes.length/total*100);
  if(fails.length===0 && pendings.length===0) return "PROCEED — all evaluated tests passed.";
  if(fails.length===0) return "CONDITIONAL — complete the remaining "+pendings.length+" pending test"+(pendings.length===1?"":"s")+" before final decision.";
  if(rate>=80) return "CONDITIONAL — "+passes.length+"/"+total+" tests pass ("+rate+"%). Address the "+fails.length+" failing item"+(fails.length===1?"":"s")+" before procurement.";
  if(rate>=50) return "CONDITIONAL — significant gaps ("+fails.length+" failures, "+rate+"% pass). Re-test after remediation; revisit decision.";
  return "DO NOT PROCEED — only "+rate+"% pass rate. Platform does not meet baseline performance requirements.";
}

// ── Local executive summary helpers ─────────────────────────────────────
//
// All generators below produce narrative prose directly from the OEM
// state object. They DO NOT depend on the Anthropic API — when API usage
// is exhausted or unavailable, these run instead and yield the same
// information, just deterministically rather than written by a model.

// Map a section name (as passed to ExecSummaryBtn) to which TESTS keys
// it spans, plus whatever ancillary state it draws from.
function _sectionPlan(sectionName){
  var sn=sectionName||"";
  if(/Flight Performance|Drone\b/i.test(sn))    return {key:"section",tests:["Flight Performance"],idPrefix:["fp"],topic:"drone airframe and flight performance"};
  if(/Dock/i.test(sn))                            return {key:"section",tests:["Dock Integration"],idPrefix:["di"],topic:"dock integration and autonomous launch/recovery"};
  if(/Sensors/i.test(sn))                         return {key:"section",tests:["Sensors & Payload"],idPrefix:["sp"],topic:"sensor and payload performance"};
  if(/Reliability|Operations/i.test(sn))          return {key:"section",tests:["Operations & Reliability"],idPrefix:["or"],topic:"operations and reliability"};
  if(/Use Cases/i.test(sn))                       return {key:"usecases",tests:["Law Enforcement","Campus Security","Critical Infrastructure"],idPrefix:["le","cs","ci"],topic:"law-enforcement, campus-security, and critical-infrastructure mission profiles"};
  if(/Payload Compatibility/i.test(sn))           return {key:"payload",tests:[],topic:"payload compatibility"};
  if(/Weekly/i.test(sn))                          return {key:"weekly",tests:[],topic:"weekly inspection compliance"};
  if(/Final Evaluation|Sign-?Off|Chief Pilot/i.test(sn)) return {key:"final",tests:[],topic:"final procurement evaluation and sign-off"};
  if(/Vendor Comparison|Compare/i.test(sn))       return {key:"compare",tests:[],topic:"vendor comparison matrix"};
  if(/Evaluation Checklist/i.test(sn))            return {key:"checklist",tests:[],topic:"combined evaluation checklist (subjective + comparative + FMEA + environmental + benchmarks)"};
  if(/Test Results Log/i.test(sn))                return {key:"alltests",tests:["Flight Performance","Dock Integration","Sensors & Payload","Operations & Reliability"],topic:"full test results log across every category"};
  return {key:"section",tests:[],topic:sn};
}

function _tally(oem, testsKeys){
  var p=0,f=0,pd=0,total=0;
  (testsKeys||[]).forEach(function(tk){
    (TESTS[tk]||[]).forEach(function(t){
      total++;
      var r=(oem.results||{})[t.id+"_pfn"]||"Pending";
      if(r==="Pass") p++;
      else if(r==="Fail") f++;
      else pd++;
    });
  });
  var rate=total>0?Math.round(p/(p+f||1)*100):0;
  return {p:p,f:f,pd:pd,total:total,rate:rate};
}

// Collect failures with their evaluator note (if any) for a set of TEST keys.
function _failuresWithNotes(oem, testsKeys){
  var out=[];
  (testsKeys||[]).forEach(function(tk){
    (TESTS[tk]||[]).forEach(function(t){
      var r=(oem.results||{})[t.id+"_pfn"];
      if(r==="Fail"){
        out.push({name:t.test,note:(oem.notes||{})[t.id]||"",section:tk});
      }
    });
  });
  return out;
}

// Collect passes that have a notable evaluator note attached.
function _passesWithNotes(oem, testsKeys, max){
  var out=[];
  var cap=max||10;
  (testsKeys||[]).forEach(function(tk){
    (TESTS[tk]||[]).forEach(function(t){
      if(out.length>=cap) return;
      var r=(oem.results||{})[t.id+"_pfn"];
      var n=(oem.notes||{})[t.id]||"";
      if(r==="Pass" && n && n.length>4){
        out.push({name:t.test,note:n,section:tk});
      }
    });
  });
  return out;
}

// Collect every pending test by name for a section.
function _pendings(oem, testsKeys){
  var out=[];
  (testsKeys||[]).forEach(function(tk){
    (TESTS[tk]||[]).forEach(function(t){
      var r=(oem.results||{})[t.id+"_pfn"];
      if(!r || r==="Pending") out.push(t.test);
    });
  });
  return out;
}

function _platformHeader(oem){
  var bits=[];
  if(oem.name)         bits.push(oem.name);
  if(oem.model)        bits.push("("+oem.model+")");
  var hdr=bits.join(" ");
  var mfg=oem.manufacturer?" manufactured by "+oem.manufacturer:"";
  return hdr+mfg;
}

function _evaluatorSentence(oem){
  var parts=[];
  if(oem.evaluator)  parts.push("Lead evaluator: "+oem.evaluator);
  if(oem.startDate)  parts.push("evaluation start "+oem.startDate);
  if(oem.location)   parts.push("primary test location "+oem.location);
  var actSite=OPSITES.find(function(s){return s.key===(oem.activeSite||"site_TRG");});
  if(actSite)        parts.push("currently testing at "+actSite.label);
  return parts.join(", ")+".";
}

function _procSentence(oem){
  var d=(oem.procurement&&oem.procurement.decision)||"";
  var c=(oem.procurement&&oem.procurement.conditions)||"";
  if(!d) return "No final procurement decision has been recorded yet — this evaluation remains open.";
  var out="Current procurement status: "+d+".";
  if(c) out+=" Conditions on record: "+c+".";
  return out;
}

function _decisionRule(stats){
  if(stats.total===0)                return "CONDITIONAL — testing has not started; cannot recommend until results are recorded.";
  if(stats.f===0 && stats.pd===0)    return "PROCEED — every evaluated test in scope passed. Recommend moving to the next phase of procurement.";
  if(stats.f===0)                    return "CONDITIONAL — complete the remaining "+stats.pd+" pending test"+(stats.pd===1?"":"s")+" before final decision. No failures observed so far.";
  if(stats.rate>=80)                 return "CONDITIONAL — "+stats.p+"/"+(stats.p+stats.f)+" completed tests pass ("+stats.rate+"%). Address the "+stats.f+" failing item"+(stats.f===1?"":"s")+" before procurement.";
  if(stats.rate>=50)                 return "CONDITIONAL — significant gaps ("+stats.f+" failure"+(stats.f===1?"":"s")+", "+stats.rate+"% completed-test pass rate). Re-test after remediation, then revisit the decision.";
  return                              "DO NOT PROCEED — only "+stats.rate+"% pass rate on completed tests. The platform does not meet baseline performance requirements for this scope.";
}

function _wordCount(s){
  return (String(s||"").trim().match(/\S+/g)||[]).length;
}

// Pad a body of text so its final word count lands in [minWords, maxWords]
// by appending coherent closing sentences derived from the OEM state.
function _padToRange(body, oem, stats, minWords, maxWords, scope){
  var wc=_wordCount(body);
  var sentences=[];
  if(wc<minWords){
    // Build a pool of true, non-redundant closing sentences. Each draws
    // from real state so the padding is informative rather than filler.
    var pool=[];
    var actSite=OPSITES.find(function(s){return s.key===(oem.activeSite||"site_TRG");});
    if(actSite) pool.push("Tests were conducted against the "+actSite.label+" environment, which informs how representative these results are for production deployment in similar settings.");
    if(stats.total>0) pool.push("Across the "+scope+" scope, "+stats.p+" test"+(stats.p===1?"":"s")+" passed, "+stats.f+" failed, and "+stats.pd+" remain pending, which yields a completed-test pass rate of "+stats.rate+"%.");
    if(oem.specsUrl) pool.push("Where ambiguity arose, the OEM specifications source referenced on file ("+oem.specsUrl+") served as the authority for minimum-standard interpretation.");
    if((oem.flightLogs||[]).length>0) pool.push("Flight log entries on record for this platform ("+oem.flightLogs.length+" entries) provide additional contextual telemetry that should be reviewed alongside this summary.");
    var sectionSig=Object.keys(oem.notes||{}).filter(function(k){return k.indexOf("section_signoff_")===0;}).filter(function(k){ try{var b=JSON.parse(oem.notes[k]); return b&&b.approved;}catch{return false;} }).length;
    if(sectionSig>0) pool.push(sectionSig+" section sign-off"+(sectionSig===1?" has":"s have")+" already been formally approved for this platform, which represents prior agreement on the validity of those completed sections.");
    if(stats.f===0 && stats.total>0) pool.push("The absence of failures in completed tests is a strong indicator that the platform is meeting the documented minimum standards for this scope, though pending items should still be closed out before unconditional sign-off.");
    if(stats.f>0) pool.push("Each failure should be paired with the corresponding evaluator note to determine whether the root cause is a platform limitation, an environmental condition, an operator-procedure gap, or a misalignment between the OEM specification and the field requirement.");
    pool.push("This summary was generated locally from the structured evaluation state captured by the evaluator and does not depend on any external AI service; the underlying facts are deterministic given the data entered.");
    pool.push("Reviewers comparing this platform against alternative vendors should pair this section's findings with the Compare tab matrix values to put the numbers in head-to-head context.");
    pool.push("Where evaluator notes mention specific environmental conditions, those conditions should be replicated during any re-test so the results are directly comparable rather than apples-to-oranges.");
    pool.push("The evaluator should treat the recommendation in this report as advisory; final procurement authority remains with the Chief Pilot and the Commanding Officer / Approver listed in the Final Evaluation tab.");
    // Append sentences until we cross minWords
    for(var i=0;i<pool.length && _wordCount(body)<minWords; i++){
      sentences.push(pool[i]);
      body=body+"\n\n"+pool[i];
    }
  }
  // Hard cap at maxWords — if we somehow overshot, truncate to the last
  // complete sentence within the cap.
  if(_wordCount(body)>maxWords){
    var words=body.split(/(\s+)/);
    var taken=0; var out=[];
    for(var j=0;j<words.length;j++){
      out.push(words[j]);
      if(/\S/.test(words[j])) taken++;
      if(taken>=maxWords) break;
    }
    body=out.join("");
    var lastEnd=Math.max(body.lastIndexOf("."), body.lastIndexOf("!"), body.lastIndexOf("?"));
    if(lastEnd>20) body=body.slice(0,lastEnd+1);
  }
  return body;
}

// ── Per-section summary (500–900 words) ────────────────────────────────
function _buildSectionSummary(sectionName, oem){
  var plan=_sectionPlan(sectionName);
  var stats=_tally(oem, plan.tests);
  var fails=_failuresWithNotes(oem, plan.tests);
  var passNotes=_passesWithNotes(oem, plan.tests, 8);
  var pendings=_pendings(oem, plan.tests);

  var out=[];

  out.push("SECTION OVERVIEW");
  out.push("This report covers the "+plan.topic+" evaluation of the "+_platformHeader(oem)+" platform against the "+sectionName+" criteria. "+_evaluatorSentence(oem)+" "+_procSentence(oem));
  if(oem.specsUrl) out.push("OEM specifications source on file: "+oem.specsUrl+".");

  out.push("");
  out.push("TEST RESULTS — FULL ROSTER");
  if(stats.total===0){
    out.push("No tests have been defined or executed for this section yet, so quantitative results are unavailable. The evaluator should populate the test roster before relying on this summary for any procurement decision.");
  } else {
    out.push("Across "+stats.total+" defined test"+(stats.total===1?"":"s")+" in scope, "+stats.p+" passed, "+stats.f+" failed, and "+stats.pd+" remain pending. That yields a completed-test pass rate of "+stats.rate+"% ("+(stats.p+stats.f)+" tests completed out of "+stats.total+" total).");
    // Itemize results inline
    plan.tests.forEach(function(tk){
      var rows=(TESTS[tk]||[]).map(function(t){
        var r=(oem.results||{})[t.id+"_pfn"]||"Pending";
        return "  • "+t.test+" — "+r;
      });
      if(rows.length>0){
        out.push("");
        out.push(tk+":");
        out.push(rows.join("\n"));
      }
    });
  }

  if(fails.length>0){
    out.push("");
    out.push("FAILING TESTS — DETAIL");
    fails.forEach(function(x){
      out.push("• "+x.name+(x.section&&plan.tests.length>1?" ("+x.section+")":"")+":");
      out.push("    Evaluator note: "+(x.note?'"'+x.note+'"':"(no note recorded)"));
    });
  }

  if(pendings.length>0){
    out.push("");
    out.push("PENDING TESTS");
    out.push(pendings.map(function(n){return "• "+n;}).join("\n"));
  }

  if(passNotes.length>0){
    out.push("");
    out.push("NOTABLE EVALUATOR OBSERVATIONS ON PASSING TESTS");
    passNotes.forEach(function(x){
      out.push('• '+x.name+': "'+x.note+'"');
    });
  }

  // Pull any non-test free-text notes whose key matches this section's
  // ID prefix list (e.g. "fp1", "di3"). These are the per-test evaluator
  // narrative notes the user has typed in.
  var notesList=[];
  if(oem.notes && plan.idPrefix){
    Object.keys(oem.notes).forEach(function(k){
      // skip metadata side-cars
      if(/_tester$|_date$/.test(k)) return;
      if(k.indexOf("section_signoff_")===0 || k.indexOf("wx_")===0) return;
      for(var i=0;i<plan.idPrefix.length;i++){
        if(k.indexOf(plan.idPrefix[i])===0){
          var v=oem.notes[k];
          if(typeof v==="string" && v.trim()) notesList.push({k:k,v:v});
          break;
        }
      }
    });
  }
  if(notesList.length>0){
    out.push("");
    out.push("EVALUATOR-TYPED FINDINGS (VERBATIM)");
    notesList.slice(0,30).forEach(function(n){
      var label=n.k;
      // Try to resolve the test ID -> human name for readability.
      var resolved=null;
      Object.keys(TESTS).forEach(function(sec){
        TESTS[sec].forEach(function(t){ if(t.id===n.k){ resolved=t.test; } });
      });
      if(resolved) label=resolved;
      out.push('• '+label+': "'+n.v+'"');
    });
    if(notesList.length>30) out.push("(+"+(notesList.length-30)+" additional notes on file — see the section's test rows for full detail)");
  }

  out.push("");
  out.push("OPERATIONAL IMPACT");
  if(stats.total===0){
    out.push("Operational readiness for this section cannot be assessed until tests are completed and results entered. Evaluators should treat the section as untested rather than implicitly passing.");
  } else if(stats.f===0 && stats.pd===0){
    out.push("The platform demonstrates consistent performance across every evaluated requirement in scope. No remediation items are outstanding, and operators can proceed to deployment consideration within this functional domain with confidence in the documented test outcomes.");
  } else if(stats.f===0){
    out.push("The platform is tracking well so far at a "+stats.rate+"% completed-test pass rate with "+stats.pd+" item"+(stats.pd===1?"":"s")+" still outstanding. Priority should be on closing out the remaining checks before final sign-off, since uncompleted tests leave gaps that could surface as deployment-blocking issues only after procurement is committed.");
  } else if(stats.rate>=60){
    out.push("The platform shows acceptable overall performance but exhibits "+stats.f+" specific weak point"+(stats.f===1?"":"s")+" that require mitigation. Operators must be briefed on the identified failure modes before any field deployment, and a re-test should be scheduled after OEM remediation, software or firmware updates, or operator-procedure changes have been applied.");
  } else {
    out.push("Platform performance is below the required threshold for operational deployment in this section, at only "+stats.rate+"% pass on completed tests. Significant remediation, deeper OEM engagement, or evaluation of an alternative platform is required before any further investment is committed.");
  }

  out.push("");
  out.push("RECOMMENDATION");
  out.push(_decisionRule(stats));

  var body=out.join("\n");
  body=_padToRange(body, oem, stats, 520, 900, plan.topic);
  return body;
}

// ── Overview / comprehensive summary (1000–1500 words) ─────────────────
function _buildOverviewSummary(oem, state){
  var allKeys=["Flight Performance","Dock Integration","Sensors & Payload","Operations & Reliability","Law Enforcement","Campus Security","Critical Infrastructure"];
  var sectionLabels={
    "Flight Performance":"Drone — Flight Performance",
    "Dock Integration":"Dock Integration",
    "Sensors & Payload":"Sensors & Payload",
    "Operations & Reliability":"Operations & Reliability",
    "Law Enforcement":"Use Cases — Law Enforcement",
    "Campus Security":"Use Cases — Campus Security",
    "Critical Infrastructure":"Use Cases — Critical Infrastructure",
  };
  var sectionTopics={
    "Flight Performance":"core airframe performance, launch/landing precision, endurance, and wind handling",
    "Dock Integration":"autonomous dock launch and recovery, scheduled mission triggering, and GCS/VMS integration",
    "Sensors & Payload":"EO, optical-zoom, thermal, and low-light imaging across the standard altitude bands",
    "Operations & Reliability":"mission success rate, time between failures, and emergency-RTH / failsafe behavior",
    "Law Enforcement":"law-enforcement mission profiles including alert-to-airborne response, plate readability, and evidence-grade recording",
    "Campus Security":"campus-security mission profiles including perimeter patrol, intrusion response, and after-hours autonomous coverage",
    "Critical Infrastructure":"critical-infrastructure mission profiles including perimeter breach detection, thermal anomaly scan, and RF-denied response",
  };

  var agg=_tally(oem, allKeys);

  var out=[];

  out.push("EXECUTIVE OVERVIEW");
  out.push("This comprehensive report consolidates every individual section's findings for the "+_platformHeader(oem)+" platform into a single master document. "+_evaluatorSentence(oem)+" "+_procSentence(oem));
  if(oem.specsUrl) out.push("The OEM specifications source on file for this platform is "+oem.specsUrl+".");
  out.push("In aggregate across all sections covered below, "+agg.p+" test"+(agg.p===1?"":"s")+" passed, "+agg.f+" failed, and "+agg.pd+" remain pending — a completed-test pass rate of "+agg.rate+"% (calculated against the "+(agg.p+agg.f)+" completed tests out of "+agg.total+" total in scope).");

  out.push("");
  out.push("PER-SECTION HIGH-LEVEL SUMMARIES");

  allKeys.forEach(function(tk){
    var s=_tally(oem, [tk]);
    var fails=_failuresWithNotes(oem, [tk]);
    var label=sectionLabels[tk]||tk;
    var topic=sectionTopics[tk]||tk;

    out.push("");
    out.push(label+":");
    var summary="Covers "+topic+". ";
    if(s.total===0){
      summary+="No tests are populated for this section yet, so no readiness signal is available; the section should be treated as untested.";
    } else if(s.p===0 && s.f===0){
      summary+="All "+s.total+" tests in scope remain pending — testing has not progressed in this section yet.";
    } else {
      summary+=s.p+" of "+s.total+" tests pass ("+s.rate+"% on completed tests), "+s.f+" failure"+(s.f===1?"":"s")+", "+s.pd+" pending. ";
      if(s.f===0 && s.pd===0)        summary+="This section is clean — every evaluated requirement passed and there is no remediation work outstanding.";
      else if(s.f===0)                summary+="No failures yet; the section is on track but cannot be signed off until the pending items are completed.";
      else if(s.rate>=80)             summary+="Strong performance overall, with a small number of specific weak points that should be mitigated before procurement.";
      else if(s.rate>=60)             summary+="Mixed performance — the platform meets baseline requirements in most areas but has material weak points that need remediation or operator-procedure controls.";
      else                             summary+="Below threshold — the platform does not currently meet the minimum standard for this section and would require significant remediation, OEM engagement, or substitution of an alternative platform.";
    }
    out.push(summary);
    if(fails.length>0){
      out.push("Failures observed: "+fails.map(function(x){return x.name+(x.note?' — "'+x.note+'"':'');}).slice(0,5).join("; ")+(fails.length>5?"; (+"+(fails.length-5)+" more)":"")+".");
    }
    // Section sign-off status
    try{
      var sigRaw=(oem.notes||{})["section_signoff_"+(label.split(" — ")[0])];
      if(sigRaw){
        var sig=JSON.parse(sigRaw);
        if(sig && sig.approved) out.push("This section has been formally signed off by "+(sig.name||"the evaluator")+(sig.role?" ("+sig.role+")":"")+" on "+(sig.date||"an unrecorded date")+".");
      }
    }catch{}
  });

  // Cross-cutting themes
  out.push("");
  out.push("CROSS-CUTTING THEMES");
  var strongest=null,weakest=null;
  allKeys.forEach(function(tk){
    var s=_tally(oem,[tk]);
    if(s.p+s.f<1) return;
    if(!strongest || s.rate>strongest.rate) strongest={tk:tk,rate:s.rate};
    if(!weakest   || s.rate<weakest.rate)   weakest={tk:tk,rate:s.rate};
  });
  var themes=[];
  if(strongest && weakest && strongest.tk!==weakest.tk){
    themes.push("Strongest section is "+(sectionLabels[strongest.tk]||strongest.tk)+" at "+strongest.rate+"% completed-test pass; weakest is "+(sectionLabels[weakest.tk]||weakest.tk)+" at "+weakest.rate+"%.");
  }
  if(agg.f===0 && agg.total>0) themes.push("No failures have been recorded in any section to date, which is a strong consistency signal across categories.");
  if(agg.pd>agg.p+agg.f) themes.push("More tests are pending than completed across the platform, so the overall picture is still early — directional rather than conclusive.");
  if(themes.length===0) themes.push("Insufficient completed-test coverage to surface meaningful cross-section themes yet; revisit once more sections have closed out their pending items.");
  themes.forEach(function(t){ out.push("• "+t); });

  // Risk & mitigation
  out.push("");
  out.push("RISK & MITIGATION SUMMARY");
  var risks=[];
  allKeys.forEach(function(tk){
    var fails=_failuresWithNotes(oem,[tk]);
    if(fails.length>0){
      risks.push((sectionLabels[tk]||tk)+": "+fails.length+" failure"+(fails.length===1?"":"s")+" — "+fails.map(function(x){return x.name;}).slice(0,3).join(", ")+(fails.length>3?", and "+(fails.length-3)+" more":""));
    }
  });
  if(risks.length===0){
    out.push("No failure modes have been logged across any section. Primary remaining risk is incomplete coverage: "+agg.pd+" test"+(agg.pd===1?" is":"s are")+" still pending. Mitigation is straightforward — execute the pending tests and refresh this report.");
  } else {
    risks.forEach(function(r){ out.push("• "+r); });
    out.push("Mitigation paths to consider: (1) OEM remediation or firmware updates targeting the specific failure modes; (2) operator-procedure or pre-flight checklist changes to compensate; (3) restricted deployment scope that excludes mission profiles exercising the failing capabilities; (4) deferring procurement and re-testing after the next OEM release.");
  }

  // Consolidated recommendation
  out.push("");
  out.push("CONSOLIDATED RECOMMENDATION");
  out.push(_decisionRule(agg));
  if(state && state.oems && state.oems.length>1){
    out.push("Because multiple vendors are under simultaneous evaluation, this recommendation should be compared head-to-head against the equivalent reports for "+state.oems.filter(function(o,i){return i!==state.activeOEM;}).map(function(o){return o.name||"Vendor";}).join(", ")+" before any final procurement commitment.");
  }

  var body=out.join("\n");
  body=_padToRange(body, oem, agg, 1020, 1500, "the full platform evaluation");
  return body;
}

function buildLocalSummary(sectionName, contextData, oem, state){
  if(/Platform Overview/i.test(sectionName||"")){
    return _buildOverviewSummary(oem, state);
  }
  return _buildSectionSummary(sectionName, oem);
}

function buildLocalDemoSummary(oem, allResultsCtx){
  var platform=oem.name||"Unknown";
  var model=oem.model||"";
  // allResultsCtx looks like "Flight Performance: 5P/2F, Dock Integration: 8P/0F, ..."
  var sections=[];
  var totalP=0,totalF=0;
  var re=/([^,]+?):\s*(\d+)P\/(\d+)F/g;
  var m;
  while((m=re.exec(allResultsCtx||""))!==null){
    var p=parseInt(m[2],10),f=parseInt(m[3],10);
    sections.push({name:m[1].trim(),pass:p,fail:f});
    totalP+=p; totalF+=f;
  }
  var rate=(totalP+totalF)>0?Math.round(totalP/(totalP+totalF)*100):0;

  var lines=[];
  lines.push("DEMO READINESS OVERVIEW");
  lines.push("Overall readiness of the "+platform+(model?" ("+model+")":"")+" platform across all evaluated test categories. Aggregate pass rate: "+rate+"% ("+totalP+" passes / "+totalF+" failures recorded).");
  lines.push("");
  lines.push("PLATFORM STRENGTHS PER MISSION");
  var strengths=sections.filter(function(s){return s.pass>0 && s.fail===0;});
  if(strengths.length>0){
    strengths.forEach(function(s){ lines.push("• "+s.name+" — "+s.pass+" pass, 0 fail. Ready for: First on Scene / Eyes On / Crime Scene / Perimeter where applicable."); });
  } else {
    lines.push("• No section is fully clean yet — every category has either failures or pending tests.");
  }
  lines.push("");
  lines.push("RISKS OR GAPS");
  var risky=sections.filter(function(s){return s.fail>0;}).sort(function(a,b){return b.fail-a.fail;});
  if(risky.length===0){
    lines.push("• No outright failures across categories.");
  } else {
    risky.slice(0,5).forEach(function(s){ lines.push("• "+s.name+" — "+s.fail+" failure"+(s.fail===1?"":"s")+" recorded; review specific failed tests before demo."); });
  }
  if(totalP+totalF===0) lines.push("• No results entered yet — demo cannot be assessed.");
  lines.push("");
  lines.push("RECOMMENDATION");
  if(totalP+totalF===0)            lines.push("NOT READY — no test results entered. Demo cannot proceed until baseline testing is complete.");
  else if(totalF===0 && totalP>=8) lines.push("READY — clean record across recorded sections. Proceed with demo missions: First on Scene, License Plate ID, Heat Signature, Eyes On, Crime Scene, The Perimeter.");
  else if(rate>=85)                lines.push("CONDITIONAL — strong performance ("+rate+"%) but address "+totalF+" specific failure"+(totalF===1?"":"s")+" before demo for highest-stakes missions (License Plate ID, Heat Signature).");
  else if(rate>=60)                lines.push("CONDITIONAL — limit demo to mission profiles that don't depend on the failing test categories until remediation.");
  else                              lines.push("NOT READY — pass rate of "+rate+"% is below acceptable demo threshold.");
  return lines.join("\n");
}

// ── Module-level extracted components ─────────────────────────────────────

function ExecSummaryBtn({sectionName,contextData}){
  const {oem,state}=useContext(TeviCtx);
  const [open,setOpen]=useState(false);
  const [text,setText]=useState("");
  // No more Anthropic API call — the local generator runs entirely from
  // the structured evaluation state and produces narrative output in the
  // target word range (500–900 per section, 1000–1500 for the Overview).
  // This makes the feature work even when the API key is missing, rate
  // limited, or the org's Anthropic usage cap has been hit.
  const generate=()=>{
    setOpen(true);
    setText(buildLocalSummary(sectionName,contextData,oem,state));
  };
  return(
    <div style={{marginTop:16}}>
      <button onClick={generate} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 18px",borderRadius:8,border:"1px solid rgba(134,239,172,0.45)",background:"rgba(20,83,45,0.35)",color:"#86efac",fontWeight:700,fontSize:12,cursor:"pointer"}}>
        📋 Generate Executive Summary
      </button>
      {open&&(
        <div style={{marginTop:12,background:"rgba(0,0,0,0.5)",borderRadius:10,padding:16,border:"1px solid rgba(134,239,172,0.35)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <span style={{color:"#86efac",fontWeight:700,fontSize:12,letterSpacing:1,textTransform:"uppercase"}}>Executive Summary — {sectionName}</span>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{ try{ navigator.clipboard.writeText(text||""); }catch{} }} style={{background:"rgba(255,255,255,0.06)",color:C.text,border:"1px solid "+C.border,borderRadius:5,padding:"2px 10px",fontSize:11,cursor:"pointer"}}>Copy</button>
              <button onClick={()=>setOpen(false)} style={{background:"rgba(127,29,29,0.3)",color:"#fca5a5",border:"1px solid rgba(252,165,165,0.3)",borderRadius:5,padding:"2px 9px",fontSize:11,cursor:"pointer"}}>x</button>
            </div>
          </div>
          <div style={{color:C.text,fontSize:12,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{text}</div>
        </div>
      )}
    </div>
  );
}

function OemSpecsUrlPanel({oem,dispatch,activeOEMIdx}){
  const {state}=useContext(TeviCtx);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const [msgKind,setMsgKind]=useState("info"); // info | ok | err
  const url=oem.specsUrl||"";

  const setStatusMsg=(text,kind)=>{ setMsg(text); setMsgKind(kind||"info"); };

  // Update a matrix cell for the active OEM column. The matrix is stored
  // canonically on state.oems[0].matrix with keys "<cat>_<row>_<vendorIdx>".
  const setMatrixCell=(catId,rowId,val)=>{
    if(val===null||val===undefined||val==="") return;
    const cur=(state.oems[0]&&state.oems[0].matrix)||{};
    const next={...cur,[catId+"_"+rowId+"_"+activeOEMIdx]:String(val)};
    dispatch({type:"SET_MATRIX",oems:state.oems.map((o,i)=>i===0?{...o,matrix:next}:o)});
  };

  const handleFetch=async()=>{
    if(!url.trim()){ setStatusMsg("Paste an OEM specifications URL first.","err"); return; }
    setBusy(true); setStatusMsg("Fetching page…","info");
    try{
      const proxied=await api.oemSpecsFetch(url.trim());
      const pageText=(proxied&&proxied.text)||"";
      if(!pageText){ throw new Error("Empty page content"); }
      setStatusMsg("Asking Claude to extract specs…","info");

      // Hand the cleaned page text to Claude with a strict JSON schema so we
      // can parse the response and drop values into the Compare matrix +
      // the Overview identification fields + the per-test "Min. Standard"
      // column on every section table. Anything Claude can't find, it
      // leaves out — we never overwrite values the user already entered.

      // Build the list of tests Claude should fill OEM-specific standards
      // for. Format each row as: "id (test name) -- generic default" so
      // Claude can produce an OEM-targeted equivalent. Limit to physical /
      // measurable tests where an OEM spec sheet typically gives a value.
      const STD_TEST_IDS=[
        // Flight Performance — every test has a quantitative OEM target
        "fp1","fp2","fp3","fp4","fp5","fp6","fp7","fp8",
        // Dock Integration — most are dock-mechanism timings & RTD precision
        "di1","di2","di3","di4","di5","di6","di7","di8","di11","di13",
        // Sensors & Payload — camera/zoom/thermal capabilities
        "sp1","sp2","sp3","sp4","sp5","sp6","sp7","sp8","sp9","sp10",
        "sp11","sp12","sp13","sp14","sp15","sp16","sp17","sp18",
        "sp19","sp20","sp21","sp22","sp23",
        // Operations & Reliability — failure-rate and safety timings
        "or1","or2","or3","or4","or5","or6","or7","or8",
      ];
      const idToTest={};
      Object.keys(TESTS).forEach(sec=>{
        TESTS[sec].forEach(t=>{ idToTest[t.id]={name:t.test,standard:t.standard,section:sec}; });
      });
      const testList=STD_TEST_IDS
        .filter(id=>idToTest[id])
        .map(id=>"  "+id+" — "+idToTest[id].section+" / "+idToTest[id].name+" — generic default: \""+idToTest[id].standard+"\"")
        .join("\n");

      const prompt=`You are extracting drone OEM specifications from a manufacturer's product page.

Return STRICT JSON ONLY (no prose, no markdown fences) in exactly this shape:
{
  "platform": { "manufacturer": "", "model": "" },
  "compliance": { "ndaa": "", "blueuas": "", "faa": "", "remoteid": "", "radio": "", "data": "" },
  "payloads":   { "eo": "", "thermal": "", "zoom": "", "radiometric": "", "lowlight": "", "firstparty": "", "thirdparty": "" },
  "aircraft":   { "flighttime": "", "range": "", "windresist": "", "optemp": "", "launchmethod": "", "iprating": "" },
  "autonomy":   { "obsavoid": "", "daa": "", "parachute": "", "dockreliab": "", "bvlos": "" },
  "support":    { "partsavail": "", "repair": "", "warranty": "", "training": "", "swlicense": "", "oemresp": "" },
  "testStandards": {
    "<test-id>": "Per OEM spec — target <OEM-specific value>",
    ...
  }
}

Rules:
- For toggle-style fields (ndaa, blueuas, faa, remoteid, radio, data, eo, thermal, radiometric, lowlight, firstparty, thirdparty, obsavoid, daa, parachute, dockreliab, bvlos, training): return "Yes", "No", or "" if unknown.
- For free-text fields (manufacturer, model, zoom, flighttime, range, windresist, optemp, launchmethod, iprating, partsavail, repair, warranty, swlicense, oemresp): copy the exact number/unit from the page (e.g. "40 min", "6.2 mi", "26 mph", "-20°C to 50°C", "IP54").
- For testStandards: include ONE entry per test ID below WHERE the OEM page lists a relevant published value. Phrase the value as: "Per OEM spec — target <X>" (e.g. "Per OEM spec — target 40 min flight time", "Per OEM spec — target 6.2 mi C2 range", "Per OEM spec — target stable in 26 mph sustained"). If the spec sheet has no relevant value for a test, OMIT that test's key entirely from testStandards (do not return an empty string).
- Omit any field you cannot confidently extract — leave it as an empty string.

TESTS TO PROVIDE OEM-SPECIFIC STANDARDS FOR (return matching keys under testStandards):
${testList}

PAGE TEXT (truncated):
${pageText.slice(0, 38000)}`;

      const claudeResp=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:3800,messages:[{role:"user",content:prompt}]})});
      const claudeJson=await claudeResp.json();
      if(!claudeResp.ok) throw new Error((claudeJson&&claudeJson.error)||("Claude HTTP "+claudeResp.status));
      const text=(claudeJson.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n").trim();
      // Strip markdown fences in case the model adds them anyway
      const stripped=text.replace(/^```(?:json)?/i,"").replace(/```$/,"").trim();
      let parsed;
      try { parsed=JSON.parse(stripped); }
      catch { throw new Error("Could not parse Claude response as JSON"); }

      let setCount=0;
      // Identification fields go on the OEM record itself (only fill when empty)
      if(parsed.platform){
        if(parsed.platform.manufacturer && !oem.manufacturer){
          dispatch({type:"UPD_FIELD",f:"manufacturer",v:parsed.platform.manufacturer}); setCount++;
        }
        if(parsed.platform.model && !oem.model){
          dispatch({type:"UPD_FIELD",f:"model",v:parsed.platform.model}); setCount++;
        }
      }
      // Matrix categories — IDs match EVAL_MATRIX
      const catMap={compliance:"compliance",payloads:"payloads",aircraft:"aircraft",autonomy:"autonomy",support:"support"};
      Object.keys(catMap).forEach(k=>{
        const catId=catMap[k];
        const block=parsed[k]||{};
        Object.keys(block).forEach(rowId=>{
          const v=block[rowId];
          if(v && String(v).trim()){
            setMatrixCell(catId,rowId,v);
            setCount++;
          }
        });
      });

      // Per-test Minimum Standard overrides — drop into oem.oemStandards
      // keyed by test ID. The SecTable rows render this value in place of
      // the generic "Per OEM spec — target …" placeholder.
      let stdCount=0;
      if(parsed.testStandards && typeof parsed.testStandards==="object"){
        const nextStds={...(oem.oemStandards||{})};
        Object.keys(parsed.testStandards).forEach(testId=>{
          const v=parsed.testStandards[testId];
          if(v && String(v).trim()){
            nextStds[testId]=String(v).trim();
            stdCount++;
          }
        });
        if(stdCount>0){
          dispatch({type:"UPD_FIELD",f:"oemStandards",v:nextStds});
          setCount+=stdCount;
        }
      }

      dispatch({type:"UPD_FIELD",f:"specsFetchedAt",v:new Date().toISOString()});
      dispatch({type:"UPD_FIELD",f:"specsFetchStatus",v:"ok"});
      if(setCount===0){
        setStatusMsg("Page fetched, but no spec values could be confidently extracted. Try a more detailed spec sheet URL.","err");
      } else {
        setStatusMsg("Pre-filled "+setCount+" field"+(setCount===1?"":"s")+" from the OEM specifications page"+(stdCount>0?" — including "+stdCount+" per-test OEM standard"+(stdCount===1?"":"s"):"")+". Review the Drone / Dock / Sensors / Reliability tabs to verify the standards, then run your tests against them.","ok");
      }
    } catch(e){
      dispatch({type:"UPD_FIELD",f:"specsFetchStatus",v:"err"});
      setStatusMsg("Fetch failed: "+(e?.message||"unknown error"),"err");
    } finally {
      setBusy(false);
    }
  };

  const msgColor=msgKind==="ok"?"#86efac":msgKind==="err"?"#fca5a5":"#fde68a";
  const msgBg=msgKind==="ok"?"rgba(20,83,45,0.4)":msgKind==="err"?"rgba(127,29,29,0.4)":"rgba(120,53,15,0.35)";
  const msgBrd=msgKind==="ok"?"#166534":msgKind==="err"?"#991b1b":"#854d0e";

  return(
    <div style={{background:C.card,borderRadius:12,padding:20,border:"1px solid rgba(167,139,250,0.3)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,paddingBottom:12,borderBottom:"1px solid rgba(167,139,250,0.18)"}}>
        <div style={{width:3,height:20,borderRadius:2,background:"#a78bfa"}}/>
        <span style={{color:"#a78bfa",fontWeight:700,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>OEM Specifications Source</span>
        {oem.specsFetchedAt && <span style={{marginLeft:"auto",fontSize:10,color:C.muted}}>Last fetched: {new Date(oem.specsFetchedAt).toLocaleString()}</span>}
      </div>
      <div style={{fontSize:12,color:C.muted,marginBottom:10,lineHeight:1.5}}>
        Verify OEM specifications with this link. Paste the manufacturer's spec sheet URL and click <b style={{color:"#a78bfa"}}>Fetch &amp; Pre-fill</b> — the tool will extract published specs (flight time, range, IP rating, NDAA status, payloads, etc.), pre-populate the Compare matrix for this vendor, AND replace the generic "Per OEM spec — target …" placeholders on every test row in the Drone / Dock / Sensors / Reliability tabs with the OEM's actual published values, so you can test against the OEM's own stated minimum standards.
      </div>
      <div style={{display:"flex",alignItems:"flex-end",gap:10,flexWrap:"wrap"}}>
        <div style={{flex:"1 1 420px",minWidth:280}}>
          <label style={lbl}>OEM Specs URL</label>
          <input
            value={url}
            onChange={e=>dispatch({type:"UPD_FIELD",f:"specsUrl",v:e.target.value})}
            placeholder="https://manufacturer.example.com/products/your-drone/specs"
            style={{...inp,marginTop:4}}
          />
        </div>
        <button
          onClick={handleFetch}
          disabled={busy||!url.trim()}
          style={{padding:"9px 18px",borderRadius:8,border:"1px solid rgba(167,139,250,0.55)",background:busy?"rgba(167,139,250,0.15)":"rgba(167,139,250,0.28)",color:"#a78bfa",fontWeight:800,fontSize:12,letterSpacing:1,cursor:busy||!url.trim()?"not-allowed":"pointer",opacity:!url.trim()?0.5:1,whiteSpace:"nowrap"}}
        >
          {busy?"Working…":"⤓ Fetch & Pre-fill"}
        </button>
        {url.trim() && (
          <a href={url.trim()} target="_blank" rel="noreferrer"
            style={{padding:"9px 14px",borderRadius:8,border:"1px solid "+C.border,background:"rgba(255,255,255,0.04)",color:C.text,fontSize:11,fontWeight:600,textDecoration:"none",whiteSpace:"nowrap"}}>
            Open ↗
          </a>
        )}
      </div>
      {msg && (
        <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:msgBg,border:"1px solid "+msgBrd,color:msgColor,fontSize:12}}>
          {msg}
        </div>
      )}
    </div>
  );
}

function OverviewPanel(){
  const {oem,dispatch,state}=useContext(TeviCtx);
  const activeKey=oem.activeSite||"site_TRG";
  const activeSite=OPSITES.find(s=>s.key===activeKey)||OPSITES[0];
  return(
    <div style={{display:"grid",gap:16}}>
      <div style={{background:C.card,borderRadius:12,padding:20,border:"1px solid rgba(74,158,255,0.25)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,paddingBottom:12,borderBottom:"1px solid rgba(74,158,255,0.15)"}}>
          <div style={{width:3,height:20,borderRadius:2,background:"#4a9eff"}}/>
          <span style={{color:"#4a9eff",fontWeight:700,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>Platform Identification</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          {[["name","OEM / Vendor Name"],["manufacturer","Manufacturer"],["model","Drone Model"],["serial","Serial Number"],["dockModel","Dock Model"],["dockSerial","Dock Serial No."],["evaluator","Lead Evaluator"],["startDate","Evaluation Start Date"],["location","Primary Test Location"]].map(([f,l])=>(
            <div key={f}><label style={lbl}>{l}</label><input value={oem[f]||""} onChange={e=>dispatch({type:"UPD_FIELD",f,v:e.target.value})} style={{...inp,marginTop:4}}/></div>
          ))}
        </div>
      </div>

      <OemSpecsUrlPanel oem={oem} dispatch={dispatch} activeOEMIdx={state.activeOEM}/>
      <div style={{background:C.card,borderRadius:12,padding:20,border:"1px solid rgba(74,158,255,0.25)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,paddingBottom:12,borderBottom:"1px solid rgba(74,158,255,0.15)"}}>
          <div style={{width:3,height:20,borderRadius:2,background:"#4a9eff"}}/>
          <span style={{color:"#4a9eff",fontWeight:700,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>Test Sites</span>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Testing At:</span>
            <select value={activeKey} onChange={e=>dispatch({type:"UPD_FIELD",f:"activeSite",v:e.target.value})} style={{background:"rgba(74,158,255,0.1)",border:"1px solid rgba(74,158,255,0.4)",borderRadius:6,color:"#4a9eff",padding:"5px 10px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {OPSITES.map(s=><option key={s.key} value={s.key}>{s.badge} — {s.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",borderRadius:8,background:"rgba(74,158,255,0.08)",border:"1px solid rgba(74,158,255,0.3)",marginBottom:16}}>
          <span>📍</span>
          <span style={{color:"#4a9eff",fontWeight:700,fontSize:12}}>CURRENTLY TESTING AT:</span>
          <span style={{background:"rgba(74,158,255,0.2)",color:"#4a9eff",borderRadius:4,padding:"2px 10px",fontSize:12,fontWeight:800,border:"1px solid rgba(74,158,255,0.4)"}}>{activeSite.badge}</span>
          <span style={{color:"#fff",fontSize:13,fontWeight:600}}>{activeSite.label}</span>
          {activeSite.dock&&<span style={{marginLeft:"auto",color:C.muted,fontSize:10,background:"rgba(255,255,255,0.06)",borderRadius:4,padding:"2px 8px",border:"1px solid "+C.border,fontWeight:600}}>DOCK INSTALLED</span>}
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{background:"rgba(74,158,255,0.06)",borderBottom:"1px solid rgba(74,158,255,0.2)"}}>
              {["Site","Name","Address / GPS","Dock","Notes","Active"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",color:"#4a9eff",fontSize:11,fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {OPSITES.map((s,i)=>{
                const on=activeKey===s.key;
                return(
                  <tr key={s.key} style={{borderBottom:"1px solid rgba(255,255,255,0.04)",background:on?"rgba(74,158,255,0.07)":i%2===0?"transparent":"rgba(255,255,255,0.02)"}}>
                    <td style={{padding:"8px 12px"}}><span style={{background:on?"rgba(74,158,255,0.2)":"rgba(255,255,255,0.07)",color:on?"#4a9eff":C.muted,borderRadius:4,padding:"2px 10px",fontSize:11,fontWeight:800,border:"1px solid "+(on?"rgba(74,158,255,0.4)":C.border)}}>{s.badge}</span></td>
                    <td style={{padding:"8px 12px",color:on?"#fff":C.text,fontWeight:on?600:400,whiteSpace:"nowrap"}}>{s.label}</td>
                    <td style={{padding:"6px 8px"}}><input value={oem[s.key]||""} onChange={e=>dispatch({type:"UPD_FIELD",f:s.key,v:e.target.value})} style={{...inp,minWidth:200,fontSize:12}} placeholder="Address or GPS..."/></td>
                    <td style={{padding:"8px 12px"}}>{s.dock?<span style={{fontSize:11,fontWeight:700,color:"#86efac",background:"rgba(20,83,45,0.5)",borderRadius:4,padding:"2px 8px",border:"1px solid #166534"}}>YES</span>:<span style={{fontSize:11,color:C.faint,background:"rgba(255,255,255,0.04)",borderRadius:4,padding:"2px 8px",border:"1px solid "+C.border}}>—</span>}</td>
                    <td style={{padding:"6px 8px"}}><input value={oem[s.key+"_notes"]||""} onChange={e=>dispatch({type:"UPD_FIELD",f:s.key+"_notes",v:e.target.value})} style={{...inp,minWidth:140,fontSize:12}} placeholder="Notes..."/></td>
                    <td style={{padding:"8px 12px",textAlign:"center"}}><button onClick={()=>dispatch({type:"UPD_FIELD",f:"activeSite",v:s.key})} style={{padding:"4px 14px",borderRadius:6,border:"1px solid "+(on?"#16a34a":C.border),background:on?"rgba(20,83,45,0.6)":"rgba(255,255,255,0.04)",color:on?"#86efac":C.muted,fontWeight:on?700:400,fontSize:11,cursor:"pointer"}}>{on?"✓ Active":"Select"}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InlineWeather({sectionKey}){
  const {oem,dispatch}=useContext(TeviCtx);
  const storeKey="wx_"+sectionKey;
  const raw=oem.notes[storeKey];
  const wx=raw?JSON.parse(raw):{metarRaw:"",windDir:"",windSpeed:"",windSpeedMph:"",windGust:"",tempC:"",precipitation:"",skyCover:"",visibility:"",humidity:"",kpIndex:""};
  const save=obj=>dispatch({type:"UPD_NOTE",id:storeKey,v:JSON.stringify(obj)});
  const handleMetar=val=>{
    if(!val.trim()){save({...wx,metarRaw:val});return;}
    const p=parseMetar(val);
    save({...wx,metarRaw:val,windDir:p.windDir||wx.windDir,windSpeed:p.windSpeed||wx.windSpeed,windSpeedMph:p.windSpeedMph||wx.windSpeedMph,windGust:p.windGust||wx.windGust,tempC:p.tempC||wx.tempC,precipitation:p.presentWeather||wx.precipitation,skyCover:p.sky1||wx.skyCover,visibility:p.visibility||wx.visibility,humidity:p.relHumidity||wx.humidity});
  };
  const windDirOpts=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW","VRB Variable"];
  const precipOpts=["None","RA Rain","DZ Drizzle","SN Snow","GR Hail","TSRA Thunderstorm","BR Mist","FG Fog","HZ Haze","FU Smoke"];
  const skyOpts=["SKC Clear","FEW Few Clouds","SCT Scattered","BKN Broken","OVC Overcast"];
  const visopts=["10+ SM Clear","7-10 SM Good","5-7 SM Moderate","3-5 SM Reduced","1-3 SM Poor","<1 SM Very Poor"];
  const sp=[];
  if(wx.windDir&&wx.windSpeed)sp.push(wx.windDir+" "+wx.windSpeed+"kt"+(wx.windGust?" G"+wx.windGust+"kt":""));
  if(wx.windSpeedMph)sp.push(wx.windSpeedMph+" mph");
  if(wx.tempC)sp.push(wx.tempC+"°C");
  if(wx.skyCover)sp.push(wx.skyCover.split(" ")[0]);
  if(wx.visibility)sp.push("Vis "+wx.visibility.split(" ")[0]);
  if(wx.kpIndex)sp.push("Kp "+wx.kpIndex.split(" ")[0]);
  return(
    <div style={{marginBottom:16,background:"rgba(56,189,248,0.05)",borderRadius:10,padding:14,border:"1px solid rgba(56,189,248,0.25)"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <span style={{fontSize:14}}>🌤</span>
        <span style={{color:"#38bdf8",fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:1.2}}>Test Conditions — {sectionKey}</span>
        {sp.length>0&&<span style={{marginLeft:"auto",fontSize:11,color:"#38bdf8",background:"rgba(56,189,248,0.1)",borderRadius:4,padding:"2px 10px",border:"1px solid rgba(56,189,248,0.3)",whiteSpace:"nowrap"}}>{sp.join(" · ")}</span>}
      </div>
      <div style={{marginBottom:10}}>
        <label style={{...lbl,color:"rgba(56,189,248,0.7)"}}>METAR — Paste to Auto-Fill</label>
        <input value={wx.metarRaw||""} onChange={e=>handleMetar(e.target.value)} style={{...inp,marginTop:4,fontFamily:"monospace",fontSize:11,borderColor:"rgba(56,189,248,0.25)"}} placeholder="e.g. KLAX 271755Z 25008KT 10SM FEW025 18/10 A2998"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
        <div><label style={{...lbl,color:"rgba(56,189,248,0.7)"}}>Direction</label><select value={wx.windDir||""} onChange={e=>save({...wx,windDir:e.target.value})} style={{...inp,marginTop:4,fontSize:11,cursor:"pointer",borderColor:"rgba(56,189,248,0.25)"}}><option value="">Select...</option>{windDirOpts.map(o=><option key={o}>{o}</option>)}</select></div>
        <div><label style={{...lbl,color:"rgba(56,189,248,0.7)"}}>Speed (kt)</label><input type="number" value={wx.windSpeed||""} onChange={e=>{const kt=e.target.value;save({...wx,windSpeed:kt,windSpeedMph:kt?(parseFloat(kt)*1.15078).toFixed(1):""});}} style={{...inp,marginTop:4,fontSize:11,borderColor:"rgba(56,189,248,0.25)"}} placeholder="0"/></div>
        <div><label style={{...lbl,color:"rgba(56,189,248,0.7)"}}>Speed (mph)</label><input value={wx.windSpeedMph||""} onChange={e=>save({...wx,windSpeedMph:e.target.value})} style={{...inp,marginTop:4,fontSize:11,borderColor:"rgba(56,189,248,0.25)"}} placeholder="Auto-calc"/></div>
        <div><label style={{...lbl,color:"rgba(56,189,248,0.7)"}}>Gust (kt)</label><input type="number" value={wx.windGust||""} onChange={e=>save({...wx,windGust:e.target.value})} style={{...inp,marginTop:4,fontSize:11,borderColor:"rgba(56,189,248,0.25)"}} placeholder="—"/></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
        <div><label style={{...lbl,color:"rgba(56,189,248,0.7)"}}>Cloud Cover</label><select value={wx.skyCover||""} onChange={e=>save({...wx,skyCover:e.target.value})} style={{...inp,marginTop:4,fontSize:11,cursor:"pointer",borderColor:"rgba(56,189,248,0.25)"}}><option value="">Select...</option>{skyOpts.map(o=><option key={o}>{o}</option>)}</select></div>
        <div><label style={{...lbl,color:"rgba(56,189,248,0.7)"}}>Visibility</label><select value={wx.visibility||""} onChange={e=>save({...wx,visibility:e.target.value})} style={{...inp,marginTop:4,fontSize:11,cursor:"pointer",borderColor:"rgba(56,189,248,0.25)"}}><option value="">Select...</option>{visopts.map(o=><option key={o}>{o}</option>)}</select></div>
        <div><label style={{...lbl,color:"rgba(56,189,248,0.7)"}}>Precipitation</label><select value={wx.precipitation||""} onChange={e=>save({...wx,precipitation:e.target.value})} style={{...inp,marginTop:4,fontSize:11,cursor:"pointer",borderColor:"rgba(56,189,248,0.25)"}}><option value="">Select...</option>{precipOpts.map(o=><option key={o}>{o}</option>)}</select></div>
        <div><label style={{...lbl,color:"rgba(56,189,248,0.7)"}}>Temp (°C)</label><input type="number" value={wx.tempC||""} onChange={e=>save({...wx,tempC:e.target.value})} style={{...inp,marginTop:4,fontSize:11,borderColor:"rgba(56,189,248,0.25)"}} placeholder="18"/></div>
      </div>
    </div>
  );
}

function SecTable({sKey}){
  const {oem,dispatch}=useContext(TeviCtx);
  const tcKey=sKey==="Flight Performance"?"Drone":sKey==="Dock Integration"?"Dock":sKey==="Sensors & Payload"?"Sensors":sKey==="Operations & Reliability"?"Reliability":"Drone";
  const tc=TAB_COLORS[tcKey]||TAB_COLORS["Drone"];
  const sectionRuns=(oem.testRuns||[]).filter(r=>r.section===sKey);
  const [activeRun,setActiveRun]=useState(-1);
  const isMain=activeRun===-1;
  const getVal=tid=>isMain?oem.results[tid+"_pfn"]||"":(sectionRuns[activeRun]?.results[tid+"_pfn"]||"");
  const setVal=(tid,v)=>isMain?dispatch({type:"UPD_RESULT",id:tid+"_pfn",v}):dispatch({type:"UPD_RUN_RESULT",ri:activeRun,id:tid+"_pfn",v});
  const getNote=(tid,sfx)=>isMain?oem.notes[tid+(sfx||"")]||"":(sectionRuns[activeRun]?.notes[tid+(sfx||"")]||"");
  const setNote=(tid,sfx,v)=>isMain?dispatch({type:"UPD_NOTE",id:tid+(sfx||""),v}):dispatch({type:"UPD_RUN",ri:activeRun,f:"notes",v:{...sectionRuns[activeRun].notes,[tid+(sfx||"")]:v}});
  return(
    <div style={{background:C.card,borderRadius:12,padding:18,border:"1px solid "+tc.border}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,paddingBottom:12,borderBottom:"1px solid "+tc.border}}>
        <div style={{width:3,height:20,borderRadius:2,background:tc.color}}/>
        <span style={{color:tc.color,fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:1.5}}>{sKey}</span>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <button onClick={()=>setActiveRun(-1)} style={{padding:"3px 10px",borderRadius:5,border:"1px solid "+(isMain?tc.color:C.border),background:isMain?tc.color+"22":"transparent",color:isMain?tc.color:C.muted,fontSize:11,fontWeight:isMain?700:400,cursor:"pointer"}}>Session 1</button>
          {sectionRuns.map((r,i)=>(
            <button key={r.id} onClick={()=>setActiveRun(i)} style={{padding:"3px 10px",borderRadius:5,border:"1px solid "+(activeRun===i?tc.color:C.border),background:activeRun===i?tc.color+"22":"transparent",color:activeRun===i?tc.color:C.muted,fontSize:11,fontWeight:activeRun===i?700:400,cursor:"pointer"}}>{r.label||"Run "+(i+2)}</button>
          ))}
          <button onClick={()=>{dispatch({type:"ADD_RUN",section:sKey});setActiveRun(sectionRuns.length);}} style={{padding:"3px 10px",borderRadius:5,border:"1px dashed rgba(255,255,255,0.25)",background:"transparent",color:C.muted,fontSize:12,cursor:"pointer",fontWeight:700}}>+ Add Run</button>
        </div>
      </div>
      {!isMain&&sectionRuns[activeRun]&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:8,marginBottom:14,padding:"10px 12px",background:"rgba(255,255,255,0.03)",borderRadius:8,border:"1px solid "+C.border}}>
          <div><label style={lbl}>Run Label</label><input value={sectionRuns[activeRun].label||""} onChange={e=>dispatch({type:"UPD_RUN",ri:activeRun,f:"label",v:e.target.value})} style={{...inp,marginTop:4,fontSize:11}}/></div>
          <div><label style={lbl}>Date</label><input type="date" value={sectionRuns[activeRun].date||""} onChange={e=>dispatch({type:"UPD_RUN",ri:activeRun,f:"date",v:e.target.value})} style={{...inp,marginTop:4,fontSize:11}}/></div>
          <div><label style={lbl}>Time</label><input type="time" value={sectionRuns[activeRun].time||""} onChange={e=>dispatch({type:"UPD_RUN",ri:activeRun,f:"time",v:e.target.value})} style={{...inp,marginTop:4,fontSize:11}}/></div>
          <div><label style={lbl}>Evaluator</label><input value={sectionRuns[activeRun].evaluator||""} onChange={e=>dispatch({type:"UPD_RUN",ri:activeRun,f:"evaluator",v:e.target.value})} style={{...inp,marginTop:4,fontSize:11}} placeholder="Name..."/></div>
          <div><label style={lbl}>Weather Summary</label><input value={sectionRuns[activeRun].wxSummary||""} onChange={e=>dispatch({type:"UPD_RUN",ri:activeRun,f:"wxSummary",v:e.target.value})} style={{...inp,marginTop:4,fontSize:11}} placeholder="e.g. 12kt NW"/></div>
        </div>
      )}
      {!isMain&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}><button onClick={()=>{dispatch({type:"DEL_RUN",ri:activeRun});setActiveRun(-1);}} style={{background:"rgba(127,29,29,0.3)",color:"#fca5a5",border:"1px solid rgba(252,165,165,0.3)",borderRadius:5,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>Delete This Run</button></div>}
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{borderBottom:"1px solid "+tc.border,background:tc.active}}>
            {["Test","Min. Standard","Pass / Fail / N/A","Tester","Date","Notes"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",color:tc.color,fontWeight:700,fontSize:11,letterSpacing:0.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {(TESTS[sKey]||[]).map((t,i)=>{
              const oemStd=(oem.oemStandards||{})[t.id];
              const stdVal=(oemStd!==undefined && oemStd!=="")?oemStd:t.standard;
              const isOverridden=oemStd!==undefined && oemStd!=="" && oemStd!==t.standard;
              return (
              <tr key={t.id} style={{borderBottom:"1px solid rgba(255,255,255,0.04)",background:i%2===0?"transparent":"rgba(255,255,255,0.02)"}}>
                <td style={{padding:"7px 10px",color:C.text}}>{t.test}</td>
                <td style={{padding:"6px 8px"}}>
                  <input
                    value={stdVal}
                    onChange={e=>dispatch({type:"UPD_FIELD",f:"oemStandards",v:{...(oem.oemStandards||{}),[t.id]:e.target.value}})}
                    title={isOverridden?("OEM-specific. Generic default: "+t.standard):"Per generic default — paste an OEM specs URL on the Overview tab to auto-fill OEM-specific values."}
                    style={{...inp,fontSize:12,minWidth:280,padding:"5px 8px",color:isOverridden?"#86efac":C.muted,borderColor:isOverridden?"rgba(134,239,172,0.35)":C.border}}
                  />
                </td>
                <td style={{padding:"6px 8px"}}><PFButtons value={getVal(t.id)} onChange={v=>setVal(t.id,v)}/></td>
                <td style={{padding:"6px 8px"}}><input value={getNote(t.id,"_tester")} onChange={e=>setNote(t.id,"_tester",e.target.value)} style={{...inp,width:100}} placeholder="Name..."/></td>
                <td style={{padding:"6px 8px"}}><input type="date" value={getNote(t.id,"_date")} onChange={e=>setNote(t.id,"_date",e.target.value)} style={{...inp,width:120}}/></td>
                <td style={{padding:"6px 8px"}}><input value={getNote(t.id,"")} onChange={e=>setNote(t.id,"",e.target.value)} style={{...inp,minWidth:130}} placeholder="Notes..."/></td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionSignOff({sectionName}){
  const {oem,dispatch}=useContext(TeviCtx);
  const key="section_signoff_"+sectionName;
  const raw=oem.notes[key];
  const data=raw?JSON.parse(raw):{name:"",role:"",date:"",signature:"",approved:false};
  const save=obj=>dispatch({type:"UPD_NOTE",id:key,v:JSON.stringify(obj)});
  return(
    <div style={{marginTop:20,background:"rgba(0,0,0,0.4)",borderRadius:12,border:"2px solid "+(data.approved?"rgba(22,101,52,0.7)":C.border),padding:18}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div>
          <div style={{color:data.approved?"#86efac":C.accent,fontWeight:700,fontSize:12,letterSpacing:2,textTransform:"uppercase"}}>{sectionName} — Section Sign-Off</div>
          <div style={{color:C.muted,fontSize:11,marginTop:2}}>{data.approved?"This section has been formally approved.":"Complete testing before signing off."}</div>
        </div>
        {data.approved&&<div style={{background:"rgba(20,83,45,0.7)",color:"#86efac",borderRadius:6,padding:"4px 14px",fontSize:11,fontWeight:700,border:"1px solid #166534"}}>SECTION APPROVED</div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
        <div><label style={lbl}>Evaluator Name</label><input value={data.name||""} onChange={e=>save({...data,name:e.target.value})} style={{...inp,marginTop:4}} placeholder="Full name..."/></div>
        <div><label style={lbl}>Role</label><select value={data.role||""} onChange={e=>save({...data,role:e.target.value})} style={{...inp,marginTop:4,cursor:"pointer"}}><option value="">Select...</option>{ROLES.map(r=><option key={r}>{r}</option>)}</select></div>
        <div><label style={lbl}>Date</label><input type="date" value={data.date||""} onChange={e=>save({...data,date:e.target.value})} style={{...inp,marginTop:4}}/></div>
      </div>
      <div style={{marginBottom:14}}>
        <label style={lbl}>Electronic Signature</label>
        <div style={{position:"relative",marginTop:4}}>
          <input value={data.signature||""} onChange={e=>save({...data,signature:e.target.value})} style={{...inp,fontSize:15,fontStyle:"italic",fontFamily:"Georgia,serif",letterSpacing:1,paddingLeft:34}} placeholder="Type full name as signature..."/>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:13}}>✍</span>
        </div>
        {data.signature&&<div style={{marginTop:4,fontSize:11,color:"rgba(200,200,200,0.45)",fontStyle:"italic"}}>Signed: {data.signature} · {data.date||"date not set"}</div>}
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderTop:"1px solid "+C.border,paddingTop:14}}>
        <div style={{fontSize:11,color:C.muted}}>{data.signature?"Signed by "+data.name+(data.role?" · "+data.role:""):"Signature required before approving."}</div>
        <button onClick={()=>{if(!data.signature){alert("Please enter a signature.");return;}save({...data,approved:!data.approved});}}
          style={{padding:"8px 20px",borderRadius:8,border:"2px solid",cursor:"pointer",fontWeight:800,fontSize:13,borderColor:data.approved?"#16a34a":"rgba(200,200,200,0.2)",background:data.approved?"rgba(20,83,45,0.7)":"rgba(255,255,255,0.05)",color:data.approved?"#86efac":C.muted}}>
          {data.approved?"Approved — Click to Revoke":"Approve This Section"}
        </button>
      </div>
    </div>
  );
}

function PayloadOptions(){
  const {oem,dispatch}=useContext(TeviCtx);
  const pt=oem.payloadTests||{};
  const setPF=(id,field,val)=>dispatch({type:"UPD_FIELD",f:"payloadTests",v:{...pt,[id]:{...pt[id],[field]:val}}});
  const selected=PAYLOAD_LIST.filter(p=>(pt[p.id]||{}).selected);
  const grouped={};
  PAYLOAD_LIST.forEach(p=>{if(!grouped[p.category])grouped[p.category]=[];grouped[p.category].push(p);});
  const catIcons={"Optical / EO":"📷","Thermal / IR":"🌡","Multispectral":"🔬","LiDAR":"📡","Communication":"📶","Spotlight":"🔦","Speaker":"🔊","Other":"🔧"};
  return(
    <div style={{display:"grid",gap:14}}>
      <div style={{background:C.card,borderRadius:12,padding:"14px 20px",border:"1px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{color:"#fff",fontWeight:800,fontSize:15}}>Payload Compatibility & Evaluation</div>
          <div style={{color:C.muted,fontSize:12,marginTop:3}}>{selected.length} payload{selected.length!==1?"s":""} selected</div>
        </div>
      </div>
      <div style={{background:C.card,borderRadius:12,border:"1px solid "+C.border,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{background:"rgba(0,0,0,0.35)",borderBottom:"1px solid "+C.border}}>
              {["Selected","Payload","Category","Pass / Fail / N/A","Tester","Notes"].map(h=><th key={h} style={{padding:"10px 12px",textAlign:"left",color:C.accent,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.6,whiteSpace:"nowrap"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {Object.keys(grouped).map(cat=>{
                const items=grouped[cat];
                const m=catColors[cat]||{color:C.accent,bg:"rgba(255,255,255,0.06)",border:C.border};
                return[
                  <tr key={"cat-"+cat} style={{background:m.bg,borderTop:"1px solid "+m.border,borderBottom:"1px solid "+m.border}}>
                    <td colSpan={6} style={{padding:"7px 12px"}}><div style={{display:"flex",alignItems:"center",gap:7}}><span style={{fontSize:14}}>{catIcons[cat]||"•"}</span><span style={{color:m.color,fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:1.2}}>{cat}</span></div></td>
                  </tr>,
                  ...items.map((p,i)=>{
                    const sel=(pt[p.id]||{}).selected;const d=pt[p.id]||{};
                    return(
                      <tr key={p.id} style={{borderBottom:"1px solid rgba(255,255,255,0.04)",background:sel?m.bg:i%2===0?"transparent":"rgba(255,255,255,0.02)"}}>
                        <td style={{padding:"8px 12px",textAlign:"center",width:60}}><div onClick={()=>setPF(p.id,"selected",!sel)} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:6,border:"1px solid "+(sel?m.color:C.border),background:sel?m.color:"transparent",cursor:"pointer"}}>{sel&&<span style={{color:"#000",fontSize:13,fontWeight:900,lineHeight:1}}>✓</span>}</div></td>
                        <td style={{padding:"8px 12px",color:sel?"#fff":C.text,fontWeight:sel?600:400,cursor:"pointer"}} onClick={()=>setPF(p.id,"selected",!sel)}>{p.label}</td>
                        <td style={{padding:"8px 12px"}}><span style={{fontSize:10,color:m.color,background:m.bg,border:"1px solid "+m.border,borderRadius:4,padding:"2px 7px",whiteSpace:"nowrap"}}>{cat}</span></td>
                        <td style={{padding:"6px 10px"}}>{sel?<PFButtons value={d.result||""} onChange={v=>setPF(p.id,"result",v)}/>:<span style={{color:C.faint,fontSize:11}}>Select to enable</span>}</td>
                        <td style={{padding:"6px 10px"}}>{sel?<input value={d.tester||""} onChange={e=>setPF(p.id,"tester",e.target.value)} style={{...inp,fontSize:11,padding:"4px 7px",width:100}} placeholder="Name..."/>:<span style={{color:C.faint,fontSize:11}}>—</span>}</td>
                        <td style={{padding:"6px 10px"}}>{sel?<input value={d.notes||""} onChange={e=>setPF(p.id,"notes",e.target.value)} style={{...inp,fontSize:11,padding:"4px 7px",minWidth:160}} placeholder="Notes..."/>:<span style={{color:C.faint,fontSize:11}}>—</span>}</td>
                      </tr>
                    );
                  })
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UseCasesPanel(){
  const {oem,dispatch}=useContext(TeviCtx);
  const [activeSection,setActiveSection]=useState("Law Enforcement");
  const sectionMeta={"Law Enforcement":{color:"#4a9eff",bg:"rgba(74,158,255,0.08)",border:"rgba(74,158,255,0.3)",icon:"🚔"},"Campus Security":{color:"#a78bfa",bg:"rgba(167,139,250,0.08)",border:"rgba(167,139,250,0.3)",icon:"🏛"},"Critical Infrastructure":{color:"#f59e0b",bg:"rgba(245,158,11,0.08)",border:"rgba(245,158,11,0.3)",icon:"🏭"}};
  const meta=sectionMeta[activeSection];
  return(
    <div style={{display:"grid",gap:14}}>
      <div style={{background:C.card,borderRadius:12,padding:14,border:"1px solid "+C.border}}>
        <div style={{color:C.muted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Security Application Tests</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{Object.keys(sectionMeta).map(s=>{const m=sectionMeta[s];const active=activeSection===s;return(<button key={s} onClick={()=>setActiveSection(s)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid "+(active?m.border:C.border),background:active?m.bg:"rgba(255,255,255,0.03)",color:"#fff",fontWeight:active?700:400,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6,opacity:active?1:0.55}}><span>{m.icon}</span>{s}</button>);})}</div>
      </div>
      <div style={{background:C.card,borderRadius:12,border:"1px solid "+meta.border,padding:18}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,paddingBottom:14,borderBottom:"1px solid "+C.border}}>
          <span style={{fontSize:22}}>{meta.icon}</span>
          <div><div style={{color:meta.color,fontSize:15,fontWeight:800}}>{activeSection}</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>Security Application — Scored Tests</div></div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{borderBottom:"1px solid "+C.border}}>{["Test","Min. Standard","Pass / Fail / N/A","Tester","Date","Notes"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:11,letterSpacing:0.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
            <tbody>{(TESTS[activeSection]||[]).map((t,i)=>(
              <tr key={t.id} style={{borderBottom:"1px solid rgba(255,255,255,0.04)",background:i%2===0?"transparent":"rgba(255,255,255,0.02)"}}>
                <td style={{padding:"7px 10px",color:C.text}}>{t.test}</td>
                <td style={{padding:"7px 10px",color:C.muted,fontSize:12}}>{t.standard}</td>
                <td style={{padding:"6px 8px"}}><PFButtons value={oem.results[t.id+"_pfn"]||""} onChange={v=>dispatch({type:"UPD_RESULT",id:t.id+"_pfn",v})}/></td>
                <td style={{padding:"6px 8px"}}><input value={oem.notes[t.id+"_tester"]||""} onChange={e=>dispatch({type:"UPD_NOTE",id:t.id+"_tester",v:e.target.value})} style={{...inp,width:100}} placeholder="Name..."/></td>
                <td style={{padding:"6px 8px"}}><input type="date" value={oem.notes[t.id+"_date"]||""} onChange={e=>dispatch({type:"UPD_NOTE",id:t.id+"_date",v:e.target.value})} style={{...inp,width:120}}/></td>
                <td style={{padding:"6px 8px"}}><input value={oem.notes[t.id]||""} onChange={e=>dispatch({type:"UPD_NOTE",id:t.id,v:e.target.value})} style={{...inp,minWidth:130}} placeholder="Notes..."/></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function WeeklyChecks(){
  const {oem,dispatch}=useContext(TeviCtx);
  return(
    <div>
      <p style={{color:"#fde68a",fontSize:13,marginBottom:16,fontWeight:600}}>Track weekly pre-flight inspections across all 16 weeks.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        {Array.from({length:16},(_,i)=>i+1).map(w=>{
          const done=WEEKLY_ITEMS.filter(item=>oem.weeklyChecks[w+"_"+item]).length;
          const complete=done===WEEKLY_ITEMS.length;
          return(
            <div key={w} style={{background:C.card,borderRadius:10,padding:14,border:"1px solid "+(complete?"rgba(134,239,172,0.4)":"rgba(253,230,138,0.2)")}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{color:complete?"#86efac":"#fde68a",fontWeight:700,fontSize:13}}>Week {w}</span>
                <span style={{fontSize:11,color:complete?"#86efac":C.muted,background:complete?"rgba(20,83,45,0.6)":"rgba(255,255,255,0.06)",borderRadius:4,padding:"2px 7px",fontWeight:600,border:"1px solid "+(complete?"#166534":C.border)}}>{done}/{WEEKLY_ITEMS.length}</span>
              </div>
              {WEEKLY_ITEMS.map((item,i)=>(
                <label key={i} style={{display:"flex",alignItems:"flex-start",gap:7,marginBottom:6,cursor:"pointer"}}>
                  <input type="checkbox" checked={!!oem.weeklyChecks[w+"_"+item]} onChange={()=>dispatch({type:"TOGGLE_WEEK",w,item})} style={{marginTop:2,accentColor:C.accent,flexShrink:0}}/>
                  <span style={{color:oem.weeklyChecks[w+"_"+item]?C.faint:C.muted,fontSize:11,textDecoration:oem.weeklyChecks[w+"_"+item]?"line-through":"none"}}>{item}</span>
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FinalEvalSignOff(){
  const {oem,dispatch}=useContext(TeviCtx);
  const p=oem.procurement;
  const sigs=oem.signoffs||[];
  const approved=sigs.filter(s=>s.approved).length;
  return(
    <div style={{display:"grid",gap:14}}>
      <div style={{background:C.card,borderRadius:12,padding:20,border:"1px solid rgba(134,239,172,0.35)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,paddingBottom:12,borderBottom:"1px solid rgba(134,239,172,0.25)"}}>
          <div style={{width:3,height:20,borderRadius:2,background:"#86efac"}}/>
          <span style={{color:"#86efac",fontSize:13,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Final Evaluation Summary</span>
        </div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{borderBottom:"1px solid "+C.border}}>{["Section","Standard","Status"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:11,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{Object.keys(TESTS).map((sec,i)=>{
            const results=(TESTS[sec]||[]).map(t=>oem.results[t.id+"_pfn"]).filter(Boolean);
            const anyFail=results.some(r=>r==="Fail");
            const allDone=results.length===(TESTS[sec]||[]).length;
            const status=results.length===0?"Pending":anyFail?"FAIL":allDone?"PASS":"In Progress";
            const sc=status==="PASS"?"#86efac":status==="FAIL"?"#fca5a5":C.muted;
            const sb=status==="PASS"?"rgba(20,83,45,0.6)":status==="FAIL"?"rgba(127,29,29,0.6)":"rgba(255,255,255,0.05)";
            const sbrd=status==="PASS"?"#166534":status==="FAIL"?"#991b1b":C.border;
            return(<tr key={sec} style={{borderBottom:"1px solid rgba(255,255,255,0.03)",background:i%2===0?"transparent":"rgba(255,255,255,0.02)"}}><td style={{padding:"8px 12px",color:C.text}}>{sec}</td><td style={{padding:"8px 12px",color:C.muted,fontSize:12}}>All tests Pass or N/A</td><td style={{padding:"8px 12px"}}><span style={{fontSize:12,fontWeight:700,color:sc,background:sb,borderRadius:4,padding:"2px 10px",border:"1px solid "+sbrd}}>{status}</span></td></tr>);
          })}</tbody>
        </table></div>
      </div>
      <div style={{background:C.card,borderRadius:12,padding:20,border:"1px solid rgba(244,114,182,0.35)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,paddingBottom:12,borderBottom:"1px solid rgba(244,114,182,0.25)"}}>
          <div style={{width:3,height:20,borderRadius:2,background:"#f472b6"}}/>
          <span style={{color:"#f472b6",fontSize:13,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Procurement Decision</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>{[["score","Overall Score/Notes"],["evaluatorName","Lead Evaluator"],["sites","Recommended Sites"],["date","Decision Date"]].map(([f,label])=><div key={f}><label style={lbl}>{label}</label><input value={p[f]||""} onChange={e=>dispatch({type:"UPD_PROC",f,v:e.target.value})} style={{...inp,marginTop:4}}/></div>)}</div>
        <div style={{marginBottom:12}}><label style={lbl}>Decision</label><div style={{display:"flex",gap:10,marginTop:8}}>{["YES","NO","CONDITIONAL"].map(d=><button key={d} onClick={()=>dispatch({type:"UPD_PROC",f:"decision",v:d})} style={{flex:1,padding:"10px",borderRadius:8,border:"2px solid",cursor:"pointer",fontWeight:800,fontSize:14,borderColor:p.decision===d?(d==="YES"?"#16a34a":d==="NO"?"#dc2626":"#d97706"):C.border,background:p.decision===d?(d==="YES"?"rgba(20,83,45,0.7)":d==="NO"?"rgba(127,29,29,0.7)":"rgba(120,53,15,0.7)"):"rgba(255,255,255,0.04)",color:p.decision===d?(d==="YES"?"#86efac":d==="NO"?"#fca5a5":"#fde68a"):C.muted}}>{d}</button>)}</div></div>
        <div><label style={lbl}>Conditions / Notes</label><textarea value={p.conditions||""} onChange={e=>dispatch({type:"UPD_PROC",f:"conditions",v:e.target.value})} style={{...inp,marginTop:4,resize:"vertical",minHeight:80}} placeholder="Outstanding conditions..."/></div>
      </div>
      <div style={{background:C.card,borderRadius:12,padding:"14px 20px",border:"1px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
        <div><div style={{color:C.accent,fontWeight:700,fontSize:13,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Evaluator Sign-Off</div><div style={{color:C.muted,fontSize:12}}>{approved} of {sigs.length} signed off</div></div>
        <button onClick={()=>dispatch({type:"ADD_SIG"})} style={{background:"rgba(200,200,200,0.1)",color:"#fff",border:"1px solid "+C.border,borderRadius:7,padding:"7px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Add Evaluator</button>
      </div>
      {sigs.map((s,si)=>(
        <div key={si} style={{background:C.card,borderRadius:12,border:"2px solid "+(s.approved?"rgba(22,101,52,0.7)":C.border),padding:20,position:"relative"}}>
          {s.approved&&<div style={{position:"absolute",top:14,right:52,background:"rgba(20,83,45,0.7)",color:"#86efac",borderRadius:6,padding:"3px 12px",fontSize:11,fontWeight:700,border:"1px solid #166534"}}>SIGNED</div>}
          <button onClick={()=>dispatch({type:"DEL_SIG",si})} style={{position:"absolute",top:14,right:14,background:"rgba(127,29,29,0.4)",color:"#fca5a5",border:"1px solid #991b1b",borderRadius:5,padding:"3px 8px",fontSize:11,cursor:"pointer"}}>x</button>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
            <div><label style={lbl}>Full Name</label><input value={s.name||""} onChange={e=>dispatch({type:"UPD_SIG",si,f:"name",v:e.target.value})} style={{...inp,marginTop:4}} placeholder="First Last"/></div>
            <div><label style={lbl}>Role</label><select value={s.role||""} onChange={e=>dispatch({type:"UPD_SIG",si,f:"role",v:e.target.value})} style={{...inp,marginTop:4,cursor:"pointer"}}><option value="">Select...</option>{ROLES.map(r=><option key={r}>{r}</option>)}<option value="custom">Custom...</option></select></div>
            {s.role==="custom"?<div><label style={lbl}>Custom Role</label><input value={s.customRole||""} onChange={e=>dispatch({type:"UPD_SIG",si,f:"customRole",v:e.target.value})} style={{...inp,marginTop:4}} placeholder="Enter role..."/></div>:<div><label style={lbl}>Date</label><input type="date" value={s.date||""} onChange={e=>dispatch({type:"UPD_SIG",si,f:"date",v:e.target.value})} style={{...inp,marginTop:4}}/></div>}
          </div>
          <div style={{marginBottom:14}}><label style={lbl}>Phase / Section</label><input value={s.phase||""} onChange={e=>dispatch({type:"UPD_SIG",si,f:"phase",v:e.target.value})} style={{...inp,marginTop:4}} placeholder="e.g. Phase 1, All Sections"/></div>
          <div style={{marginBottom:14}}>
            <label style={lbl}>Electronic Signature</label>
            <div style={{position:"relative",marginTop:4}}><input value={s.signature||""} onChange={e=>dispatch({type:"UPD_SIG",si,f:"signature",v:e.target.value})} style={{...inp,fontSize:15,fontStyle:"italic",fontFamily:"Georgia,serif",letterSpacing:1,paddingLeft:36}} placeholder="Type full name as signature..."/><span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:14}}>✍</span></div>
            {s.signature&&<div style={{marginTop:4,fontSize:11,color:"rgba(200,200,200,0.5)",fontStyle:"italic"}}>Signed: {s.signature} · {s.date||"date not set"}</div>}
          </div>
          <div style={{marginBottom:14}}><label style={lbl}>Notes</label><textarea value={s.notes||""} onChange={e=>dispatch({type:"UPD_SIG",si,f:"notes",v:e.target.value})} style={{...inp,marginTop:4,resize:"vertical",minHeight:56}} placeholder="Discrepancies, limiting factors..."/></div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderTop:"1px solid "+C.border,paddingTop:14}}>
            <div style={{fontSize:11,color:C.muted}}>{s.signature?"Signed by "+s.signature+(s.role&&s.role!=="custom"?" · "+s.role:""):"Signature required before approving."}</div>
            <button onClick={()=>{if(!s.signature){alert("Please enter a signature.");return;}dispatch({type:"TOGGLE_APPROVED",si});}} style={{padding:"8px 20px",borderRadius:8,border:"2px solid",cursor:"pointer",fontWeight:800,fontSize:13,borderColor:s.approved?"#16a34a":"rgba(200,200,200,0.2)",background:s.approved?"rgba(20,83,45,0.7)":"rgba(255,255,255,0.05)",color:s.approved?"#86efac":C.muted}}>
              {s.approved?"Approved — Click to Revoke":"Approve and Sign Off"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function VendorMatrix(){
  const {state,dispatch}=useContext(TeviCtx);
  const [expandedCat,setExpandedCat]=useState(null);
  const matrixData=(state.oems[0]&&state.oems[0].matrix)||{};
  const getMV=(catId,rowId,vi)=>matrixData[catId+"_"+rowId+"_"+vi]||"";
  const setMV=(catId,rowId,vi,val)=>{
    const next={...matrixData,[catId+"_"+rowId+"_"+vi]:val};
    dispatch({type:"SET_MATRIX",oems:state.oems.map((o,i)=>i===0?{...o,matrix:next}:o)});
  };
  const tColor=v=>v==="Yes"?"#86efac":v==="No"?"#fca5a5":v==="Pending"?"#fde68a":C.muted;
  const tBg=v=>v==="Yes"?"rgba(20,83,45,0.5)":v==="No"?"rgba(127,29,29,0.5)":v==="Pending"?"rgba(120,53,15,0.5)":"rgba(255,255,255,0.04)";
  const tBrd=v=>v==="Yes"?"#166534":v==="No"?"#991b1b":v==="Pending"?"#854d0e":C.border;
  return(
    <div style={{display:"grid",gap:10}}>
      {EVAL_MATRIX.map(cat=>{
        const isOpen=expandedCat===cat.id;
        return(
          <div key={cat.id} style={{background:C.card,borderRadius:12,border:"1px solid "+(isOpen?cat.border:C.border),overflow:"hidden"}}>
            <button onClick={()=>setExpandedCat(e=>e===cat.id?null:cat.id)} style={{width:"100%",background:"transparent",border:"none",cursor:"pointer",padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{background:cat.bg,border:"1px solid "+cat.border,borderRadius:8,padding:"5px 12px",fontSize:18}}>{cat.icon}</div><div style={{color:cat.color,fontWeight:800,fontSize:14}}>{cat.label}</div></div>
              <span style={{color:cat.color,fontSize:16,fontWeight:700}}>{isOpen?"▲":"▼"}</span>
            </button>
            {isOpen&&<div style={{overflowX:"auto",borderTop:"1px solid "+C.border}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:"rgba(0,0,0,0.3)"}}><th style={{padding:"10px 14px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:10,textTransform:"uppercase",minWidth:180,borderBottom:"1px solid "+C.border}}>Criteria</th>{state.oems.map((o,vi)=><th key={vi} style={{padding:"10px 14px",textAlign:"center",color:cat.color,fontWeight:700,fontSize:13,minWidth:160,borderBottom:"1px solid "+C.border,borderLeft:"1px solid rgba(255,255,255,0.05)"}}>{o.name||"Vendor "+(vi+1)}</th>)}</tr></thead>
                <tbody>{cat.rows.map((row,ri)=>(
                  <tr key={row.id} style={{borderBottom:"1px solid rgba(255,255,255,0.04)",background:ri%2===0?"transparent":"rgba(255,255,255,0.02)"}}>
                    <td style={{padding:"9px 14px",color:C.text,whiteSpace:"nowrap"}}>{row.label}</td>
                    {state.oems.map((_,vi)=>{
                      const val=getMV(cat.id,row.id,vi);
                      return(
                        <td key={vi} style={{padding:"7px 10px",textAlign:"center",borderLeft:"1px solid rgba(255,255,255,0.05)"}}>
                          {row.type==="toggle"&&<div style={{display:"flex",gap:4,justifyContent:"center"}}>{["Yes","No","Pending"].map(opt=><button key={opt} onClick={()=>setMV(cat.id,row.id,vi,opt)} style={{padding:"3px 8px",borderRadius:5,border:"1px solid "+(val===opt?tBrd(opt):C.border),background:val===opt?tBg(opt):"rgba(255,255,255,0.03)",color:val===opt?tColor(opt):"#fff",fontSize:10,fontWeight:val===opt?700:400,cursor:"pointer",opacity:val===opt?1:0.45}}>{opt}</button>)}</div>}
                          {row.type==="text"&&<input value={val} onChange={e=>setMV(cat.id,row.id,vi,e.target.value)} style={{...inp,fontSize:11,textAlign:"center",padding:"4px 7px"}} placeholder="—"/>}
                          {row.type==="dollar"&&<div style={{position:"relative",display:"inline-flex",alignItems:"center"}}><span style={{position:"absolute",left:8,color:C.muted,fontSize:11}}>$</span><input type="number" min="0" value={val} onChange={e=>setMV(cat.id,row.id,vi,e.target.value)} style={{...inp,fontSize:11,textAlign:"right",paddingLeft:18,paddingRight:6,width:120}} placeholder="0"/></div>}
                          {row.type==="pfn"&&<div style={{display:"flex",gap:4,justifyContent:"center"}}>{["Pass","Fail","N/A"].map(opt=><button key={opt} onClick={()=>setMV(cat.id,row.id,vi,opt)} style={{padding:"3px 8px",borderRadius:5,border:"1px solid "+(val===opt?pfBrd(opt):C.border),background:val===opt?pfBg(opt):"rgba(255,255,255,0.03)",color:val===opt?pfColor(opt):"#fff",fontSize:10,fontWeight:val===opt?700:400,cursor:"pointer",opacity:val===opt?1:0.45,whiteSpace:"nowrap"}}>{opt}</button>)}</div>}
                          {row.type==="notes"&&<textarea value={val} onChange={e=>setMV(cat.id,row.id,vi,e.target.value)} style={{...inp,fontSize:11,resize:"vertical",minHeight:48,textAlign:"left",lineHeight:1.4}} placeholder="Notes..."/>}
                        </td>
                      );
                    })}
                  </tr>
                ))}</tbody>
              </table>
            </div>}
          </div>
        );
      })}
    </div>
  );
}

// ── VendorRating and AccSection extracted as module-level components ────────

function VendorRating({id,types,ac,setAC}){
  const v=ac[id]||"";
  const opts=types||[["ms","Met"],["bs","Below"],["na","N/A"]];
  const col=x=>x==="ms"||x==="yes"||x==="pass"?"#86efac":x==="bs"||x==="no"||x==="fail"?"#fca5a5":x==="part"?"#fde68a":"#888";
  const bg2=x=>x==="ms"||x==="yes"||x==="pass"?"rgba(20,83,45,0.5)":x==="bs"||x==="no"||x==="fail"?"rgba(127,29,29,0.5)":x==="part"?"rgba(120,53,15,0.5)":"rgba(255,255,255,0.05)";
  const brd=x=>x==="ms"||x==="yes"||x==="pass"?"#166534":x==="bs"||x==="no"||x==="fail"?"#991b1b":x==="part"?"#854d0e":C.border;
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
      <div style={{display:"flex",gap:2}}>
        {opts.map(([cls,lab])=>(
          <button key={cls} onClick={()=>setAC(id,cls)}
            style={{fontSize:10,padding:"2px 5px",borderRadius:4,border:"1px solid "+(v===cls?brd(cls):C.border),background:v===cls?bg2(cls):"rgba(255,255,255,0.03)",color:v===cls?col(cls):C.muted,cursor:"pointer",whiteSpace:"nowrap",fontWeight:v===cls?700:400}}>
            {lab}
          </button>
        ))}
      </div>
      {(v==="bs"||v==="no"||v==="fail"||v==="part")&&(
        <textarea placeholder="Note..." style={{...inp,fontSize:10,minHeight:28,resize:"vertical",width:86,padding:"2px 4px"}}/>
      )}
    </div>
  );
}

function AccSection({id,num,title,sub,color,bg,border,children,isOpen,onToggle,secPct}){
  const pctVal=secPct(id);
  const pctColor=pctVal===100?"#86efac":pctVal>0?"#fbbf24":C.muted;
  return(
    <div style={{border:"1px solid "+(isOpen?border:C.border),borderRadius:12,overflow:"hidden",marginBottom:8}}>
      <button onClick={()=>onToggle(id)} style={{width:"100%",background:isOpen?bg:"rgba(255,255,255,0.02)",border:"none",cursor:"pointer",padding:"11px 16px",display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
        <span style={{background:bg,border:"1px solid "+border,borderRadius:5,padding:"2px 9px",fontSize:10,fontWeight:800,color,flexShrink:0}}>{num}</span>
        <div style={{flex:1}}>
          <div style={{color:"#fff",fontWeight:600,fontSize:13}}>{title}</div>
          <div style={{color:C.muted,fontSize:11,marginTop:1}}>{sub}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:11,fontWeight:700,color:pctColor}}>{pctVal}%</span>
          <span style={{color:C.muted,fontSize:12}}>{isOpen?"▲":"▼"}</span>
        </div>
      </button>
      {isOpen&&<div style={{borderTop:"1px solid "+C.border}}>{children}</div>}
    </div>
  );
}

// ── COMBINED EVALUATION CHECKLIST ─────────────────────────────────────────
function EvaluationChecklist(){
  const {oem,dispatch}=useContext(TeviCtx);
  const [openSec,setOpenSec]=useState("subj");
  const ac=oem.advChecklist||{};
  const setAC=(k,v)=>dispatch({type:"UPD_ADV_CHECKLIST",k,v});

  const allVals=Object.values(ac);
  const rated=allVals.filter(v=>v&&v!=="").length;
  const total=104;
  const pct=Math.round(rated/total*100);
  const pass=allVals.filter(v=>v==="ms"||v==="yes"||v==="pass").length;
  const fail=allVals.filter(v=>v==="bs"||v==="no"||v==="fail"||v==="part").length;
  const na=allVals.filter(v=>v==="na").length;

  const secItems={subj:20,comp:32,fmea:16,env:24,bench:12};
  const secPct=sec=>{
    const prefix=sec+"-";
    const done=Object.keys(ac).filter(k=>k.startsWith(prefix)&&ac[k]).length;
    return Math.round(done/secItems[sec]*100);
  };
  const secsDone=["subj","comp","fmea","env","bench"].filter(s=>secPct(s)===100).length;

  const toggle=sec=>setOpenSec(openSec===sec?null:sec);

  const badgeStyle=(bg,color)=>({display:"inline-block",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:5,background:bg,color,whiteSpace:"nowrap"});
  const compBadge=t=>(<span style={badgeStyle("rgba(74,158,255,0.15)","#4a9eff")}>{t}</span>);
  const fmeaBadge=t=>(<span style={badgeStyle("rgba(167,139,250,0.15)","#a78bfa")}>{t}</span>);
  const benchBadge=t=>(<span style={badgeStyle("rgba(251,191,36,0.15)","#fbbf24")}>{t}</span>);

  const tblHdr=(cols)=>(
    <thead><tr style={{background:"rgba(0,0,0,0.3)",borderBottom:"1px solid "+C.border}}>
      {cols.map((c,i)=><th key={i} style={{padding:"8px 10px",textAlign:i===0?"left":"center",color:C.muted,fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,whiteSpace:"nowrap",minWidth:i===0?180:100}}>{c}</th>)}
    </tr></thead>
  );

  const tblRow=(even)=>({borderBottom:"1px solid rgba(255,255,255,0.04)",background:even?"transparent":"rgba(255,255,255,0.02)"});

  return(
    <div style={{display:"grid",gap:0}}>
      <div style={{background:C.card,borderRadius:12,padding:"14px 18px",marginBottom:16,border:"1px solid rgba(192,132,252,0.3)"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginBottom:12}}>
          <div>
            <div style={{color:"#c084fc",fontWeight:700,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>Combined Evaluation Checklist</div>
            <div style={{color:C.muted,fontSize:11,marginTop:2}}>Subjective · Comparative · FMEA · Environmental · Benchmarks</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:26,fontWeight:700,color:"#c084fc"}}>{pct}%</div>
            <div style={{fontSize:11,color:C.muted}}>completed</div>
          </div>
        </div>
        <div style={{height:5,background:"rgba(255,255,255,0.08)",borderRadius:3,overflow:"hidden",marginBottom:14}}>
          <div style={{height:"100%",width:pct+"%",background:"#c084fc",borderRadius:3,transition:"width 0.3s"}}/>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {[["Total Items","104","#c8c8c8"],[`Rated`,rated,"#c084fc"],["Pass / Met",pass,"#86efac"],["Fail / Below",fail,"#fca5a5"],["N/A",na,"#fde68a"],["Sections Done",secsDone+"/5","#38bdf8"]].map(([label,val,col])=>(
            <div key={label} style={{background:"rgba(255,255,255,0.04)",border:"1px solid "+C.border,borderRadius:8,padding:"7px 12px",textAlign:"center",minWidth:70}}>
              <div style={{fontSize:18,fontWeight:700,color:col}}>{val}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:1}}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <AccSection id="subj" num="01" title="Subjective checks" sub="Evaluator judgment — Yes / Partially / No" color="#a78bfa" bg="rgba(167,139,250,0.06)" border="rgba(167,139,250,0.35)" isOpen={openSec==="subj"} onToggle={toggle} secPct={secPct}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,tableLayout:"fixed"}}>
            {tblHdr(["Item","Lead Evaluator","Operators"])}
            <tbody>
              {SUBJ_CHECKS.map((item,ii)=>(
                <tr key={ii} style={tblRow(ii%2===0)}>
                  <td style={{padding:"8px 10px",color:C.text,fontSize:12}}>{item}</td>
                  <td style={{padding:"6px 10px",textAlign:"center"}}><VendorRating id={`subj-${ii}-0`} types={[["yes","Yes"],["part","Part"],["no","No"]]} ac={ac} setAC={setAC}/></td>
                  <td style={{padding:"6px 10px",textAlign:"center"}}><VendorRating id={`subj-${ii}-1`} types={[["yes","Yes"],["part","Part"],["no","No"]]} ac={ac} setAC={setAC}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AccSection>

      <AccSection id="comp" num="02" title="Comparative / Repeatability" sub="Platform comparison, repeatability, and endurance — Met Spec / Below Spec / N/A" color="#4a9eff" bg="rgba(74,158,255,0.06)" border="rgba(74,158,255,0.35)" isOpen={openSec==="comp"} onToggle={toggle} secPct={secPct}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,tableLayout:"fixed"}}>
            {tblHdr(["Test","Type","DJI","Skydio","Sunflower","Quantum"])}
            <tbody>
              {COMP_CHECKS.map(grp=>[
                <tr key={"cat-"+grp.cat} style={{background:"rgba(74,158,255,0.05)",borderBottom:"1px solid rgba(74,158,255,0.15)",borderTop:"1px solid rgba(74,158,255,0.15)"}}>
                  <td colSpan={6} style={{padding:"5px 10px",fontSize:10,fontWeight:600,color:"#4a9eff",textTransform:"uppercase",letterSpacing:0.8}}>{grp.cat}</td>
                </tr>,
                ...grp.items.map((item,ii)=>(
                  <tr key={item.id} style={tblRow(ii%2===0)}>
                    <td style={{padding:"8px 10px",color:C.text}}><div style={{fontWeight:500,fontSize:12}}>{item.n}</div><div style={{color:C.muted,fontSize:10,marginTop:2}}>{item.d}</div></td>
                    <td style={{padding:"6px 10px",textAlign:"center"}}>{compBadge(item.t)}</td>
                    {VENDORS.map((_,vi)=><td key={vi} style={{padding:"6px 8px",textAlign:"center"}}><VendorRating id={`comp-${item.id}-${vi}`} ac={ac} setAC={setAC}/></td>)}
                  </tr>
                ))
              ])}
            </tbody>
          </table>
        </div>
      </AccSection>

      <AccSection id="fmea" num="03" title="FMEA — Failure Mode & Effects" sub="Deliberate failure induction and failsafe validation — Met Spec / Below Spec / N/A" color="#a78bfa" bg="rgba(167,139,250,0.06)" border="rgba(167,139,250,0.35)" isOpen={openSec==="fmea"} onToggle={toggle} secPct={secPct}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,tableLayout:"fixed"}}>
            {tblHdr(["Failure Mode","Induced Via","DJI","Skydio","Sunflower","Quantum"])}
            <tbody>
              {FMEA_CHECKS.map((item,ii)=>(
                <tr key={item.id} style={tblRow(ii%2===0)}>
                  <td style={{padding:"8px 10px",color:C.text}}><div style={{fontWeight:500,fontSize:12}}>{item.n}</div><div style={{color:C.muted,fontSize:10,marginTop:2}}>{item.d}</div></td>
                  <td style={{padding:"6px 10px",textAlign:"center"}}>{fmeaBadge(item.t)}</td>
                  {VENDORS.map((_,vi)=><td key={vi} style={{padding:"6px 8px",textAlign:"center"}}><VendorRating id={`fmea-${item.id}-${vi}`} ac={ac} setAC={setAC}/></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AccSection>

      <AccSection id="env" num="04" title="Environmental stress" sub="Wind, temperature, and water ingress — measured conditions logged per session" color="#34d399" bg="rgba(52,211,153,0.06)" border="rgba(52,211,153,0.35)" isOpen={openSec==="env"} onToggle={toggle} secPct={secPct}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,tableLayout:"fixed"}}>
            {tblHdr(["Test","Condition Logged","DJI","Skydio","Sunflower","Quantum"])}
            <tbody>
              {ENV_CHECKS.map(grp=>[
                <tr key={"cat-"+grp.cat} style={{background:"rgba(52,211,153,0.05)",borderBottom:"1px solid rgba(52,211,153,0.15)",borderTop:"1px solid rgba(52,211,153,0.15)"}}>
                  <td colSpan={6} style={{padding:"5px 10px",fontSize:10,fontWeight:600,color:"#34d399",textTransform:"uppercase",letterSpacing:0.8}}>{grp.cat}</td>
                </tr>,
                ...grp.items.map((item,ii)=>(
                  <tr key={item.id} style={tblRow(ii%2===0)}>
                    <td style={{padding:"8px 10px",color:C.text}}><div style={{fontWeight:500,fontSize:12}}>{item.n}</div><div style={{color:C.muted,fontSize:10,marginTop:2}}>{item.d}</div></td>
                    <td style={{padding:"6px 8px"}}>
                      <input style={{...inp,fontSize:11,padding:"3px 6px",borderColor:"rgba(52,211,153,0.25)"}} placeholder={item.ph}/>
                      <div style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,color:"#38bdf8",background:"rgba(56,189,248,0.1)",borderRadius:4,padding:"2px 6px",border:"1px solid rgba(56,189,248,0.3)",cursor:"pointer",marginTop:4,whiteSpace:"nowrap"}}>Link METAR</div>
                    </td>
                    {VENDORS.map((_,vi)=><td key={vi} style={{padding:"6px 8px",textAlign:"center"}}><VendorRating id={`env-${item.id}-${vi}`} ac={ac} setAC={setAC}/></td>)}
                  </tr>
                ))
              ])}
            </tbody>
          </table>
        </div>
      </AccSection>

      <AccSection id="bench" num="05" title="Performance benchmarks" sub="Range and signal integrity at varying distances — Met Spec / Below Spec / N/A" color="#fbbf24" bg="rgba(251,191,36,0.06)" border="rgba(251,191,36,0.35)" isOpen={openSec==="bench"} onToggle={toggle} secPct={secPct}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,tableLayout:"fixed"}}>
            {tblHdr(["Test","Method","DJI","Skydio","Sunflower","Quantum"])}
            <tbody>
              {BENCH_CHECKS.map((item,ii)=>(
                <tr key={item.id} style={tblRow(ii%2===0)}>
                  <td style={{padding:"8px 10px",color:C.text}}><div style={{fontWeight:500,fontSize:12}}>{item.n}</div><div style={{color:C.muted,fontSize:10,marginTop:2}}>{item.d}</div></td>
                  <td style={{padding:"6px 10px",textAlign:"center"}}>{benchBadge(item.t)}</td>
                  {VENDORS.map((_,vi)=><td key={vi} style={{padding:"6px 8px",textAlign:"center"}}><VendorRating id={`bench-${item.id}-${vi}`} ac={ac} setAC={setAC}/></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AccSection>
    </div>
  );
}

function SixMonthPlan(){
  const [expanded,setExpanded]=useState(null);
  const milestones=[
    {week:"Wk 1-2",event:"Dock commissioned. Regulatory checklist complete. Baseline flights begin."},
    {week:"Wk 3-4",event:"Flight, Dock, Sensor tests underway. Weather Log populated."},
    {week:"Wk 5-6",event:"Reliability and Security baseline tests. Failsafe validation."},
    {week:"Wk 7-8",event:"Month 2 gate review. Go/No-Go for Phase 2."},
    {week:"Wk 9-10",event:"Phase 2 opens. Use case missions begin."},
    {week:"Wk 11-12",event:"Night and thermal ops. Payload testing expanded."},
    {week:"Wk 13-14",event:"Environmental and RF-contested testing."},
    {week:"Wk 15-16",event:"Month 4 gate review. Go/No-Go for Phase 3."},
    {week:"Wk 17-18",event:"Phase 3 endurance cycling. 24-hour op. Multi-mission day."},
    {week:"Wk 19-20",event:"Flight hours validation. 50+ cycles. Cybersecurity assessment."},
    {week:"Wk 21-22",event:"Phase 4 opens. All scores finalized."},
    {week:"Wk 23-24",event:"Final sign-offs. Procurement decision. Program close."},
  ];
  const phases=[
    {id:"p1",month:"Months 1-2",label:"Phase 1",title:"Baseline Testing",color:"#4a9eff",bg:"rgba(74,158,255,0.08)",border:"rgba(74,158,255,0.3)",site:"TRG",gate:"All minimums met · Regulatory compliance confirmed",objective:"Establish baseline performance across all core capability areas.",weekly:["Pre-flight inspection every session","Log METAR in Weather tab","Enter Pass/Fail/N/A in all test tabs","Record tester name and date","Document anomalies","Confirm GCS and GPS before each session","Verify FAA airspace and TFRs"],      monthly:["Review Final Eval tab","Confirm flight hours on pace","Confirm regulatory checklist complete","Lead Evaluator signs off","Month 2 Go/No-Go Gate"]},
    {id:"p2",month:"Months 3-4",label:"Phase 2",title:"Operational Validation",color:"#a78bfa",bg:"rgba(167,139,250,0.08)",border:"rgba(167,139,250,0.3)",site:"TRG dock",gate:"Use case pass rates 90%+ · No Category 1 failures",objective:"Validate performance across all three security use cases.",weekly:["Use case missions logged","Alert-to-airborne times tracked","Sensor issues logged with root cause","Remote operator comms verified","Evidence chain-of-custody verified"],monthly:["All three use cases flown","Environmental stress completed","Flight hours on pace","Remote operator proficiency confirmed","Interim briefing","Month 4 Go/No-Go Gate"]},
    {id:"p3",month:"Month 5",label:"Phase 3",title:"Endurance & Integration",color:"#f59e0b",bg:"rgba(245,158,11,0.08)",border:"rgba(245,158,11,0.3)",site:"TRG endurance cycling",gate:"20+ flight hours · 50+ dock cycles · Integration complete",objective:"Accumulate flight hours, stress-test dock automation, confirm integration.",weekly:["Update running flight hours","Log dock cycle count","Document endurance anomalies","Training records current","3 consecutive alert response tests"],      monthly:["20+ flight hours confirmed","50+ dock cycles completed","24-hour autonomous op test","Multi-mission day","System integration confirmed","Cybersecurity assessment done"]},
    {id:"p4",month:"Month 6",label:"Phase 4",title:"Final Evaluation & Decision",color:"#86efac",bg:"rgba(134,239,172,0.07)",border:"rgba(134,239,172,0.25)",site:"TRG final close-out",      gate:"All sections Pass · Signed decision",objective:"Complete final scoring and produce a signed procurement recommendation.",weekly:["Finalize all section results","Final Eval tab reviewed","Compare tab completed","Discrepancy log closed"],      monthly:["Final evaluation summary complete","All evaluators approve sign-off","Company product briefing","Procurement recommendation archived"]},
  ];
  return(
    <div style={{display:"grid",gap:14}}>
      <div style={{background:C.card,borderRadius:12,padding:20,border:"1px solid "+C.border}}>
        <div style={{color:"#fff",fontSize:18,fontWeight:900,letterSpacing:2,textTransform:"uppercase"}}>Six-Month TEVI Program</div>
        <div style={{color:C.muted,fontSize:13,margin:"6px 0 16px"}}>Testing · Evaluation · Validation · Implementation</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:4}}>{phases.map(p=><div key={p.id} style={{background:p.bg,border:"1px solid "+p.border,borderRadius:7,padding:"8px 12px"}}><div style={{color:p.color,fontWeight:800,fontSize:12}}>{p.month}</div><div style={{color:C.text,fontWeight:700,fontSize:11,marginTop:2}}>{p.label}: {p.title}</div></div>)}</div>
      </div>
      {phases.map(p=>(
        <div key={p.id} style={{background:C.card,borderRadius:12,border:"1px solid "+p.border,overflow:"hidden"}}>
          <button onClick={()=>setExpanded(e=>e===p.id?null:p.id)} style={{width:"100%",background:"transparent",border:"none",cursor:"pointer",padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",textAlign:"left"}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}><div style={{background:p.bg,border:"1px solid "+p.border,borderRadius:8,padding:"6px 14px",minWidth:90,textAlign:"center"}}><div style={{color:p.color,fontWeight:900,fontSize:13}}>{p.label}</div><div style={{color:p.color,fontSize:10,opacity:0.7}}>{p.month}</div></div><div><div style={{color:"#fff",fontWeight:800,fontSize:15}}>{p.title}</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{p.site}</div></div></div>
            <span style={{color:p.color,fontSize:18,fontWeight:700,flexShrink:0}}>{expanded===p.id?"▲":"▼"}</span>
          </button>
          {expanded===p.id&&<div style={{padding:"0 20px 20px"}}>
            <div style={{background:p.bg,border:"1px solid "+p.border,borderRadius:8,padding:"12px 16px",marginBottom:14,marginTop:4}}><div style={{color:p.color,fontWeight:700,fontSize:11,textTransform:"uppercase",marginBottom:6}}>Phase Objective</div><p style={{color:C.text,fontSize:13,margin:0,lineHeight:1.6}}>{p.objective}</p></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
              <div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"14px 16px",border:"1px solid "+C.border}}><div style={{color:C.accent,fontWeight:700,fontSize:11,textTransform:"uppercase",marginBottom:10}}>Weekly Rhythm</div>{p.weekly.map((item,i)=><div key={i} style={{display:"flex",gap:8,marginBottom:7}}><span style={{color:p.color,fontWeight:700,fontSize:12,flexShrink:0}}>→</span><span style={{color:C.muted,fontSize:12,lineHeight:1.5}}>{item}</span></div>)}</div>
              <div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"14px 16px",border:"1px solid "+C.border}}><div style={{color:C.accent,fontWeight:700,fontSize:11,textTransform:"uppercase",marginBottom:10}}>Monthly Review & Gate</div>{p.monthly.map((item,i)=><div key={i} style={{display:"flex",gap:8,marginBottom:7}}><span style={{color:i===p.monthly.length-1?"#fde68a":p.color,fontWeight:700,fontSize:12,flexShrink:0}}>{i===p.monthly.length-1?"⚑":"✓"}</span><span style={{color:i===p.monthly.length-1?"#fde68a":C.muted,fontSize:12,lineHeight:1.5,fontWeight:i===p.monthly.length-1?700:400}}>{item}</span></div>)}</div>
            </div>
            <div style={{background:"rgba(253,230,138,0.06)",border:"1px solid rgba(253,230,138,0.25)",borderRadius:8,padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:16,flexShrink:0}}>⚑</span><span style={{color:"#fde68a",fontWeight:700,fontSize:12}}>Go/No-Go Gate: {p.gate}</span></div>
          </div>}
        </div>
      ))}
      <div style={{background:C.card,borderRadius:12,padding:20,border:"1px solid "+C.border}}>
        <div style={{color:C.accent,fontSize:13,fontWeight:700,marginBottom:16,letterSpacing:2,textTransform:"uppercase"}}>24-Week Milestone Timeline</div>
        <div style={{position:"relative"}}>
          <div style={{position:"absolute",left:52,top:0,bottom:0,width:1,background:"linear-gradient(to bottom,rgba(74,158,255,0.4),rgba(134,239,172,0.4))",zIndex:0}}/>
          {milestones.map((m,i)=>{
            const col=i<4?"#4a9eff":i<8?"#a78bfa":i<10?"#f59e0b":"#86efac";
            return(
              <div key={i} style={{display:"flex",gap:16,marginBottom:12,position:"relative",zIndex:1}}>
                <div style={{width:90,flexShrink:0,textAlign:"right"}}>
                  <span style={{background:"rgba(0,0,0,0.6)",border:"1px solid "+col,borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700,color:col,display:"inline-block"}}>{m.week}</span>
                </div>
                <div style={{width:10,height:10,borderRadius:"50%",background:col,flexShrink:0,marginTop:4,boxShadow:"0 0 6px "+col}}/>
                <div style={{background:"rgba(255,255,255,0.03)",borderRadius:7,padding:"6px 12px",border:"1px solid "+C.border,flex:1}}>
                  <span style={{color:C.text,fontSize:12}}>{m.event}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DemoMissions(){
  const {oem,buildAllResultsCtx}=useContext(TeviCtx);
  const [activeM,setActiveM]=useState(null);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [summaryText,setSummaryText]=useState("");
  const pColors={DJI:"#4a9eff",Skydio:"#a78bfa","Sunflower Labs":"#fbbf24","Quantum Systems":"#34d399"};
  const generateDemoSummary=()=>{
    setLoading(true);setSummaryText("");setOpen(true);
    const allRes=buildAllResultsCtx();
    const prompt="You are a drone procurement analyst. Write a concise ONE-PAGE executive summary on demo readiness.\n\nPlatform: "+(oem.name||"Unknown")+" | Overall test results: "+allRes+"\nDemo missions: First on Scene, License Plate ID, Heat Signature, Eyes On, Crime Scene, The Perimeter.\n\nWrite:\n1. DEMO READINESS OVERVIEW\n2. PLATFORM STRENGTHS PER MISSION\n3. RISKS OR GAPS\n4. RECOMMENDATION — READY / NOT READY / CONDITIONAL\n\nUnder 350 words. Plain text only.";
    fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,messages:[{role:"user",content:prompt}]})})
      .then(async r=>{
        const data=await r.json().catch(()=>({}));
        if(!r.ok) throw new Error((data&&data.error)||("HTTP "+r.status));
        return data;
      })
      .then(data=>{
        const out=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");
        setSummaryText(out||buildLocalDemoSummary(oem,allRes));
        setLoading(false);
      })
      .catch(()=>{
        setSummaryText(buildLocalDemoSummary(oem,allRes));
        setLoading(false);
      });
  };
  return(
    <div style={{display:"grid",gap:14}}>
      <div style={{background:C.card,borderRadius:12,padding:20,border:"1px solid rgba(244,114,182,0.3)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}><div style={{width:3,height:20,borderRadius:2,background:"#f472b6"}}/><span style={{color:"#f472b6",fontWeight:700,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>Demo Mission Pack</span></div>
            <div style={{color:C.muted,fontSize:12,paddingLeft:13}}>6 missions · DJI · Skydio · Sunflower Labs · Quantum Systems</div>
          </div>
          <button onClick={generateDemoSummary} disabled={loading} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 20px",borderRadius:8,border:"1px solid rgba(134,239,172,0.5)",background:"rgba(20,83,45,0.4)",color:"#86efac",fontWeight:700,fontSize:13,cursor:loading?"not-allowed":"pointer",opacity:loading?0.6:1}}>{loading?"Generating...":"📋 Generate Executive Summary"}</button>
        </div>
      </div>
      {open&&(
        <div style={{background:C.card,borderRadius:12,padding:20,border:"1px solid rgba(134,239,172,0.4)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,paddingBottom:12,borderBottom:"1px solid rgba(134,239,172,0.2)"}}>
            <div style={{width:3,height:20,borderRadius:2,background:"#86efac"}}/>
            <span style={{color:"#86efac",fontWeight:700,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>Executive Summary — Demo Readiness</span>
            <button onClick={()=>setOpen(false)} style={{marginLeft:"auto",background:"rgba(127,29,29,0.3)",color:"#fca5a5",border:"1px solid rgba(252,165,165,0.3)",borderRadius:5,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>x</button>
          </div>
          {loading?<div style={{textAlign:"center",padding:"30px",color:C.muted,fontSize:13}}>Analyzing evaluation data...</div>:<div style={{color:C.text,fontSize:12,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{summaryText}</div>}
        </div>
      )}
      {DEMO_MISSIONS.map(m=>(
        <div key={m.id} style={{background:C.card,borderRadius:12,border:"1px solid "+(activeM===m.id?m.border:C.border),overflow:"hidden"}}>
          <button onClick={()=>setActiveM(activeM===m.id?null:m.id)} style={{width:"100%",background:"transparent",border:"none",cursor:"pointer",padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",textAlign:"left"}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{background:m.bg,border:"1px solid "+m.border,borderRadius:8,padding:"8px 14px",textAlign:"center",minWidth:70}}><div style={{fontSize:20}}>{m.icon}</div><div style={{color:m.color,fontWeight:900,fontSize:11,marginTop:2}}>M-{m.num}</div></div>
              <div><div style={{color:"#fff",fontWeight:800,fontSize:15}}>{m.title}</div><div style={{color:m.color,fontSize:12,marginTop:2,fontWeight:600}}>{m.capability}</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>{m.platforms}</div></div>
            </div>
            <span style={{color:m.color,fontSize:18,fontWeight:700,flexShrink:0}}>{activeM===m.id?"▲":"▼"}</span>
          </button>
          {activeM===m.id&&(
            <div style={{padding:"0 20px 20px",borderTop:"1px solid "+C.border}}>
              <div style={{marginTop:16,padding:"10px 14px",borderRadius:8,background:m.bg,border:"1px solid "+m.border}}><div style={{color:m.color,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Scenario</div><div style={{color:C.text,fontSize:13,lineHeight:1.6}}>{m.scenario}</div></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:14}}>
                <div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"14px 16px",border:"1px solid "+C.border}}>
                  <div style={{color:C.accent,fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Demo Flow</div>
                  {m.flow.map((step,i)=>(
                    <div key={i} style={{display:"flex",gap:10,marginBottom:10,alignItems:"flex-start"}}>
                      <span style={{background:m.bg,color:m.color,border:"1px solid "+m.border,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:800,flexShrink:0,whiteSpace:"nowrap"}}>{step.t}</span>
                      <span style={{color:C.muted,fontSize:12,lineHeight:1.5}}>{step.step}</span>
                    </div>
                  ))}
                </div>
                <div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"14px 16px",border:"1px solid "+C.border}}>
                  <div style={{color:C.accent,fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Key Talking Points</div>
                  {m.talking.map((pt,i)=>(
                    <div key={i} style={{display:"flex",gap:8,marginBottom:10,alignItems:"flex-start"}}>
                      <span style={{color:m.color,fontWeight:700,fontSize:14,flexShrink:0,lineHeight:1.4}}>✓</span>
                      <span style={{color:C.muted,fontSize:12,lineHeight:1.5}}>{pt}</span>
                    </div>
                  ))}
                </div>
              </div>
              {m.platformNotes&&(
                <div style={{marginTop:14,background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"14px 16px",border:"1px solid "+C.border}}>
                  <div style={{color:C.accent,fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Platform Assignments</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {m.platformNotes.map(pn=>{const pc=pColors[pn.name]||C.accent;return(<div key={pn.name} style={{padding:"10px 12px",borderRadius:7,background:pc+"18",border:"1px solid "+pc+"44"}}><div style={{color:pc,fontWeight:700,fontSize:11,marginBottom:4}}>{pn.name}</div><div style={{color:C.muted,fontSize:11,lineHeight:1.5}}>{pn.note}</div></div>);})}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TestResults(){
  const {state}=useContext(TeviCtx);
  const [filterSection,setFilterSection]=useState("All");
  const [filterVendor,setFilterVendor]=useState("All");
  const [expandedRun,setExpandedRun]=useState(null);
  const allSections=Object.keys(TESTS);
  const allVendorNames=state.oems.map(o=>o.name||"Unknown");
  const allRuns=[];
  state.oems.forEach(o=>{
    allSections.forEach(sec=>{
      const secTests=TESTS[sec]||[];
      const hasData=secTests.some(t=>o.results[t.id+"_pfn"]);
      if(hasData){
        const pass=secTests.filter(t=>o.results[t.id+"_pfn"]==="Pass").length;
        const fail=secTests.filter(t=>o.results[t.id+"_pfn"]==="Fail").length;
        const pending=secTests.filter(t=>!o.results[t.id+"_pfn"]).length;
        const date=secTests.map(t=>o.notes[t.id+"_date"]||"").filter(Boolean)[0]||"";
        allRuns.push({runId:o.name+"-"+sec+"-main",vendor:o.name||"Unknown",section:sec,label:"Session 1",date,evaluator:o.evaluator||"",pass,fail,pending,total:secTests.length,tests:secTests,results:o.results,notes:o.notes});
      }
    });
    (o.testRuns||[]).forEach((run,ri)=>{
      const sec=run.section||"";const secTests=TESTS[sec]||[];
      const pass=secTests.filter(t=>run.results[t.id+"_pfn"]==="Pass").length;
      const fail=secTests.filter(t=>run.results[t.id+"_pfn"]==="Fail").length;
      const pending=secTests.filter(t=>!run.results[t.id+"_pfn"]).length;
      allRuns.push({runId:run.id,vendor:run.vendor||o.name||"Unknown",section:sec,label:run.label||"Run "+(ri+2),date:run.date||"",evaluator:run.evaluator||"",pass,fail,pending,total:secTests.length,tests:secTests,results:run.results,notes:run.notes||{}});
    });
  });
  const filtered=allRuns.filter(r=>(filterSection==="All"||r.section===filterSection)&&(filterVendor==="All"||r.vendor===filterVendor));
  filtered.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const statusColor=r=>r.fail>0?"#fca5a5":r.pending===r.total?"#888":r.pending>0?"#fde68a":"#86efac";
  const statusBg=r=>r.fail>0?"rgba(127,29,29,0.5)":r.pending===r.total?"rgba(255,255,255,0.05)":r.pending>0?"rgba(120,53,15,0.5)":"rgba(20,83,45,0.5)";
  const statusLabel=r=>r.fail>0?"FAIL":r.pending===r.total?"PENDING":r.pending>0?"IN PROGRESS":"PASS";
  return(
    <div style={{display:"grid",gap:14}}>
      <div style={{background:C.card,borderRadius:12,padding:20,border:"1px solid rgba(251,146,60,0.3)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,paddingBottom:12,borderBottom:"1px solid rgba(251,146,60,0.2)"}}>
          <div style={{width:3,height:20,borderRadius:2,background:"#fb923c"}}/>
          <span style={{color:"#fb923c",fontWeight:700,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>Test Results Log</span>
          <span style={{marginLeft:"auto",fontSize:12,color:C.muted}}>{filtered.length} run{filtered.length!==1?"s":""} shown</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
          {[["Total Runs",allRuns.length,"#fb923c"],["Passing",allRuns.filter(r=>r.fail===0&&r.pending<r.total).length,"#86efac"],["Has Failures",allRuns.filter(r=>r.fail>0).length,"#fca5a5"],["Pending",allRuns.filter(r=>r.pending===r.total).length,"#888"]].map(([label,val,col])=>(
            <div key={label} style={{background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"10px 14px",textAlign:"center",border:"1px solid "+C.border}}>
              <div style={{fontSize:22,fontWeight:900,color:col}}>{val}</div>
              <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",marginTop:2}}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase"}}>Filter:</span>
          <select value={filterSection} onChange={e=>setFilterSection(e.target.value)} style={{...inp,width:"auto",fontSize:12}}><option value="All">All Sections</option>{allSections.map(s=><option key={s}>{s}</option>)}</select>
          <select value={filterVendor} onChange={e=>setFilterVendor(e.target.value)} style={{...inp,width:"auto",fontSize:12}}><option value="All">All Vendors</option>{allVendorNames.map(v=><option key={v}>{v}</option>)}</select>
          {(filterSection!=="All"||filterVendor!=="All")&&<button onClick={()=>{setFilterSection("All");setFilterVendor("All");}} style={{background:"rgba(127,29,29,0.3)",color:"#fca5a5",border:"1px solid rgba(252,165,165,0.3)",borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>Clear Filters</button>}
        </div>
      </div>
      {filtered.length===0&&<div style={{textAlign:"center",padding:"50px 20px",background:C.card,borderRadius:12,border:"1px dashed "+C.border,color:C.faint}}>No test runs logged yet.</div>}
      {filtered.map(r=>{
        const key=r.runId;const isOpen=expandedRun===key;
        const tcKey=r.section==="Flight Performance"?"Drone":r.section==="Dock Integration"?"Dock":r.section==="Sensors & Payload"?"Sensors":r.section==="Operations & Reliability"?"Reliability":"Use Cases";
        const tc=TAB_COLORS[tcKey]||TAB_COLORS["Drone"];
        return(
          <div key={key} style={{background:C.card,borderRadius:12,border:"1px solid "+(isOpen?tc.border:C.border),overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",cursor:"pointer"}} onClick={()=>setExpandedRun(isOpen?null:key)}>
              <span style={{background:tc.active,color:tc.color,border:"1px solid "+tc.border,borderRadius:5,padding:"2px 8px",fontSize:10,fontWeight:800,whiteSpace:"nowrap"}}>{r.section}</span>
              <span style={{color:"#fff",fontWeight:700,fontSize:13}}>{r.vendor}</span>
              <span style={{color:C.muted,fontSize:12}}>{r.label}</span>
              <div style={{flex:1,display:"flex",gap:12,justifyContent:"center"}}>
                <span style={{color:C.muted,fontSize:11}}>📅 {r.date||"—"}</span>
                <span style={{color:C.muted,fontSize:11}}>👤 {r.evaluator||"—"}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{display:"flex",gap:6,fontSize:11}}><span style={{color:"#86efac",fontWeight:700}}>{r.pass}P</span><span style={{color:"#fca5a5",fontWeight:700}}>{r.fail}F</span><span style={{color:C.muted}}>{r.pending}?</span></div>
                <span style={{background:statusBg(r),color:statusColor(r),border:"1px solid "+statusColor(r),borderRadius:5,padding:"2px 9px",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>{statusLabel(r)}</span>
              </div>
              <span style={{color:C.muted,fontSize:14}}>{isOpen?"▲":"▼"}</span>
            </div>
            {isOpen&&(
              <div style={{padding:"0 16px 16px",borderTop:"1px solid "+C.border}}>
                <div style={{overflowX:"auto",marginTop:12}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr style={{borderBottom:"1px solid "+tc.border,background:tc.active}}>{["Test","Min. Standard","Result","Tester","Date","Notes"].map(h=><th key={h} style={{padding:"7px 10px",textAlign:"left",color:tc.color,fontWeight:700,fontSize:11,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                    <tbody>{(r.tests||[]).map((t,i)=>{
                      const res=r.results[t.id+"_pfn"]||"";
                      return(<tr key={t.id} style={{borderBottom:"1px solid rgba(255,255,255,0.04)",background:i%2===0?"transparent":"rgba(255,255,255,0.02)"}}>
                        <td style={{padding:"6px 10px",color:C.text}}>{t.test}</td>
                        <td style={{padding:"6px 10px",color:C.muted,fontSize:11}}>{t.standard}</td>
                        <td style={{padding:"6px 8px"}}>{res?<span style={{background:pfBg(res),color:pfColor(res),border:"1px solid "+pfBrd(res),borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:700}}>{res}</span>:<span style={{color:C.faint,fontSize:11}}>—</span>}</td>
                        <td style={{padding:"6px 10px",color:C.muted,fontSize:11}}>{r.notes[t.id+"_tester"]||"—"}</td>
                        <td style={{padding:"6px 10px",color:C.muted,fontSize:11,whiteSpace:"nowrap"}}>{r.notes[t.id+"_date"]||"—"}</td>
                        <td style={{padding:"6px 10px",color:C.muted,fontSize:11}}>{r.notes[t.id]||"—"}</td>
                      </tr>);
                    })}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function DroneTeviApp(){
  // Initial state: localStorage first (instant render), backend hydrates after.
  const [state,dispatch]=useReducer(reducer,undefined,()=>{
    const saved=loadTeviSaved();
    if(isValidTeviState(saved)) return saved;
    return {oems:[mkOEM("DJI"),mkOEM("SKYDIO"),mkOEM("Sunflower"),mkOEM("Quantum Systems")],activeOEM:0};
  });
  const [tab,setTab]=useState("Overview");
  const [addingOEM,setAddingOEM]=useState(false);
  const [newName,setNewName]=useState("");
  const [saveStatus,setSaveStatus]=useState(null); // 'saving' | 'saved' | 'error' | null
  const [dirty,setDirty]=useState(false);
  const [hydrated,setHydrated]=useState(false);
  const oem=state.oems[state.activeOEM];

  // On mount, hydrate from backend (single shared team-wide snapshot).
  // If the backend has data, it wins over the localStorage seed.
  useEffect(()=>{
    let cancelled=false;
    api.droneTevi.get()
      .then(res=>{
        if(cancelled) return;
        if(isValidTeviState(res?.state)){
          dispatch({type:"REPLACE_STATE",state:res.state});
          // Mirror into localStorage so the instant-load path agrees next visit.
          saveTeviSnapshotLocal(res.state);
        }
      })
      .catch(()=>{/* offline / first run — keep localStorage seed */})
      .finally(()=>{ if(!cancelled){ setHydrated(true); setDirty(false); } });
    return ()=>{ cancelled=true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Mark dirty whenever the reducer state changes after hydration.
  useEffect(()=>{
    if(hydrated) setDirty(true);
  },[state, hydrated]);

  async function handleSave(){
    setSaveStatus('saving');
    // 1. Instant local writeback so a refresh survives even if backend is slow/down.
    saveTeviSnapshotLocal(state);
    // 2. Push to backend so the rest of the team sees the same snapshot.
    try {
      await api.droneTevi.save(state);
      setSaveStatus('saved');
      setDirty(false);
      setTimeout(()=>setSaveStatus(s=>s==='saved'?null:s),2500);
    } catch {
      setSaveStatus('error');
      setTimeout(()=>setSaveStatus(s=>s==='error'?null:s),3500);
    }
  }

  // Per-section context: one line per test with result + standard +
  // tester + date. Per-test notes are intentionally NOT duplicated here
  // — they're already dumped (verbatim) via the notesDump in the
  // ExecSummaryBtn prompt, so including them in both places blew the
  // 50K-char backend cap on prompts and silently kicked the user into
  // the local fallback.
  const buildTestCtx=sectionKey=>{
    const lines=["Tests for "+sectionKey+":"];
    (TESTS[sectionKey]||[]).forEach(t=>{
      const result=oem.results[t.id+"_pfn"]||"Pending";
      const tester=oem.notes[t.id+"_tester"]||"";
      const date=oem.notes[t.id+"_date"]||"";
      lines.push("- "+t.test+": "+result
        +" | Standard: "+(t.standard||"-")
        +(tester?" | Tester: "+tester:"")
        +(date?" | Date: "+date:""));
    });
    return lines.join("\n");
  };
  const buildAllResultsCtx=()=>Object.keys(TESTS).map(sec=>{const r=(TESTS[sec]||[]).map(t=>oem.results[t.id+"_pfn"]).filter(Boolean);return sec+": "+r.filter(v=>v==="Pass").length+"P/"+r.filter(v=>v==="Fail").length+"F";}).join(", ");

  const droneCtx=buildTestCtx("Flight Performance");
  const dockCtx=buildTestCtx("Dock Integration");
  const sensorsCtx=buildTestCtx("Sensors & Payload");
  const reliabilityCtx=buildTestCtx("Operations & Reliability");
  const leCtx=buildTestCtx("Law Enforcement");
  const csCtx=buildTestCtx("Campus Security");
  const ciCtx=buildTestCtx("Critical Infrastructure");
  const useCasesCtx="LE: "+leCtx+" | Campus: "+csCtx+" | CIP: "+ciCtx;
  const procDecision=(oem.procurement&&oem.procurement.decision)||"None";
  const procConditions=(oem.procurement&&oem.procurement.conditions)||"None";
  // Final Evaluation section's own data is the procurement decision + the
  // sign-offs recorded for it — NOT the cross-section test results.
  const signoffSummary=((oem.signoffs||[]).filter(s=>s&&s.signature&&s.name).map(s=>s.name+" ("+s.role+")").join(", "))||"none recorded";
  const finalCtx="Decision: "+procDecision+" | Conditions: "+procConditions+" | Sign-offs: "+signoffSummary;
  const wkCtx=Array.from({length:16},(_,i)=>i+1).map(w=>{const done=WEEKLY_ITEMS.filter(item=>oem.weeklyChecks[w+"_"+item]).length;return "Wk"+w+":"+done+"/"+WEEKLY_ITEMS.length;}).join(", ");
  const pt=oem.payloadTests||{};
  const payloadCtx="Selected: "+Object.keys(pt).filter(k=>pt[k].selected).map(k=>k+": "+(pt[k].result||"Pending")).join(", ")||"None selected";
  // Overview is the ONLY section whose summary pulls all sections together.
  // Every other section's summary uses only its own data.
  // Resolve the active site here (sub-components have their own activeSite
  // variable scoped to themselves — the main component needs its own).
  const mainActiveSite=OPSITES.find(s=>s.key===(oem.activeSite||"site_TRG"))||OPSITES[0];
  // Pull the matrix entries for the active OEM column so the Overview
  // summary reflects everything entered on the Compare tab too.
  const matrixData=(state.oems[0]&&state.oems[0].matrix)||{};
  const matrixForActive=[];
  EVAL_MATRIX.forEach(cat=>{
    cat.rows.forEach(row=>{
      const v=matrixData[cat.id+"_"+row.id+"_"+state.activeOEM];
      if(v) matrixForActive.push(cat.label+" / "+row.label+": "+v);
    });
  });
  const matrixDump=matrixForActive.length>0
    ? "\n\nCOMPARE-MATRIX VALUES FOR THIS PLATFORM:\n"+matrixForActive.map(l=>"- "+l).join("\n")
    : "";
  const overviewCtx=
    "Platform: "+(oem.name||"Unknown")+
    " | Manufacturer: "+(oem.manufacturer||"N/A")+
    " | Model: "+(oem.model||"N/A")+
    " | Evaluator: "+(oem.evaluator||"N/A")+
    " | Start Date: "+(oem.startDate||"N/A")+
    " | Site: "+mainActiveSite.label+
    " | OEM Specs URL: "+(oem.specsUrl||"Not provided")+
    " | Procurement: "+procDecision+
    " | Conditions: "+procConditions+
    " | Aggregate results: "+buildAllResultsCtx()+
    "\n\nFLIGHT PERFORMANCE — full detail:\n"+droneCtx+
    "\n\nDOCK INTEGRATION — full detail:\n"+dockCtx+
    "\n\nSENSORS & PAYLOAD — full detail:\n"+sensorsCtx+
    "\n\nOPERATIONS & RELIABILITY — full detail:\n"+reliabilityCtx+
    "\n\nUSE CASES — full detail:\n"+useCasesCtx+
    "\n\nWEEKLY CHECKS:\n"+wkCtx+
    "\n\nPAYLOAD CONFIGURATION:\n"+payloadCtx+
    "\n\nFINAL EVALUATION & SIGN-OFF: "+finalCtx+
    matrixDump;

  function renderActiveTab(){
    switch(tab){
      case "Overview":
        return(<div><ExecSummaryBtn sectionName="Platform Overview (Comprehensive)" contextData={overviewCtx}/><div style={{marginTop:16}}><OverviewPanel/></div></div>);
      case "Drone":
        return(<div><ExecSummaryBtn sectionName="Drone / Flight Performance" contextData={droneCtx}/><div style={{marginTop:16}}><InlineWeather sectionKey="Flight Performance"/><SecTable sKey="Flight Performance"/></div><SectionSignOff sectionName="Drone"/></div>);
      case "Dock":
        return(<div><ExecSummaryBtn sectionName="Dock Integration" contextData={dockCtx}/><div style={{marginTop:16}}><InlineWeather sectionKey="Dock Integration"/><SecTable sKey="Dock Integration"/></div><SectionSignOff sectionName="Dock"/></div>);
      case "Sensors":
        return(<div><ExecSummaryBtn sectionName="Sensors and Payload" contextData={sensorsCtx}/><div style={{marginTop:16}}><InlineWeather sectionKey="Sensors & Payload"/><SecTable sKey="Sensors & Payload"/></div><SectionSignOff sectionName="Sensors"/></div>);
      case "Payload":
        return(<div><ExecSummaryBtn sectionName="Payload Compatibility" contextData={payloadCtx}/><div style={{marginTop:16}}><InlineWeather sectionKey="Payload"/><PayloadOptions/></div><SectionSignOff sectionName="Payload"/></div>);
      case "Reliability":
        return(<div><ExecSummaryBtn sectionName="Operations and Reliability" contextData={reliabilityCtx}/><div style={{marginTop:16}}><InlineWeather sectionKey="Operations & Reliability"/><SecTable sKey="Operations & Reliability"/></div><SectionSignOff sectionName="Reliability"/></div>);
      case "Use Cases":
        return(<div><ExecSummaryBtn sectionName="Use Cases" contextData={useCasesCtx}/><div style={{marginTop:16}}><UseCasesPanel/></div><SectionSignOff sectionName="Use Cases"/></div>);
      case "Test Results":
        return(<div><ExecSummaryBtn sectionName="Test Results Log" contextData={buildAllResultsCtx()}/><div style={{marginTop:16}}><TestResults/></div></div>);
      case "Chief Pilot Final Eval & Sign-Off":
        return(<div><ExecSummaryBtn sectionName="Final Evaluation" contextData={finalCtx}/><div style={{marginTop:16}}><FinalEvalSignOff/></div></div>);
      case "Evaluation Checklist":
        return(<div><ExecSummaryBtn sectionName="Combined Evaluation Checklist" contextData={"5 sections: Subjective, Comparative, FMEA, Environmental, Benchmarks. Vendors: "+state.oems.map(o=>o.name||"Unknown").join(", ")}/><div style={{marginTop:16}}><EvaluationChecklist/></div></div>);
      case "Compare":
        // Compare section's own data is the vendor list + each vendor's
        // procurement decision (which is the comparison-relevant field
        // shown in this section). Cross-section test results are
        // available in Overview's comprehensive summary, not here.
        return(<div><ExecSummaryBtn sectionName="Vendor Comparison Matrix" contextData={"Vendors under evaluation: "+state.oems.map(o=>(o.name||"Unknown")+" (decision: "+((o.procurement&&o.procurement.decision)||"None")+")").join(", ")}/><div style={{marginTop:16}}><VendorMatrix/></div></div>);
      case "Weekly Checks":
        return(<div><ExecSummaryBtn sectionName="Weekly Inspection Compliance" contextData={wkCtx}/><div style={{marginTop:16}}><WeeklyChecks/></div><SectionSignOff sectionName="Weekly Checks"/></div>);
      case "6-Month Plan":
        return(<SixMonthPlan/>);
      case "Demo Missions":
        return(<DemoMissions/>);
      default:
        return(<div><ExecSummaryBtn sectionName="Platform Overview (Comprehensive)" contextData={overviewCtx}/><div style={{marginTop:16}}><OverviewPanel/></div></div>);
    }
  }

  return(
    <TeviCtx.Provider value={{oem,dispatch,state,buildAllResultsCtx}}>
      <div style={{background:"#000",minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",color:C.text}}>
        <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none",background:"radial-gradient(ellipse 90% 55% at 25% 75%,rgba(170,170,170,0.11) 0%,transparent 55%),radial-gradient(ellipse 65% 45% at 72% 35%,rgba(140,140,140,0.09) 0%,transparent 50%)"}}/>
        <div style={{position:"relative",zIndex:1}}>
          <div style={{background:"rgba(0,0,0,0.82)",backdropFilter:"blur(16px)",borderBottom:"1px solid "+C.border,padding:"13px 24px",display:"flex",alignItems:"center",gap:16}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{background:"rgba(204,34,0,0.15)",border:"1px solid rgba(204,34,0,0.35)",borderRadius:8,padding:"6px 10px",fontSize:18}}>🚁</div>
              <div><div style={{fontSize:16,fontWeight:800,color:"#fff",letterSpacing:2}}>DRONE TEVI PLATFORM</div><div style={{fontSize:10,color:C.muted,letterSpacing:2}}>TESTING · EVALUATION · VALIDATION · IMPLEMENTATION</div></div>
            </div>
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
              {saveStatus==='saved'&&<span style={{fontSize:10,color:"#6ee7b7",letterSpacing:1,fontWeight:600}}>✓ SAVED</span>}
              {saveStatus==='saving'&&<span style={{fontSize:10,color:C.muted,letterSpacing:1}}>SAVING…</span>}
              {saveStatus==='error'&&<span style={{fontSize:10,color:"#ff6b4a",letterSpacing:1,fontWeight:600}}>SAVE FAILED</span>}
              {!saveStatus&&dirty&&<span style={{fontSize:10,color:"#fbbf24",letterSpacing:1}}>UNSAVED CHANGES</span>}
              <button
                onClick={handleSave}
                disabled={saveStatus==='saving'}
                style={{
                  padding:"8px 18px",
                  background:dirty?"linear-gradient(135deg,#E53935,#C62828)":"rgba(255,255,255,0.08)",
                  color:"#fff",border:"none",borderRadius:6,
                  fontSize:11,fontWeight:800,letterSpacing:2,
                  cursor:saveStatus==='saving'?"wait":"pointer",
                  opacity:saveStatus==='saving'?0.6:1,
                }}
              >
                SAVE
              </button>
            </div>
          </div>
          <div style={{background:"rgba(0,0,0,0.75)",backdropFilter:"blur(12px)",borderBottom:"1px solid "+C.border,padding:"0 24px",display:"flex",alignItems:"center",gap:4,overflowX:"auto"}}>
            {state.oems.map((o,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:3}}>
                <button onClick={()=>{dispatch({type:"SET_ACTIVE",idx:i});if(tab==="Compare")setTab("Overview");}}
                  style={{padding:"10px 18px",background:"transparent",color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,borderBottom:state.activeOEM===i&&tab!=="Compare"?"2px solid #fff":"2px solid transparent",whiteSpace:"nowrap",opacity:state.activeOEM===i&&tab!=="Compare"?1:0.55}}>
                  {o.name||"Vendor "+(i+1)}
                </button>
                {state.oems.length>1&&<button onClick={()=>{if(window.confirm("Remove "+o.name+"?"))dispatch({type:"DEL_OEM",idx:i});}} style={{background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:12,padding:"2px 4px"}}>x</button>}
              </div>
            ))}
            <button onClick={()=>setTab("Compare")} style={{padding:"10px 16px",background:"transparent",color:"#fff",border:"none",borderBottom:tab==="Compare"?"2px solid #fff":"2px solid transparent",cursor:"pointer",fontSize:13,fontWeight:700,whiteSpace:"nowrap",opacity:tab==="Compare"?1:0.55}}>Compare</button>
            {addingOEM?(
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0"}}>
                <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&newName.trim()){dispatch({type:"ADD_OEM",name:newName.trim()});setNewName("");setAddingOEM(false);}if(e.key==="Escape"){setAddingOEM(false);setNewName("");}}} style={{...inp,width:130,border:"1px solid "+C.accent}} placeholder="Vendor name"/>
                <button onClick={()=>{if(newName.trim()){dispatch({type:"ADD_OEM",name:newName.trim()});setNewName("");setAddingOEM(false);}}} style={{background:"rgba(200,200,200,0.15)",color:C.text,border:"1px solid "+C.border,borderRadius:5,padding:"5px 10px",cursor:"pointer",fontSize:13}}>Add</button>
              </div>
            ):(
              <button onClick={()=>setAddingOEM(true)} style={{padding:"8px 14px",background:"transparent",color:C.muted,border:"1px dashed "+C.faint,borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700,marginLeft:4,whiteSpace:"nowrap"}}>+ Add Vendor</button>
            )}
          </div>
          <div style={{background:"rgba(0,0,0,0.6)",backdropFilter:"blur(8px)",borderBottom:"1px solid "+C.border,padding:"0 24px",display:"flex",overflowX:"auto"}}>
            {TABS.map(t=>{
              const tc=TAB_COLORS[t]||{color:"#fff",active:"rgba(255,255,255,0.1)",border:"rgba(255,255,255,0.3)"};
              const active=tab===t;
              return(<button key={t} onClick={()=>setTab(t)} style={{padding:"9px 14px",background:active?tc.active:"transparent",color:active?tc.color:"#fff",border:"none",borderBottom:active?"2px solid "+tc.color:"2px solid transparent",borderRadius:active?"6px 6px 0 0":"0",cursor:"pointer",fontSize:12,fontWeight:active?700:400,whiteSpace:"nowrap",opacity:active?1:0.5,transition:"all 0.15s"}}>{t}</button>);
            })}
          </div>
          <div style={{padding:"20px 24px",maxWidth:1400,margin:"0 auto"}}>
            {renderActiveTab()}
          </div>
        </div>
      </div>
    </TeviCtx.Provider>
  );
}
