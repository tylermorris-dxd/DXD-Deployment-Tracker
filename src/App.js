import React, { useState, useEffect, useCallback, useRef } from "react";
import AirspaceIntel from "./AirspaceIntel";
import SiteMapper from "./SiteMapper";

// ─── BRAND ASSETS ─────────────────────────────────────────────────────────
// Place your images in public/images/:
//   bg.jpg   = brain neural network background (first reference photo)
//   logo.png = Deus X winged shield logo (second reference photo)
// The app will use these if present, otherwise falls back to defaults.
const BG_IMAGE = "/images/bg.jpg";
const LOGO_IMAGE = "/images/logo.png";

// ─── TEMPLATE DATA ────────────────────────────────────────────────────────
const DEPLOYMENT_TEMPLATE = [
  {
    id: "phase-1",
    phase: "Phase 1",
    title: "Scoping & Solutions",
    color: "#EF4444",
    owner: "",
    description: "Define customer needs, assess property, and architect the security solution.",
    tasks: [
      { id: "1-1", title: "Customer Problem & Outcome Definition", subtasks: [
        "Clarify customer's problem statement and desired security outcome",
        "Confirm customer success criteria and acceptance criteria",
        "Discuss lead times on hardware/software with sales lead for contractual timelines"
      ]},
      { id: "1-2", title: "Site Assessment & Security Analysis", subtasks: [
        "Assess key site characteristics (size, scope, perimeter, area, boundaries)",
        "Identify security gaps and existing risks",
        "Evaluate airspace considerations (Class G vs. Controlled Airspace)",
        "Document weather considerations for flight operations",
        "Assess power availability and connectivity options at deployment sites",
        "Identify site layout, infrastructure, and environmental hazards (towers, buildings, trees)",
        "Confirm client will provide: power (110V acceptable), network (40 Mbps minimum), Ethernet connection"
      ]},
      { id: "1-3", title: "Airspace & Regulatory Evaluation", gate: true, subtasks: [
        "Conduct airspace evaluation and determine approval pathway",
        "Class G Airspace = Proceed to operations planning",
        "Controlled Airspace = Initiate FAA Site Approval request (expect 30-day processing)",
        "Document approved altitude limits from site approval",
        "Discuss regulatory lead times and FAA waiver status with client"
      ]},
      { id: "1-4", title: "Drone & Equipment Selection", gate: true, equipmentPicker: true, subtasks: [] },
      { id: "1-5", title: "Coverage Architecture & SLA Definition", subtasks: [
        "Define coverage model (Centralized, De-Centralized, Hybrid, Static, Dynamic)",
        "Determine dock placement locations and response time projections",
        "Document coverage zones and flight characteristics (altitude, noise, visual profile)",
        "Define discretion/deterrence approach",
        "Establish Response Time SLAs",
        "Set System Uptime and Availability Targets",
        "Document Redundancy Requirements",
        "Define Support Escalation & Incident Management procedures",
        "Establish Maintenance Windows"
      ]},
      { id: "1-6", title: "Integration & Regulatory Scope", subtasks: [
        "Identify connectivity requirements to existing security systems",
        "Plan integration with local police departments and emergency services",
        "Establish FAA waiver status and airspace authorization pathway",
        "Define data security, privacy controls, and retention policies",
        "Clarify liability and insurance coverage responsibilities",
        "Document compliance/regulatory requirements specific to client site"
      ]},
      { id: "1-7", title: "Proposal & Solution Documentation", subtasks: [
        "Develop Proposed Solution and Coverage Architecture",
        "Create Proposal Options/Bundles for client review",
        "Document Equipment Stack specifications",
        "Define Performance Commitments and Service Level Agreements (SLAs)",
        "Include security and non-security use cases",
        "Document surge coverage options for special events",
        "Outline future expansion options",
        "Provide case studies and proof of performance examples",
        "Include Cost/ROI/Cost-Benefit Analysis",
        "Create high-level implementation timeline",
        "Document customer responsibilities and acceptance criteria"
      ]},
      { id: "1-8", title: "Contract & Resource Planning", gate: true, subtasks: [
        "Review contract and SOW for completeness and mission set",
        "Resolve any discrepancies and request clarification",
        "Validate deployment details and confirm resource readiness",
        "Confirm SOC capacity for the project",
        "If SOC capacity is limited \u2014 Tempe GSOC: Contact Jeff Ventrella",
        "If SOC capacity is limited \u2014 Dallas RSOC: Contact Tyler Morris or James Nguyen",
        "Schedule project planning and sync meeting with all DXD parties involved",
        "Identify customer stakeholders and Points of Contact (POCs)",
        "Schedule check-in meetings with stakeholders during project lifecycle"
      ]}
    ]
  },
  {
    id: "phase-2",
    phase: "Phase 2",
    title: "Delivery",
    color: "#F87171",
    owner: "",
    description: "Procure all hardware, software, and supporting equipment; prepare for site installation.",
    tasks: [
      { id: "2-1", title: "Hardware Procurement", trackDates: true, subtasks: [
        "DJI Dock 3 w/ Matrice 4TD \u2192 Genpac (Jon Beal)",
        "AVSS Parachute Recovery Systems \u2192 Genpac (Jon Beal)",
        "DJI Spotlights (AL1) \u2192 Genpac (Jon Beal)",
        "DJI Speakers (AS1) \u2192 Genpac (Jon Beal)",
        "Sunflower Labs BeeHive w/ Thermal Payload \u2192 Kenton Matthaei (Sunflower)",
        "Skydio X10 Dock with X10 Drone \u2192 Tyler Bayne (Skydio/Post-Sales)",
        "Casia G (DAA) \u2192 Uavionix",
        "DroneTag (DAA) \u2192 Genpac (Jon Beal)",
        "Axis P3275-LVE Dome Camera (required by FAA waiver)",
        "CCTV camera pole/mount",
        "DJI D-RTK 3 Relay Fixed Deployment units",
        "DJI Matrice 4D Series batteries",
        "Annual Class 2 Dock Licenses",
        "ProCare Maintenance subscriptions",
        "Casia G-as-a-Service licenses (if applicable)",
        "Alpha Z Licenses for advanced analytics"
      ]},
      { id: "2-2", title: "Shipping & Logistics", subtasks: [
        "Coordinate shipping method with each vendor to project site",
        "Confirm shipping address and primary contact for delivery",
        "Schedule delivery coordination and confirm ETAs with Site POC",
        "Confirm client will accept delivery and store hardware securely",
        "Create equipment receiving checklist to validate completeness",
        "Establish inventory tracking with serial numbers and warranties"
      ]},
      { id: "2-3", title: "Site Survey & Infrastructure Assessment", gate: true, subtasks: [
        "Conduct Initial Site Visit to understand deployment needs",
        "Perform Location Mapping for dock placement and availability assessment",
        "Identify environmental and structural hazards",
        "Customer provides: Power to Dock (110V acceptable)",
        "Customer provides: Network to Dock (Ethernet, min 40 Mbps, Starlink acceptable)",
        "Confirm dock securing method (concrete pads, pavers, or platform)",
        "Confirm pole/tower requirements for DAA equipment",
        "Confirm customer completed all required infrastructure setup",
        "Create Site Survey Document (required by FAA waiver)"
      ]},
      { id: "2-4", title: "Installation Planning & Coordination", subtasks: [
        "Schedule Hardware Installation Coordination",
        "DJI Dock: DroneSense ($8,000) or DXD (if trained)",
        "Sunflower BeeHive: Sunflower Labs installs",
        "Skydio: Confirm installation provider",
        "Casia G: Uavionix installs",
        "DroneTag: DXD installs",
        "Schedule all dock installations and training",
        "Schedule Casia G Installation and training",
        "Establish field maintenance program for drone assets"
      ]},
      { id: "2-5", title: "Perimeter Security & Compliance", gate: true, subtasks: [
        "Install CCTV cameras at dock sites (required by FAA waiver)",
        "Install 'Monitored by Deus X Defense Drones' signage (required by FAA waiver)",
        "Verify all safety and compliance markings are in place"
      ]}
    ]
  },
  {
    id: "phase-3",
    phase: "Phase 3",
    title: "Execution",
    color: "#DC2626",
    owner: "",
    description: "Configure systems, conduct testing, and transition to live operations.",
    tasks: [
      { id: "3-1", title: "Command & Control (C2) System Setup", subtasks: [
        "Draw automated patrol paths into C2 system",
        "Verify patrol points align with customer requirements",
        "Configure routine patrol times and schedules",
        "Set Up Custom Reporting for customer dashboard",
        "Add new users to customer dashboard for live monitoring",
        "Set up distribution lists for report delivery",
        "Configure piloting schedules in Belfry \u2014 Tempe GSOC: Jeff Ventrella",
        "Configure piloting schedules in Belfry \u2014 Dallas RSOC: Tyler Morris or James Nguyen"
      ]},
      { id: "3-2", title: "Integration Testing & Validation", subtasks: [
        "Conduct Real-World Application flight tests",
        "Execute Fail-Safe Testing (power/internet loss simulation)",
        "Verify drone reroutes and lands at Alternate Landing Site",
        "Verify end-to-end data flow to command center and customer systems",
        "Test alarm routing and customer notification workflows",
        "Validate all integration points with customer's security systems"
      ]},
      { id: "3-3", title: "Customer Walkthrough & Documentation", subtasks: [
        "Demonstrate automated drone deployment and launch sequence",
        "Show live video feed from drone(s)",
        "Walk through dashboard reporting and analytics",
        "Review response protocols and escalation procedures",
        "Provide customer with weekly inspection checklist (required by FAA waiver)",
        "Document inspection and maintenance requirements",
        "Deliver Service Documentation (SOPs, protocols, response times, procedures)"
      ]},
      { id: "3-4", title: "Safety & Compliance Validation", subtasks: [
        "Conduct cybersecurity readiness review (all hardware/software)",
        "Verify compliance with all FAA waiver requirements",
        "Confirm all safety documentation is current and accessible",
        "Validate operator training completion and certifications",
        "Complete final cross-functional review of all operational requirements"
      ]},
      { id: "3-5", title: "Adjustments & Final Sign-Off", gate: true, subtasks: [
        "Make Final Revisions based on testing feedback",
        "Obtain formal customer sign-off and acceptance",
        "Conduct after-action review for process improvements",
        "Finalize all documentation and compliance records"
      ]}
    ]
  },
  {
    id: "phase-4",
    phase: "Phase 4",
    title: "Customer Success",
    color: "#B91C1C",
    owner: "",
    description: "Transition to sustained operations, provide ongoing support, and optimize performance.",
    tasks: [
      { id: "4-1", title: "Go-Live & Handover", gate: true, subtasks: [
        "Execute Go-Live Acceptance Checklist",
        "Finalize Client Acceptance Checklist",
        "Handover to Post-Sales team (Tyler Bayne or designated lead)",
        "Document all as-built configurations and system settings",
        "Provide customer with passwords and administrative access securely"
      ]},
      { id: "4-2", title: "Operational Support & Incident Response", subtasks: [
        "Establish incident management processes and logging system",
        "Document alarm response procedures",
        "Document escalation protocols",
        "Document law enforcement coordination procedures",
        "Document emergency communication protocols",
        "Implement equipment failure response SOP with vendor coordination",
        "Develop asset downtime tracking process for service level monitoring",
        "Create cyber incident response playbook",
        "Document system failure playbooks (C2, VMS, network)"
      ]},
      { id: "4-3", title: "Maintenance & Vendor Coordination", subtasks: [
        "Establish field maintenance program with operator guides",
        "Document battery management and equipment rotation SOP",
        "Create vendor escalation playbook for repairs and warranty claims",
        "Finalize SLAs and support contracts with all vendors",
        "Implement preventive maintenance schedule",
        "Track equipment status, maintenance history, and warranties"
      ]},
      { id: "4-4", title: "Performance Monitoring & Optimization", subtasks: [
        "Monitor system performance against established SLAs",
        "Track response times and incident resolution metrics",
        "Collect customer feedback on performance and user experience",
        "Document lessons learned and improvement opportunities",
        "Conduct quarterly performance reviews with customer",
        "Identify expansion and upsell opportunities"
      ]},
      { id: "4-5", title: "Compliance & Documentation", subtasks: [
        "Maintain current FAA waiver compliance documentation",
        "Update insurance certificates as required",
        "Conduct quarterly compliance audits against waiver requirements",
        "Document all incidents and safety events for regulatory reporting",
        "Maintain up-to-date emergency contact procedures",
        "Ensure all operator certifications remain current (FAA Part 107)"
      ]},
      { id: "4-6", title: "Continuous Improvement & Team Training", subtasks: [
        "Conduct operator recertification training annually",
        "Hold quarterly safety and procedure refresher trainings",
        "Run periodic live system drills (simulated incidents)",
        "Update Standard Operating Procedures based on experience",
        "Share best practices across RSOC teams",
        "Conduct management training on new features and updates"
      ]}
    ]
  }
];

function deepCloneTemplate() {
  return JSON.parse(JSON.stringify(DEPLOYMENT_TEMPLATE));
}

// ─── PRICING CATALOG ─────────────────────────────────────────────────────
// cost = Sub Dealer Cost from Combined Drone Price Book.xlsx
// Customer price = cost * (1 + margin) — margin set live in PricingView (default 30%)
const PRICING_CATALOG = [
  // ── DJI DOCK 3 ───────────────────────────────────────────────────────────
  { name: "DJI Matrice 4D with RC Plus 2",                    cost: 6798.80,   category: "DJI Dock 3" },
  { name: "DJI Matrice 4TD with RC Plus 2",                   cost: 8469.75,   category: "DJI Dock 3" },
  { name: "DJI Dock 3",                                       cost: 11684.00,  category: "DJI Dock 3" },
  { name: "DJI Matrice 4D",                                   cost: 4834.60,   category: "DJI Dock 3" },
  { name: "DJI Matrice 4TD",                                  cost: 6847.10,   category: "DJI Dock 3" },
  { name: "DJI Matrice 4D Series Battery",                    cost: 346.92,    category: "DJI Dock 3" },
  { name: "DJI Matrice 4D Series 240W Charging Hub",          cost: 127.60,    category: "DJI Dock 3" },
  { name: "DJI 240W Power Adapter",                           cost: 179.80,    category: "DJI Dock 3" },
  { name: "RC Plus 2 Enterprise",                             cost: 1687.50,   category: "DJI Dock 3" },
  { name: "DJI Matrice 4D Series Low-Noise Anti-Ice Propellers", cost: 48.00, category: "DJI Dock 3" },
  { name: "AL1 Spotlight",                                    cost: 300.00,    category: "DJI Dock 3" },
  { name: "AS1 Speaker",                                      cost: 242.68,    category: "DJI Dock 3" },
  { name: "D-RTK 3 Relay Fixed Deployment Version",           cost: 2435.70,   category: "DJI Dock 3" },
  { name: "DJI Manifold 3",                                   cost: 1740.00,   category: "DJI Dock 3" },
  { name: "DJI Matrice 4D Obstacle Sensing Module",           cost: 1955.00,   category: "DJI Dock 3" },
  { name: "AVSS Parachute",                                   cost: 2352.00,   category: "DJI Dock 3" },
  // ── DAA ──────────────────────────────────────────────────────────────────
  { name: "DroneTag Scout",                                    cost: 5473.08,   category: "DAA" },
  { name: "DroneTag Scout License 1YR",                        cost: 920.00,    category: "DAA" },
  { name: "DroneTag Scout License 1YR Additional Sensor",      cost: 331.20,    category: "DAA" },
  { name: "Uavionix / Casia G 1YR",                          cost: 20000.00,  category: "DAA" },
  // ── SUNFLOWER (12-MONTH) ─────────────────────────────────────────────────
  { name: "Sunflower Package per BeeHive (12-Month Lease)",   cost: 41340.00,  category: "Sunflower (12-Month)" },
  // ── SUNFLOWER (36-MONTH) ─────────────────────────────────────────────────
  { name: "Sunflower Package per BeeHive (36-Month Lease)",   cost: 110682.00, category: "Sunflower (36-Month)" },
  // ── ACCESSORIES ──────────────────────────────────────────────────────────
  { name: "Axis Outdoor Camera for Dock",                     cost: 799.00,    category: "Accessories" },
  { name: "Starlink Enterprise Kit",                          cost: 400.00,    category: "Accessories" },
  { name: "Starlink Enterprise 1TB Monthly",                  cost: 290.00,    category: "Accessories" },
  // ── INSTALLATION & SERVICES — manualPrice:true = customer price is user-entered, no margin applied
  { name: "DroneSense License Fee (Annual)",                  cost: 8000.00,   category: "Installation & Services", manualPrice: true },
  { name: "DJI Installation",                                 cost: 8000.00,   category: "Installation & Services", manualPrice: true },
  { name: "Sunflower Installation",                           cost: 4500.00,   category: "Installation & Services", manualPrice: true },
  { name: "Casia G Installation",                             cost: 5000.00,   category: "Installation & Services", manualPrice: true },
  { name: "DroneTag Installation",                            cost: 1500.00,   category: "Installation & Services", manualPrice: true },
  { name: "Skydio Installation",                              cost: 0,         category: "Installation & Services", manualPrice: true },
];

// ─── ICONS ────────────────────────────────────────────────────────────────
const Icons = {
  plus: (<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  check: (<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7.5L5.5 11L12 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  chevron: (<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  trash: (<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4m1.5 0v7.5a1 1 0 01-1 1h-5a1 1 0 01-1-1V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>),
  back: (<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 2L4 8l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  note: (<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2h10v10H2z" stroke="currentColor" strokeWidth="1.2"/><path d="M4 5h6M4 7.5h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>),
  calendar: (<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="10" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M1.5 5.5h11M4.5 1v3M9.5 1v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>),
  search: (<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M9 9l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>),
  paperclip: (<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7.5 3.5L4 7a2.12 2.12 0 003 3l4.5-4.5a3.18 3.18 0 00-4.5-4.5L2.5 5.5a4.24 4.24 0 006 6L12 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  download: (<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 6l3 3 3-3M2 10h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  close: (<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>),
};

// ─── STORAGE HELPERS (localStorage for browser) ───────────────────────────
const STORAGE_KEY = "dxd:projects";
const ADMIN_TASKS_KEY = "dxd:admin-tasks";
const TEAM_KEY = "dxd:team";

function loadAdminTasks() {
  try { const r = localStorage.getItem(ADMIN_TASKS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveAdminTasks(tasks) {
  try { localStorage.setItem(ADMIN_TASKS_KEY, JSON.stringify(tasks)); } catch {}
}
function loadTeam() {
  try { const r = localStorage.getItem(TEAM_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveTeam(members) {
  try { localStorage.setItem(TEAM_KEY, JSON.stringify(members)); } catch {}
}

const EQUIPMENT_KEY = "dxd:equipment";
function loadEquipment() {
  try { const d = localStorage.getItem(EQUIPMENT_KEY); return d ? JSON.parse(d) : []; } catch { return []; }
}
function saveEquipment(eq) {
  try { localStorage.setItem(EQUIPMENT_KEY, JSON.stringify(eq)); return { ok: true }; } catch(e) { return { ok: false, msg: String(e) }; }
}

function loadProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveProjects(projects) {
  try {
    const toSave = projects.map((proj) => ({
      ...proj,
      phases: proj.phases.map((ph) => ({
        ...ph,
        tasks: ph.tasks.map((t) => ({
          ...t,
          attachments: (t.attachments || []).map((a) => ({
            id: a.id, name: a.name, type: a.type, size: a.size, addedAt: a.addedAt
          })),
        })),
      })),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: String(e) };
  }
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────
function App() {
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newSite, setNewSite] = useState("");
  const [saveStatus, setSaveStatus] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminTasks, setAdminTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [showEquipment, setShowEquipment] = useState(false);

  useEffect(() => {
    const p = loadProjects();
    setProjects(p);
    setAdminTasks(loadAdminTasks());
    setTeamMembers(loadTeam());
    setEquipment(loadEquipment());
    setLoading(false);
  }, []);

  const persist = useCallback((updated) => {
    setProjects(updated);
    setSaveStatus("saving");
    const res = saveProjects(updated);
    setSaveStatus(res.ok ? "saved" : { error: res.msg || "unknown error" });
    setTimeout(() => setSaveStatus(null), 4000);
  }, []);

  const createProject = () => {
    if (!newName.trim()) return;
    const project = {
      id: `proj-${Date.now()}`,
      name: newName.trim(),
      client: newClient.trim(),
      site: newSite.trim(),
      createdAt: new Date().toISOString(),
      phases: deepCloneTemplate().map((ph, phIdx) => ({
        ...ph,
        owner: ph.owner || "",
        unlocked: phIdx === 0,
        completedAt: null,
        tasks: ph.tasks.map((t) => ({
          ...t,
          completed: false,
          notes: "",
          dueDate: "",
          assignee: "",
          attachments: [],
          subtaskStatus: t.subtasks.map(() => false),
          ...(t.stakeholders ? { stakeholderContacts: Array.from({ length: 5 }, () => ({ name: "", email: "", phone: "" })) } : {}),
          ...(t.trackDates ? { orderTracking: t.subtasks.map(() => ({ ordered: "", shipped: "", eta: "", delivered: "", receivedBy: "" })) } : {}),
          ...(t.equipmentPicker ? { equipmentSelections: {} } : {}),
        })),
      })),
    };
    persist([project, ...projects]);
    setNewName("");
    setNewClient("");
    setNewSite("");
    setShowNewProject(false);
    setActiveProjectId(project.id);
  };

  const deleteProject = (id) => {
    persist(projects.filter((p) => p.id !== id));
    if (activeProjectId === id) setActiveProjectId(null);
  };

  const updateProject = (id, updater) => {
    persist(projects.map((p) => (p.id === id ? updater(p) : p)));
  };

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const importBackup = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        if (backup["dxd:projects"]) {
          localStorage.setItem("dxd:projects", backup["dxd:projects"]);
          const loaded = loadProjects();
          setProjects(loaded);
        }
        if (backup["dxd:admin-tasks"]) { localStorage.setItem("dxd:admin-tasks", backup["dxd:admin-tasks"]); setAdminTasks(loadAdminTasks()); }
        if (backup["dxd:team"]) { localStorage.setItem("dxd:team", backup["dxd:team"]); setTeamMembers(loadTeam()); }
        if (backup["dxd:equipment"]) { localStorage.setItem("dxd:equipment", backup["dxd:equipment"]); setEquipment(loadEquipment()); }
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(null), 3000);
      } catch (err) {
        setSaveStatus({ error: "Import failed — invalid backup file" });
        setTimeout(() => setSaveStatus(null), 4000);
      }
    };
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <img src={LOGO_IMAGE} alt="Deus X" style={{ width: 64, height: 64, objectFit: "contain", animation: "pulse 1.5s ease infinite", borderRadius: 0 }} />
        <div style={styles.loadingText}>INITIALIZING SYSTEMS...</div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #1C1C1E; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
        input, textarea { font-family: 'IBM Plex Mono', monospace; }
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        select { background: #1e1e22 !important; color: #E8ECF4 !important; border: 1px solid rgba(255,255,255,0.08); border-radius: 5px; appearance: none; -webkit-appearance: none; padding: 8px 28px 8px 10px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; outline: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' stroke='rgba(255,255,255,0.35)' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") !important; background-repeat: no-repeat !important; background-position: right 8px center !important; }
        select option { background: #1e1e22; color: #E8ECF4; }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        .leaflet-popup-content-wrapper { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
        .leaflet-popup-tip-container { display: none !important; }
        .leaflet-popup-content { margin: 0 !important; }
        .leaflet-container .leaflet-control-zoom a { background: rgba(4,10,4,0.92) !important; color: #39FF14 !important; border-color: rgba(57,255,20,0.3) !important; font-family: 'Courier New', monospace !important; }
        .leaflet-container .leaflet-control-zoom a:hover { background: rgba(57,255,20,0.15) !important; }
        .leaflet-container .leaflet-control-attribution { background: rgba(4,8,4,0.7) !important; color: rgba(57,255,20,0.3) !important; font-size: 9px !important; }
        @keyframes tactPulse { 0%, 100% { box-shadow: 0 0 8px rgba(255,255,255,0.3); } 50% { box-shadow: 0 0 22px rgba(255,255,255,0.75); } }
      `}</style>
      <div style={styles.appOverlay} />
      <div style={styles.appContent}>
        {saveStatus && (
          <div style={{
            position: "fixed", bottom: 20, right: 20, zIndex: 999,
            display: "flex", alignItems: "center", gap: 8,
            background: saveStatus?.error ? "rgba(229,57,53,0.9)" : "rgba(40,40,42,0.95)",
            border: `1px solid ${saveStatus?.error ? "rgba(229,57,53,0.5)" : saveStatus === "saved" ? "rgba(76,175,80,0.4)" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 8, padding: "8px 16px", maxWidth: 400,
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
            color: saveStatus === "saved" ? "#4CAF50" : saveStatus?.error ? "#fff" : "rgba(255,255,255,0.6)",
            animation: "fadeSlideIn 0.2s ease",
            backdropFilter: "blur(10px)", wordBreak: "break-word",
          }}>
            {saveStatus === "saving" && "Saving..."}
            {saveStatus === "saved" && "\u2713 Saved"}
            {saveStatus?.error && `\u26A0 ${saveStatus.error}`}
          </div>
        )}
        {showEquipment ? (
          <EquipmentTracker
            equipment={equipment}
            setEquipment={(eq) => { setEquipment(eq); saveEquipment(eq); }}
            projects={projects}
            teamMembers={teamMembers}
            onBack={() => setShowEquipment(false)}
          />
        ) : showAdmin ? (
          <AdminPanel
            teamMembers={teamMembers}
            onTeamChange={(updated) => { setTeamMembers(updated); saveTeam(updated); }}
            adminTasks={adminTasks}
            onTasksChange={(updated) => { setAdminTasks(updated); saveAdminTasks(updated); }}
            onBack={() => setShowAdmin(false)}
          />
        ) : !activeProject ? (
          <ProjectList
            projects={projects} onSelect={setActiveProjectId} onDelete={deleteProject}
            showNew={showNewProject} setShowNew={setShowNewProject}
            newName={newName} setNewName={setNewName}
            newClient={newClient} setNewClient={setNewClient}
            newSite={newSite} setNewSite={setNewSite}
            onCreate={createProject}
            onAdmin={() => setShowAdmin(true)}
            onEquipment={() => setShowEquipment(true)}
            onImport={importBackup}
          />
        ) : (
          <ProjectView
            project={activeProject}
            onBack={() => setActiveProjectId(null)}
            onUpdate={(updater) => updateProject(activeProjectId, updater)}
            teamMembers={teamMembers}
          />
        )}
      </div>
    </div>
  );
}

// ─── PROJECT LIST SCREEN ──────────────────────────────────────────────────
function ProjectList({ projects, onSelect, onDelete, showNew, setShowNew, newName, setNewName, newClient, setNewClient, newSite, setNewSite, onCreate, onAdmin, onEquipment, onImport }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logoRow}>
          <img src={LOGO_IMAGE} alt="Deus X" style={styles.logoImg} />
          <div>
            <h1 style={styles.logoTitle}>DEUS X DEFENSE</h1>
            <div style={styles.logoSub}>DRONE DEPLOYMENT OPS</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ ...styles.ghostBtn, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3-3 3 3M2 11v1.5A.5.5 0 002.5 13h9a.5.5 0 00.5-.5V11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>IMPORT</span>
            <input type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { onImport(e.target.files[0]); e.target.value = ""; }} />
          </label>
          <button style={{ ...styles.ghostBtn, display: "flex", alignItems: "center", gap: 6 }} onClick={onEquipment}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5 3V2a2 2 0 014 0v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M1 7h12" stroke="currentColor" strokeWidth="1.3"/></svg>
            <span>EQUIPMENT</span>
          </button>
          <button style={{ ...styles.ghostBtn, display: "flex", alignItems: "center", gap: 6 }} onClick={onAdmin}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2 12c0-2.21 2.239-4 5-4s5 1.79 5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            <span>ADMIN</span>
          </button>
          <button style={styles.primaryBtn} onClick={() => setShowNew(!showNew)}>
            {Icons.plus}<span>NEW PROJECT</span>
          </button>
        </div>
      </div>
      {showNew && (
        <div style={{ ...styles.newProjectCard, animation: "fadeSlideIn 0.3s ease" }}>
          <div style={styles.newProjectGrid}>
            <div>
              <label style={styles.fieldLabel}>PROJECT NAME *</label>
              <input style={styles.input} placeholder="e.g. Acme Corp HQ Deployment" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onCreate()} />
            </div>
            <div>
              <label style={styles.fieldLabel}>CLIENT</label>
              <input style={styles.input} placeholder="e.g. Acme Corporation" value={newClient} onChange={(e) => setNewClient(e.target.value)} />
            </div>
            <div>
              <label style={styles.fieldLabel}>SITE LOCATION</label>
              <input style={styles.input} placeholder="e.g. Dallas, TX" value={newSite} onChange={(e) => setNewSite(e.target.value)} />
            </div>
          </div>
          <div style={styles.newProjectActions}>
            <button style={styles.ghostBtn} onClick={() => setShowNew(false)}>CANCEL</button>
            <button style={{ ...styles.primaryBtn, opacity: newName.trim() ? 1 : 0.4 }} onClick={onCreate}>DEPLOY PROJECT</button>
          </div>
        </div>
      )}
      {(() => {
        const active = projects.filter((p) => { const t = p.phases.reduce((a,ph)=>a+ph.tasks.length,0); const d = p.phases.reduce((a,ph)=>a+ph.tasks.filter(t=>t.completed).length,0); return t===0||d<t; });
        const completed = projects.filter((p) => { const t = p.phases.reduce((a,ph)=>a+ph.tasks.length,0); const d = p.phases.reduce((a,ph)=>a+ph.tasks.filter(t=>t.completed).length,0); return t>0&&d===t; });
        if (projects.length === 0 && !showNew) return (
          <div style={styles.emptyState}>
            <img src={LOGO_IMAGE} alt="Deus X" style={{ width: 64, height: 64, objectFit: "contain", opacity: 0.25, marginBottom: 16 }} />
            <div style={styles.emptyTitle}>No Active Deployments</div>
            <div style={styles.emptySub}>Create your first project to begin tracking a drone deployment.</div>
          </div>
        );
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            <div>
              <div style={styles.columnHeader}>
                <span style={styles.columnDot} />
                <span style={styles.columnTitle}>ACTIVE</span>
                <span style={styles.columnCount}>{active.length}</span>
              </div>
              {active.length === 0 ? <div style={styles.columnEmpty}>No active deployments</div> : (
                <div style={styles.projectGrid}>
                  {active.map((p, i) => <ProjectCard key={p.id} project={p} index={i} onSelect={() => onSelect(p.id)} onDelete={() => onDelete(p.id)} />)}
                </div>
              )}
            </div>
            {completed.length > 0 && (
              <div>
                <div style={styles.columnHeader}>
                  <span style={{ ...styles.columnDot, background: "#22C55E", boxShadow: "0 0 6px #22C55E88" }} />
                  <span style={styles.columnTitle}>COMPLETED</span>
                  <span style={styles.columnCount}>{completed.length}</span>
                </div>
                <div style={styles.projectGrid}>
                  {completed.map((p, i) => <ProjectCard key={p.id} project={p} index={i} onSelect={() => onSelect(p.id)} onDelete={() => onDelete(p.id)} completed />)}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────
function AdminPanel({ teamMembers, onTeamChange, adminTasks, onTasksChange, onBack }) {
  const [tab, setTab] = React.useState("tasks");
  // Team form
  const [memberName, setMemberName] = React.useState("");
  const [memberRole, setMemberRole] = React.useState("");
  const [memberEmail, setMemberEmail] = React.useState("");
  // Task form
  const [showTaskForm, setShowTaskForm] = React.useState(false);
  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskDesc, setTaskDesc] = React.useState("");
  const [taskAssignee, setTaskAssignee] = React.useState("");
  const [taskDue, setTaskDue] = React.useState("");
  const [taskPriority, setTaskPriority] = React.useState("medium");

  const priorityColors = { low: "#4CAF50", medium: "#FF9800", high: "#e63946", urgent: "#b91c1c" };
  const priorityLabels = { low: "LOW", medium: "MEDIUM", high: "HIGH", urgent: "URGENT" };

  const addMember = () => {
    if (!memberName.trim()) return;
    const updated = [...teamMembers, { id: `member-${Date.now()}`, name: memberName.trim(), role: memberRole.trim(), email: memberEmail.trim() }];
    onTeamChange(updated);
    setMemberName(""); setMemberRole(""); setMemberEmail("");
  };
  const removeMember = (id) => onTeamChange(teamMembers.filter((m) => m.id !== id));

  const addTask = () => {
    if (!taskTitle.trim()) return;
    const updated = [{ id: `task-${Date.now()}`, title: taskTitle.trim(), description: taskDesc.trim(), assignee: taskAssignee, dueDate: taskDue, priority: taskPriority, status: "todo", createdAt: new Date().toISOString() }, ...adminTasks];
    onTasksChange(updated);
    setTaskTitle(""); setTaskDesc(""); setTaskAssignee(""); setTaskDue(""); setTaskPriority("medium"); setShowTaskForm(false);
  };
  const moveTask = (id, status) => onTasksChange(adminTasks.map((t) => t.id === id ? { ...t, status } : t));
  const deleteTask = (id) => onTasksChange(adminTasks.filter((t) => t.id !== id));

  const col = (status) => adminTasks.filter((t) => t.status === status);
  const colMeta = [
    { status: "todo", label: "TO DO", color: "rgba(255,255,255,0.4)" },
    { status: "inprogress", label: "IN PROGRESS", color: "#FF9800" },
    { status: "done", label: "DONE", color: "#4CAF50" },
  ];

  const cardStyle = { background: "rgba(30,30,34,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "14px 16px", marginBottom: 10 };
  const inputSm = { ...styles.input, fontSize: 13, padding: "8px 12px" };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button style={styles.backBtn} onClick={onBack}>{Icons.back}</button>
          <div style={{ width: 40, height: 40, background: "linear-gradient(135deg, #e63946, #a62633)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="6" r="3" stroke="#fff" strokeWidth="1.5"/><path d="M3 16c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1, fontFamily: "'Chakra Petch', sans-serif" }}>ADMIN PANEL</h2>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 1.5, marginTop: 2 }}>TASK MANAGEMENT & TEAM</div>
          </div>
        </div>
        {tab === "tasks" && (
          <button style={styles.primaryBtn} onClick={() => setShowTaskForm(!showTaskForm)}>
            {Icons.plus}<span>NEW TASK</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 4 }}>
        {[{ id: "tasks", label: "TASKS" }, { id: "team", label: "TEAM MEMBERS" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 1, transition: "all 0.15s", background: tab === t.id ? "rgba(230,57,70,0.85)" : "transparent", color: tab === t.id ? "#fff" : "rgba(255,255,255,0.45)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TASKS TAB ── */}
      {tab === "tasks" && (
        <>
          {showTaskForm && (
            <div style={{ ...cardStyle, border: "1px solid rgba(230,57,70,0.3)", marginBottom: 24, animation: "fadeSlideIn 0.25s ease" }}>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, color: "#e63946", letterSpacing: 1.5, marginBottom: 14 }}>NEW TASK</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={styles.fieldLabel}>TASK TITLE *</label>
                  <input style={inputSm} placeholder="e.g. Review site survey report" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={styles.fieldLabel}>DESCRIPTION</label>
                  <textarea style={{ ...inputSm, height: 70, resize: "vertical" }} placeholder="Additional details..." value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} />
                </div>
                <div>
                  <label style={styles.fieldLabel}>ASSIGN TO</label>
                  <select style={{ ...inputSm, color: taskAssignee ? "#f1f1f1" : "rgba(255,255,255,0.3)" }} value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)}>
                    <option value="">— Unassigned —</option>
                    {teamMembers.map((m) => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label style={styles.fieldLabel}>DUE DATE</label>
                  <input type="date" style={inputSm} value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                </div>
                <div>
                  <label style={styles.fieldLabel}>PRIORITY</label>
                  <select style={{ ...inputSm, color: priorityColors[taskPriority] }} value={taskPriority} onChange={(e) => setTaskPriority(e.target.value)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={styles.ghostBtn} onClick={() => setShowTaskForm(false)}>CANCEL</button>
                <button style={{ ...styles.primaryBtn, opacity: taskTitle.trim() ? 1 : 0.4 }} onClick={addTask}>CREATE TASK</button>
              </div>
            </div>
          )}

          {adminTasks.length === 0 && !showTaskForm ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyTitle}>No Tasks Yet</div>
              <div style={styles.emptySub}>Click "NEW TASK" to create and assign a task to a team member.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
              {colMeta.map(({ status, label, color }) => (
                <div key={status}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
                    <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "rgba(255,255,255,0.55)" }}>{label}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.25)", marginLeft: "auto" }}>{col(status).length}</span>
                  </div>
                  {col(status).length === 0 && (
                    <div style={{ border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 8, padding: "20px 0", textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.18)" }}>Empty</div>
                  )}
                  {col(status).map((task) => (
                    <div key={task.id} style={{ ...cardStyle, position: "relative" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 600, letterSpacing: 1, color: priorityColors[task.priority], background: `${priorityColors[task.priority]}18`, border: `1px solid ${priorityColors[task.priority]}40`, borderRadius: 4, padding: "2px 7px" }}>{priorityLabels[task.priority]}</span>
                        <button onClick={() => deleteTask(task.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.2)", padding: 2, lineHeight: 1 }} title="Delete">{Icons.close}</button>
                      </div>
                      <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#f1f1f1", lineHeight: 1.4 }}>{task.title}</div>
                      {task.description && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8, lineHeight: 1.5 }}>{task.description}</div>}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 8 }}>
                        {task.assignee && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "3px 8px" }}>👤 {task.assignee}</span>}
                        {task.dueDate && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.04)", borderRadius: 4, padding: "3px 8px" }}>📅 {task.dueDate}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 4, marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        {status !== "todo" && <button onClick={() => moveTask(task.id, "todo")} style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: "rgba(255,255,255,0.4)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "4px 0", cursor: "pointer" }}>← TO DO</button>}
                        {status !== "inprogress" && <button onClick={() => moveTask(task.id, "inprogress")} style={{ flex: 1, background: "rgba(255,152,0,0.08)", border: "1px solid rgba(255,152,0,0.2)", borderRadius: 4, color: "#FF9800", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "4px 0", cursor: "pointer" }}>IN PROGRESS</button>}
                        {status !== "done" && <button onClick={() => moveTask(task.id, "done")} style={{ flex: 1, background: "rgba(76,175,80,0.08)", border: "1px solid rgba(76,175,80,0.2)", borderRadius: 4, color: "#4CAF50", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "4px 0", cursor: "pointer" }}>DONE ✓</button>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── TEAM TAB ── */}
      {tab === "team" && (
        <>
          <div style={{ ...cardStyle, border: "1px solid rgba(230,57,70,0.2)", marginBottom: 24 }}>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, color: "#e63946", letterSpacing: 1.5, marginBottom: 14 }}>ADD TEAM MEMBER</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={styles.fieldLabel}>NAME *</label>
                <input style={inputSm} placeholder="e.g. Tyler Morris" value={memberName} onChange={(e) => setMemberName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMember()} />
              </div>
              <div>
                <label style={styles.fieldLabel}>ROLE</label>
                <input style={inputSm} placeholder="e.g. Pilot, Engineer" value={memberRole} onChange={(e) => setMemberRole(e.target.value)} />
              </div>
              <div>
                <label style={styles.fieldLabel}>EMAIL</label>
                <input style={inputSm} placeholder="e.g. tyler@deusxdefense.com" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={{ ...styles.primaryBtn, opacity: memberName.trim() ? 1 : 0.4 }} onClick={addMember}>{Icons.plus}<span>ADD MEMBER</span></button>
            </div>
          </div>

          {teamMembers.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyTitle}>No Team Members</div>
              <div style={styles.emptySub}>Add team members above so you can assign tasks to them.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {teamMembers.map((m) => (
                <div key={m.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg, #e63946, #a62633)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                    {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 600, color: "#f1f1f1" }}>{m.name}</div>
                    {m.role && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{m.role}</div>}
                    {m.email && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>{m.email}</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{adminTasks.filter((t) => t.assignee === m.name).length} tasks</span>
                    <button onClick={() => removeMember(m.id)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: "3px 8px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}>REMOVE</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProjectCard({ project, index, onSelect, onDelete, completed: isCompleted }) {
  const totalTasks = project.phases.reduce((a, ph) => a + ph.tasks.length, 0);
  const doneTasks = project.phases.reduce((a, ph) => a + ph.tasks.filter((t) => t.completed).length, 0);
  const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const currentPhase = project.phases.find((ph) => ph.tasks.some((t) => !t.completed)) || project.phases[project.phases.length - 1];
  const accentColor = isCompleted ? "#22C55E" : currentPhase.color;
  return (
    <div
      style={{ ...styles.projectCard, ...(isCompleted ? styles.projectCardCompleted : {}), borderLeft: `3px solid ${accentColor}`, animationDelay: `${index * 0.06}s`, animation: "fadeSlideIn 0.4s ease both" }}
      onClick={onSelect}
    >
      {/* Top row: phase pill + percentage + delete */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ ...styles.cardPhaseTag, background: `${accentColor}18`, border: `1px solid ${accentColor}44`, borderRadius: 4, padding: "3px 9px", color: accentColor }}>
          {isCompleted ? "✓ COMPLETE" : currentPhase.title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 700, color: accentColor }}>{pct}%</span>
          <button style={styles.deleteBtn} onClick={(e) => { e.stopPropagation(); onDelete(); }}>{Icons.trash}</button>
        </div>
      </div>

      {/* Project name */}
      <h3 style={styles.cardName}>{project.name}</h3>

      {/* Client + site */}
      {project.client && <div style={styles.cardClient}>{project.client}</div>}
      {project.site && (
        <div style={styles.cardSite}>
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{ marginRight: 4, opacity: 0.5 }}>
            <circle cx="7" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 1C4.24 1 2 3.24 2 6c0 3.5 5 7 5 7s5-3.5 5-7c0-2.76-2.24-5-5-5z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
          </svg>
          {project.site}
        </div>
      )}

      {/* Progress bar */}
      <div style={{ marginTop: 16, marginBottom: 6 }}>
        <div style={styles.progressBarBg}>
          <div style={{ ...styles.progressBarFill, width: `${pct}%`, background: `linear-gradient(90deg, ${accentColor}cc, ${accentColor})`, boxShadow: `0 0 6px ${accentColor}55` }} />
        </div>
      </div>

      {/* Footer: task count + date */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
          {doneTasks} / {totalTasks} tasks
        </span>
        <span style={styles.cardDate}>
          {new Date(project.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>
    </div>
  );
}

// ─── PROJECT DETAIL VIEW ──────────────────────────────────────────────────
function ProjectSettingsView({ project, onUpdate }) {
  const [name, setName] = React.useState(project.name || "");
  const [client, setClient] = React.useState(project.client || "");
  const [site, setSite] = React.useState(project.site || "");
  const [saved, setSaved] = React.useState(false);
  const inputStyle = { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#E8ECF4", fontSize: 14, outline: "none", fontFamily: "'IBM Plex Mono', monospace", boxSizing: "border-box" };
  const labelStyle = { display: "block", fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.35)", marginBottom: 6, textTransform: "uppercase" };
  const save = () => {
    onUpdate(p => ({ ...p, name: name.trim() || p.name, client: client.trim(), site: site.trim() }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div style={{ padding: "32px 0", maxWidth: 560 }}>
      <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#C41E3A", marginBottom: 24, textTransform: "uppercase" }}>Project Settings</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <label style={labelStyle}>Project Name *</label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Southside Industrial Complex" />
        </div>
        <div>
          <label style={labelStyle}>Client / Company</label>
          <input style={inputStyle} value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. Acme Security Corp" />
        </div>
        <div>
          <label style={labelStyle}>Site Address</label>
          <input style={inputStyle} value={site} onChange={e => setSite(e.target.value)} placeholder="e.g. 5623 Two Notch Rd, Columbia, SC 29223" />
        </div>
        <div style={{ paddingTop: 8 }}>
          <button onClick={save} style={{ background: "linear-gradient(135deg, #E53935, #C62828)", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 2, padding: "12px 28px", cursor: "pointer" }}>
            {saved ? "SAVED ✓" : "SAVE CHANGES"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StakeholdersView({ project, onUpdate }) {
  const stakeholders = project.stakeholders || [];
  const empty = { name: "", title: "", company: "", email: "", phone: "" };
  const [form, setForm] = React.useState(empty);
  const [editId, setEditId] = React.useState(null);
  const [showForm, setShowForm] = React.useState(false);
  const inputStyle = { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 12px", color: "#E8ECF4", fontSize: 12, outline: "none", fontFamily: "'IBM Plex Mono', monospace", boxSizing: "border-box" };
  const labelStyle = { display: "block", fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.35)", marginBottom: 5, textTransform: "uppercase" };

  const save = () => {
    if (!form.name.trim()) return;
    if (editId) {
      onUpdate(p => ({ ...p, stakeholders: (p.stakeholders || []).map(s => s.id === editId ? { ...form, id: editId } : s) }));
    } else {
      onUpdate(p => ({ ...p, stakeholders: [...(p.stakeholders || []), { ...form, id: `sh-${Date.now()}` }] }));
    }
    setForm(empty); setEditId(null); setShowForm(false);
  };
  const remove = (id) => onUpdate(p => ({ ...p, stakeholders: (p.stakeholders || []).filter(s => s.id !== id) }));
  const edit = (s) => { setForm({ name: s.name, title: s.title, company: s.company, email: s.email, phone: s.phone }); setEditId(s.id); setShowForm(true); };

  return (
    <div style={{ padding: "24px 0", maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#C41E3A", textTransform: "uppercase" }}>Stakeholder Contacts</div>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", padding: "2px 10px", borderRadius: 10 }}>{stakeholders.length}</span>
        <button onClick={() => { setForm(empty); setEditId(null); setShowForm(true); }} style={{ marginLeft: "auto", background: "linear-gradient(135deg, #E53935, #C62828)", border: "none", borderRadius: 6, color: "#fff", fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, padding: "7px 16px", cursor: "pointer" }}>+ ADD CONTACT</button>
      </div>

      {showForm && (
        <div style={{ background: "rgba(20,20,24,0.98)", border: "1px solid rgba(196,30,58,0.35)", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, color: "#C41E3A", letterSpacing: 1.5, marginBottom: 16 }}>{editId ? "EDIT CONTACT" : "NEW CONTACT"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input style={inputStyle} placeholder="e.g. John Smith" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Title / Role</label>
              <input style={inputStyle} placeholder="e.g. Director of Security" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Company</label>
              <input style={inputStyle} placeholder="e.g. Acme Corp" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} placeholder="e.g. john@acme.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} placeholder="e.g. (555) 123-4567" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={save} style={{ background: "linear-gradient(135deg, #E53935, #C62828)", border: "none", borderRadius: 6, color: "#fff", fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, padding: "8px 20px", cursor: "pointer", opacity: form.name.trim() ? 1 : 0.4 }}>{editId ? "SAVE CHANGES" : "ADD CONTACT"}</button>
            <button onClick={() => { setShowForm(false); setForm(empty); setEditId(null); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "rgba(255,255,255,0.5)", fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 1.5, padding: "8px 20px", cursor: "pointer" }}>CANCEL</button>
          </div>
        </div>
      )}

      {stakeholders.length === 0 && !showForm ? (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 10, padding: "32px 24px", textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
          No contacts yet — click "+ ADD CONTACT" to add a stakeholder.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stakeholders.map(s => (
            <div key={s.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "16px 20px", display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr auto", gap: 12, alignItems: "center" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
            >
              <div>
                <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 700, color: "#E8ECF4", letterSpacing: 0.3 }}>{s.name}</div>
                {s.company && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{s.company}</div>}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#C41E3A" }}>{s.title || "—"}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{s.email || "—"}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{s.phone || "—"}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => edit(s)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: "4px 8px", display: "flex", alignItems: "center" }}><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
                <button onClick={() => remove(s.id)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, cursor: "pointer", color: "rgba(255,100,100,0.5)", padding: "4px 8px", display: "flex", alignItems: "center" }}>{Icons.trash}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectView({ project, onBack, onUpdate, teamMembers = [] }) {
  const [expandedPhase, setExpandedPhase] = useState(null);
  const [expandedTask, setExpandedTask] = useState(null);
  const [filterText, setFilterText] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const equipPickerTask = project.phases.flatMap(ph => ph.tasks).find(t => t.equipmentPicker);
  const equipSelections = equipPickerTask?.equipmentSelections || {};
  const [quantities, setQuantities] = useState(() => {
    const sels = equipPickerTask?.equipmentSelections || {};
    return PRICING_CATALOG.map(item => sels[item.name] || 0);
  });
  useEffect(() => {
    setQuantities(PRICING_CATALOG.map(item => equipSelections[item.name] || 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(equipSelections)]);
  // Add task state
  const [addingTaskToPhase, setAddingTaskToPhase] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  // Add subtask state
  const [addingSubtaskTo, setAddingSubtaskTo] = useState(null); // task.id
  const [newSubtaskText, setNewSubtaskText] = useState("");
  // Inline editing state
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [editingSubtask, setEditingSubtask] = useState(null); // { taskId, sIdx }
  const [editingSubtaskText, setEditingSubtaskText] = useState("");
  const [openSubtaskNote, setOpenSubtaskNote] = useState(null); // { taskId, sIdx }
  const [dragOverTask, setDragOverTask] = useState(null); // { pIdx, taskIdx }

  const totalTasks = project.phases.reduce((a, ph) => a + ph.tasks.length, 0);
  const doneTasks = project.phases.reduce((a, ph) => a + ph.tasks.filter((t) => t.completed).length, 0);
  const overallPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const isPhaseUnlocked = (pIdx) => true;

  const getPhaseStatus = (pIdx) => {
    const phase = project.phases[pIdx];
    const done = phase.tasks.filter((t) => t.completed).length;
    const total = phase.tasks.length;
    if (!isPhaseUnlocked(pIdx)) return "locked";
    if (done === total) return "complete";
    if (done > 0) return "in_progress";
    return "ready";
  };

  const updatePhaseOwner = (phaseIdx, value) => {
    onUpdate((p) => { const np = JSON.parse(JSON.stringify(p)); np.phases[phaseIdx].owner = value; return np; });
  };

  const isTaskDone = (task) => {
    if (task.equipmentPicker) return Object.values(task.equipmentSelections || {}).some(q => q > 0);
    if (task.eitherOr) {
      const eitherOrDone = task.eitherOr.some((i) => task.subtaskStatus[i]);
      const othersDone = task.subtaskStatus.every((v, i) => task.eitherOr.includes(i) || v);
      return eitherOrDone && othersDone;
    }
    return task.subtaskStatus.every(Boolean);
  };

  const getEffectiveSubDone = (task) => {
    if (task.equipmentPicker) return Object.values(task.equipmentSelections || {}).filter(q => q > 0).length;
    if (task.eitherOr) {
      const eitherOrDone = task.eitherOr.some((i) => task.subtaskStatus[i]) ? 1 : 0;
      const othersCount = task.subtaskStatus.filter((v, i) => !task.eitherOr.includes(i) && v).length;
      return eitherOrDone + othersCount;
    }
    return task.subtaskStatus.filter(Boolean).length;
  };

  const getEffectiveSubTotal = (task) => {
    if (task.equipmentPicker) return PRICING_CATALOG.filter(i => i.category !== "Installation & Services").length;
    if (task.eitherOr) return task.subtasks.length - task.eitherOr.length + 1;
    return task.subtasks.length;
  };

  const updateEquipmentSelection = (phaseIdx, taskIdx, itemName, qty) => {
    onUpdate((p) => {
      const np = JSON.parse(JSON.stringify(p));
      const task = np.phases[phaseIdx].tasks[taskIdx];
      if (!task.equipmentSelections) task.equipmentSelections = {};
      if (qty <= 0) delete task.equipmentSelections[itemName];
      else task.equipmentSelections[itemName] = qty;
      return np;
    });
  };

  const toggleTask = (phaseIdx, taskIdx) => {
    onUpdate((p) => {
      const np = JSON.parse(JSON.stringify(p));
      const task = np.phases[phaseIdx].tasks[taskIdx];
      task.completed = !task.completed;
      if (task.completed) task.subtaskStatus = task.subtaskStatus.map(() => true);
      return np;
    });
  };

  const toggleSubtask = (phaseIdx, taskIdx, subIdx) => {
    onUpdate((p) => {
      const np = JSON.parse(JSON.stringify(p));
      const task = np.phases[phaseIdx].tasks[taskIdx];
      task.subtaskStatus[subIdx] = !task.subtaskStatus[subIdx];
      task.completed = isTaskDone(task);
      return np;
    });
  };

  const updateTaskField = (phaseIdx, taskIdx, field, value) => {
    onUpdate((p) => { const np = JSON.parse(JSON.stringify(p)); np.phases[phaseIdx].tasks[taskIdx][field] = value; return np; });
  };

  const updateSubtaskText = (phaseIdx, taskIdx, subIdx, value) => {
    onUpdate((p) => { const np = JSON.parse(JSON.stringify(p)); np.phases[phaseIdx].tasks[taskIdx].subtasks[subIdx] = value; return np; });
  };

  const updateSubtaskNote = (phaseIdx, taskIdx, subIdx, value) => {
    onUpdate((p) => {
      const np = JSON.parse(JSON.stringify(p));
      const task = np.phases[phaseIdx].tasks[taskIdx];
      if (!task.subtaskNotes) task.subtaskNotes = task.subtasks.map(() => "");
      task.subtaskNotes[subIdx] = value;
      return np;
    });
  };

  const attachFile = (phaseIdx, taskIdx, file) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { alert("File too large. Maximum size is 20MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const attachment = { id: `att-${Date.now()}`, name: file.name, type: file.type, size: file.size, data: reader.result, addedAt: new Date().toISOString() };
      onUpdate((p) => {
        const np = JSON.parse(JSON.stringify(p));
        const task = np.phases[phaseIdx].tasks[taskIdx];
        if (!task.attachments) task.attachments = [];
        task.attachments.push(attachment);
        return np;
      });
    };
    reader.readAsDataURL(file);
  };

  const commitTaskTitle = (phaseIdx, taskIdx) => {
    if (editingTaskTitle.trim()) updateTaskField(phaseIdx, taskIdx, "title", editingTaskTitle.trim());
    setEditingTaskId(null);
  };

  const commitSubtask = (phaseIdx, taskIdx, subIdx) => {
    if (editingSubtaskText.trim()) updateSubtaskText(phaseIdx, taskIdx, subIdx, editingSubtaskText.trim());
    setEditingSubtask(null);
  };

  const addCustomTask = (phaseIdx) => {
    if (!newTaskTitle.trim()) return;
    const task = { id: `ctask-${Date.now()}`, title: newTaskTitle.trim(), completed: false, notes: "", dueDate: "", assignee: newTaskAssignee, attachments: [], subtasks: [], subtaskStatus: [], custom: true };
    onUpdate((p) => { const np = JSON.parse(JSON.stringify(p)); np.phases[phaseIdx].tasks.push(task); return np; });
    setNewTaskTitle(""); setNewTaskAssignee(""); setAddingTaskToPhase(null);
  };

  const deleteCustomTask = (phaseIdx, taskIdx) => {
    onUpdate((p) => { const np = JSON.parse(JSON.stringify(p)); np.phases[phaseIdx].tasks.splice(taskIdx, 1); return np; });
  };

  const addSubtask = (phaseIdx, taskIdx) => {
    if (!newSubtaskText.trim()) return;
    onUpdate((p) => {
      const np = JSON.parse(JSON.stringify(p));
      const task = np.phases[phaseIdx].tasks[taskIdx];
      task.subtasks.push(newSubtaskText.trim());
      task.subtaskStatus.push(false);
      if (task.orderTracking) task.orderTracking.push({ ordered: "", shipped: "", eta: "", delivered: "", receivedBy: "" });
      return np;
    });
    setNewSubtaskText(""); setAddingSubtaskTo(null);
  };

  const deleteSubtask = (phaseIdx, taskIdx, subIdx) => {
    onUpdate((p) => {
      const np = JSON.parse(JSON.stringify(p));
      const task = np.phases[phaseIdx].tasks[taskIdx];
      task.subtasks.splice(subIdx, 1);
      task.subtaskStatus.splice(subIdx, 1);
      if (task.orderTracking) task.orderTracking.splice(subIdx, 1);
      return np;
    });
  };

  const updateStakeholder = (phaseIdx, taskIdx, contactIdx, field, value) => {
    onUpdate((p) => {
      const np = JSON.parse(JSON.stringify(p));
      const task = np.phases[phaseIdx].tasks[taskIdx];
      if (!task.stakeholderContacts) task.stakeholderContacts = Array.from({ length: 5 }, () => ({ name: "", email: "", phone: "" }));
      task.stakeholderContacts[contactIdx][field] = value;
      return np;
    });
  };

  const updateOrderTracking = (phaseIdx, taskIdx, subIdx, field, value) => {
    onUpdate((p) => {
      const np = JSON.parse(JSON.stringify(p));
      const task = np.phases[phaseIdx].tasks[taskIdx];
      if (!task.orderTracking) task.orderTracking = task.subtasks.map(() => ({ ordered: "", shipped: "", eta: "", delivered: "", receivedBy: "" }));
      task.orderTracking[subIdx][field] = value;
      return np;
    });
  };

  const fileInputRef = useRef(null);
  const [pendingAttach, setPendingAttach] = useState(null);

  const handleAttachClick = (phaseIdx, taskIdx) => {
    setPendingAttach({ phaseIdx, taskIdx });
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const handleFileSelected = (e) => {
    const file = e.target.files[0];
    if (!file || !pendingAttach) return;
    const { phaseIdx, taskIdx } = pendingAttach;
    attachFile(phaseIdx, taskIdx, file);
    setPendingAttach(null);
  };

  const removeAttachment = (phaseIdx, taskIdx, attId) => {
    onUpdate((p) => {
      const np = JSON.parse(JSON.stringify(p));
      np.phases[phaseIdx].tasks[taskIdx].attachments = (np.phases[phaseIdx].tasks[taskIdx].attachments || []).filter((a) => a.id !== attId);
      return np;
    });
  };

  const downloadAttachment = (att) => {
    const link = document.createElement("a");
    link.href = att.data;
    link.download = att.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileIcon = (type) => {
    if (type.startsWith("image/")) return "\uD83D\uDDBC\uFE0F";
    if (type.includes("pdf")) return "\uD83D\uDCC4";
    if (type.includes("word") || type.includes("document")) return "\uD83D\uDCDD";
    if (type.includes("sheet") || type.includes("excel") || type.includes("csv")) return "\uD83D\uDCCA";
    return "\uD83D\uDCC1";
  };

  // Auto-expand first unlocked incomplete phase
  useEffect(() => {
    const idx = project.phases.findIndex((ph, i) => isPhaseUnlocked(i) && ph.tasks.some((t) => !t.completed));
    if (idx >= 0) setExpandedPhase(project.phases[idx].id);
    else if (project.phases.every((ph) => ph.tasks.every((t) => t.completed))) setExpandedPhase(project.phases[project.phases.length - 1].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.phases.map((ph) => ph.tasks.filter((t) => t.completed).length).join(",")]);

  return (
    <div style={styles.container}>
      <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileSelected} />
      {/* Top Bar */}
      <div style={styles.detailHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button style={styles.backBtn} onClick={onBack}>{Icons.back}<span>ALL PROJECTS</span></button>
          <img src={LOGO_IMAGE} alt="Deus X" style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 0, opacity: 0.5 }} />
        </div>
        <div style={styles.searchBox}>
          {Icons.search}
          <input style={styles.searchInput} placeholder="Filter tasks..." value={filterText} onChange={(e) => setFilterText(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setViewMode("list")} style={{ ...styles.viewToggleBtn, ...(viewMode === "list" ? styles.viewToggleActive : {}) }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 3h12M1 7h12M1 11h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span>List</span>
          </button>
          <button onClick={() => setViewMode("kanban")} style={{ ...styles.viewToggleBtn, ...(viewMode === "kanban" ? styles.viewToggleActive : {}) }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="3.5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="5.25" y="1" width="3.5" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9.5" y="1" width="3.5" height="10" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>
            <span>Kanban</span>
          </button>
          <button onClick={() => setViewMode("pricing")} style={{ ...styles.viewToggleBtn, ...(viewMode === "pricing" ? styles.viewToggleActive : {}) }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M4.5 3.5h3.75a1.75 1.75 0 010 3.5H4M4.5 7h4.25a1.75 1.75 0 010 3.5H4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>Pricing</span>
          </button>
          <button onClick={() => setViewMode("wx")} style={{ ...styles.viewToggleBtn, ...(viewMode === "wx" ? styles.viewToggleActive : {}) }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/><path d="M2 11c0-2 2.5-3.5 5-3.5s5 1.5 5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M10.5 3.5l1-1M3.5 3.5l-1-1M7 1V0M11 6h1M2 6H1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
            <span>WX</span>
          </button>
          <button onClick={() => setViewMode("airspace")} style={{ ...styles.viewToggleBtn, ...(viewMode === "airspace" ? styles.viewToggleActive : {}) }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1l5 4v6H2V5l5-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M1 13h12M4 8h6M5.5 5.5h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
            <span>Airspace</span>
          </button>
          <button onClick={() => setViewMode("map")} style={{ ...styles.viewToggleBtn, ...(viewMode === "map" ? styles.viewToggleActive : {}) }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polygon points="1,2 5,4 9,2 13,4 13,12 9,10 5,12 1,10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><line x1="5" y1="4" x2="5" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/><line x1="9" y1="2" x2="9" y2="10" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
            <span>Map</span>
          </button>
          <button onClick={() => setViewMode("network")} style={{ ...styles.viewToggleBtn, ...(viewMode === "network" ? styles.viewToggleActive : {}) }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M2.9 2.9l1.1 1.1M9 9l1.1 1.1M9 4L7.9 5.1M4 9L2.9 10.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span>Network</span>
          </button>
          <button onClick={() => setViewMode("stakeholders")} style={{ ...styles.viewToggleBtn, ...(viewMode === "stakeholders" ? styles.viewToggleActive : {}) }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 12c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="11" cy="4.5" r="1.8" stroke="currentColor" strokeWidth="1.1"/><path d="M11 8.5c1.8 0 3 1 3 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
            <span>Contacts</span>
          </button>
          <button onClick={() => setViewMode("settings")} style={{ ...styles.viewToggleBtn, ...(viewMode === "settings" ? styles.viewToggleActive : {}) }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.9 2.9l1.1 1.1M10 10l1.1 1.1M10 4L8.9 5.1M4 10L2.9 11.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
            <span>Settings</span>
          </button>
        </div>
      </div>
      {/* Project Info */}
      <div style={styles.projectInfo}>
        <div>
          <h1 style={styles.projectTitle}>{project.name}</h1>
          <div style={styles.projectMeta}>
            {project.client && <span>{project.client}</span>}
            {project.site && <><span style={{ opacity: 0.5 }}> · </span><span>{project.site}</span></>}
          </div>
        </div>
        <div style={styles.overallRing}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="#E53935" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(overallPct / 100) * 213.6} 213.6`} transform="rotate(-90 40 40)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
          </svg>
          <div style={styles.ringText}>
            <span style={styles.ringPct}>{overallPct}%</span>
            <span style={styles.ringLabel}>COMPLETE</span>
          </div>
        </div>
      </div>
      {/* Phase Timeline */}
      <div style={styles.timeline}>
        {project.phases.map((phase, pIdx) => {
          const pDone = phase.tasks.filter((t) => t.completed).length;
          const pTotal = phase.tasks.length;
          const pPct = pTotal ? Math.round((pDone / pTotal) * 100) : 0;
          const isComplete = pPct === 100;
          const locked = !isPhaseUnlocked(pIdx);
          const dot = locked ? { border: "2px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }
            : isComplete ? { background: phase.color, border: "none" }
            : pDone > 0 ? { border: `2px solid ${phase.color}` } : {};
          return (
            <div key={phase.id} style={styles.timelineDot}>
              <div style={{ ...styles.dot, ...dot }}>
                {locked && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M3 5V4a3 3 0 016 0v1M2 5h8v5.5a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2"/></svg>}
              </div>
              <div style={{ ...styles.dotLabel, color: locked ? "rgba(255,255,255,0.15)" : isComplete ? phase.color : "rgba(255,255,255,0.4)" }}>{pIdx + 1}</div>
            </div>
          );
        })}
        <div style={styles.timelineLine}><div style={{ ...styles.timelineLineFill, width: `${overallPct}%` }} /></div>
      </div>
      {/* View Mode Content */}
      {viewMode === "map" ? (
        <SiteMapper
          project={project}
          cachedData={project.mapCache || null}
          onCacheUpdate={(data) => onUpdate((p) => ({ ...p, mapCache: data }))}
        />
      ) : viewMode === "airspace" ? (
        <AirspaceIntel
          defaultLocation={project.site || ""}
          cachedData={project.airspaceCache || null}
          onCacheUpdate={(data) => onUpdate((p) => ({ ...p, airspaceCache: data }))}
        />
      ) : viewMode === "network" ? (
        <ConnectivityView
          project={project}
          cachedData={project.networkCache || null}
          onCacheUpdate={(data) => onUpdate((p) => ({ ...p, networkCache: data }))}
        />
      ) : viewMode === "wx" ? (
        <WeatherIntel
          defaultLocation={project.site || ""}
          cachedData={project.weatherCache || null}
          onCacheUpdate={(data) => onUpdate((p) => ({ ...p, weatherCache: data }))}
        />
      ) : viewMode === "pricing" ? (
        <PricingView quantities={quantities} setQuantities={setQuantities} project={project} equipSelections={equipSelections} />
      ) : viewMode === "settings" ? (
        <ProjectSettingsView project={project} onUpdate={onUpdate} />
      ) : viewMode === "stakeholders" ? (
        <StakeholdersView project={project} onUpdate={onUpdate} />
      ) : viewMode === "kanban" ? (
        <KanbanView project={project} isPhaseUnlocked={isPhaseUnlocked} />
      ) : (
      <div style={{ display: "flex", overflow: "hidden", height: "calc(100vh - 230px)", marginTop: 8 }}>

        {/* ── LEFT: Phase sidebar ── */}
        <div style={{ width: 232, flexShrink: 0, overflowY: "auto", borderRight: "1px solid rgba(255,255,255,0.07)", background: "rgba(6,6,8,0.6)" }}>
          {project.phases.map((phase, pIdx) => {
            const pDone  = phase.tasks.filter((t) => t.completed).length;
            const pTotal = phase.tasks.length;
            const pPct   = pTotal ? Math.round((pDone / pTotal) * 100) : 0;
            const locked = !isPhaseUnlocked(pIdx);
            const status = getPhaseStatus(pIdx);
            const isSelected = expandedPhase === phase.id;
            const accent = status === "complete" ? "#22C55E" : phase.color;
            return (
              <div key={phase.id}
                onClick={() => !locked && setExpandedPhase(phase.id)}
                style={{ padding: "14px 16px", borderLeft: `3px solid ${isSelected ? accent : locked ? "rgba(255,255,255,0.06)" : accent + "33"}`, borderBottom: "1px solid rgba(255,255,255,0.05)", background: isSelected ? `${accent}10` : "transparent", cursor: locked ? "default" : "pointer", opacity: locked ? 0.38 : 1, transition: "all 0.15s" }}>
                {/* Phase number + pct */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: locked ? "rgba(255,255,255,0.2)" : accent, textTransform: "uppercase" }}>
                    Phase {pIdx + 1}
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, color: accent }}>
                    {locked ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 5V4a3 3 0 016 0v1M2 5h8v5.5a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2"/></svg> : status === "complete" ? "✓" : `${pPct}%`}
                  </span>
                </div>
                {/* Phase title */}
                <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? "#fff" : "rgba(255,255,255,0.68)", lineHeight: 1.3, marginBottom: 8 }}>{phase.title}</div>
                {/* Progress bar */}
                {!locked && (
                  <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ height: "100%", width: `${pPct}%`, background: accent, borderRadius: 2, transition: "width 0.4s ease" }} />
                  </div>
                )}
                {/* Stats */}
                <div style={{ display: "flex", gap: 10, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "rgba(255,255,255,0.28)" }}>
                  <span>{pDone}/{pTotal} tasks</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── RIGHT: Task detail ── */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!expandedPhase && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.15)", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, letterSpacing: 2 }}>
              SELECT A PHASE
            </div>
          )}
          {expandedPhase && (() => {
        const pIdx = project.phases.findIndex((ph) => ph.id === expandedPhase);
        if (pIdx < 0) return null;
        const phase = project.phases[pIdx];
        if (!isPhaseUnlocked(pIdx)) return null;
        const filteredTasks = filterText
          ? phase.tasks.filter((t) => t.title.toLowerCase().includes(filterText.toLowerCase()) || t.subtasks.some((s) => s.toLowerCase().includes(filterText.toLowerCase())))
          : phase.tasks;
        return (
          <div style={{ ...styles.phaseDetailPanel, borderColor: phase.color, animation: "fadeSlideIn 0.3s ease both" }}>
            <div style={styles.phaseDetailHeader}>
              <div>
                <div style={{ ...styles.phaseLabel, color: phase.color }}>{phase.phase}: {phase.title}</div>
                <div style={styles.phaseDesc}>{phase.description}</div>
              </div>
              <button style={styles.phaseDetailClose} onClick={() => setExpandedPhase(null)}>{Icons.close}</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 12 }}>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>PHASE OWNER</label>
              {teamMembers.length > 0 ? (
                <select style={{ ...styles.fieldInput, flex: 1, maxWidth: 260, color: phase.owner ? "#f1f1f1" : "rgba(255,255,255,0.3)" }} value={phase.owner || ""} onChange={(e) => updatePhaseOwner(pIdx, e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {teamMembers.map((m) => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ""}</option>)}
                </select>
              ) : (
                <input style={{ ...styles.fieldInput, flex: 1, maxWidth: 260 }} placeholder="Assign phase owner..." value={phase.owner || ""} onChange={(e) => updatePhaseOwner(pIdx, e.target.value)} />
              )}
            </div>
            {filteredTasks.map((task, tIdx) => {
              const realIdx = phase.tasks.findIndex((t) => t.id === task.id);
              const isExpanded = expandedTask === task.id;
              const subDone = getEffectiveSubDone(task);
              return (
                <div key={task.id} style={{ ...styles.taskCard, borderLeftColor: task.completed ? phase.color : "rgba(255,255,255,0.08)", animation: `fadeSlideIn 0.25s ease ${tIdx * 0.03}s both` }}>
                  <div style={styles.taskTop}>
                    <button style={{ ...styles.checkbox, ...(task.completed ? { background: phase.color, borderColor: phase.color } : {}) }} onClick={() => toggleTask(pIdx, realIdx)}>
                      {task.completed && Icons.check}
                    </button>
                    <div style={styles.taskInfo} onClick={() => editingTaskId !== task.id && setExpandedTask(isExpanded ? null : task.id)}>
                      <div style={{ ...styles.taskTitle, ...(task.completed ? { textDecoration: "line-through", opacity: 0.5 } : {}), display: "flex", alignItems: "center", gap: 6 }}>
                        {editingTaskId === task.id ? (
                          <input
                            autoFocus
                            style={{ ...styles.fieldInput, fontSize: 13, fontWeight: 600, flex: 1, padding: "3px 7px" }}
                            value={editingTaskTitle}
                            onChange={(e) => setEditingTaskTitle(e.target.value)}
                            onBlur={() => commitTaskTitle(pIdx, realIdx)}
                            onKeyDown={(e) => { if (e.key === "Enter") commitTaskTitle(pIdx, realIdx); if (e.key === "Escape") setEditingTaskId(null); }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <>
                            <span>{task.title}</span>
                            <button onClick={(e) => { e.stopPropagation(); setEditingTaskId(task.id); setEditingTaskTitle(task.title); }} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.2)", padding: "0 2px", lineHeight: 1, flexShrink: 0 }} title="Edit title">
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          </>
                        )}
                      </div>
                      <div style={styles.taskBadges}>
                        <span style={styles.subtaskBadge}>{subDone}/{getEffectiveSubTotal(task)} items</span>
                        {task.assignee && <span style={styles.assigneeBadge}>{task.assignee}</span>}
                        {task.dueDate && <span style={styles.dueDateBadge}>{Icons.calendar} {task.dueDate}</span>}
                        {(task.attachments || []).length > 0 && <span style={styles.attachBadge}>{Icons.paperclip} {task.attachments.length}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ ...styles.chevronSm, transform: isExpanded ? "rotate(90deg)" : "rotate(0)" }} onClick={() => setExpandedTask(isExpanded ? null : task.id)}>{Icons.chevron}</div>
                      {task.custom && <button onClick={(e) => { e.stopPropagation(); deleteCustomTask(pIdx, realIdx); }} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, cursor: "pointer", color: "rgba(255,255,255,0.25)", padding: "3px 6px", fontSize: 10, lineHeight: 1 }} title="Delete task">✕</button>}
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={styles.taskExpanded}>
                      {task.equipmentPicker && (() => {
                        const categories = [...new Set(PRICING_CATALOG.filter(i => i.category !== "Installation & Services").map(i => i.category))];
                        const sels = task.equipmentSelections || {};
                        return (
                          <div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12, letterSpacing: 0.5 }}>SELECT EQUIPMENT &amp; QUANTITIES — no pricing shown here, use Pricing Tool for quotes</div>
                            {categories.map(cat => {
                              const items = PRICING_CATALOG.filter(i => i.category === cat);
                              return (
                                <div key={cat} style={{ marginBottom: 14 }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: phase.color, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${phase.color}33` }}>{cat}</div>
                                  {items.map(item => {
                                    const qty = sels[item.name] || 0;
                                    return (
                                      <div key={item.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                        <span style={{ fontSize: 12, color: qty > 0 ? "#fff" : "rgba(255,255,255,0.55)", flex: 1 }}>{item.name}</span>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                          <button onClick={() => updateEquipmentSelection(pIdx, realIdx, item.name, qty - 1)} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                                          <span style={{ fontSize: 13, fontWeight: 600, color: qty > 0 ? phase.color : "rgba(255,255,255,0.3)", minWidth: 20, textAlign: "center" }}>{qty}</span>
                                          <button onClick={() => updateEquipmentSelection(pIdx, realIdx, item.name, qty + 1)} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                            {Object.keys(sels).length > 0 && (
                              <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 6 }}>SELECTED</div>
                                {Object.entries(sels).filter(([,q]) => q > 0).map(([name, qty]) => (
                                  <div key={name} style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                                    <span>{name}</span><span style={{ color: phase.color, fontWeight: 700 }}>×{qty}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <div style={styles.subtaskList}>
                        {!task.equipmentPicker && task.subtasks.map((sub, sIdx) => (
                          <React.Fragment key={sIdx}>
                            {task.eitherOr && sIdx === task.eitherOr[0] && task.eitherOrLabel && (
                              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0 2px 12px" }}>
                                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
                                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>{task.eitherOrLabel}</span>
                                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
                              </div>
                            )}
                            {task.eitherOr && sIdx > task.eitherOr[0] && sIdx <= task.eitherOr[task.eitherOr.length - 1] && (
                              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0 2px 12px" }}>
                                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
                                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>or</span>
                                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
                              </div>
                            )}
                            <div style={{ ...styles.subtaskRow, position: "relative" }} onClick={() => editingSubtask?.taskId !== task.id || editingSubtask?.sIdx !== sIdx ? toggleSubtask(pIdx, realIdx, sIdx) : null}>
                              <div style={{ ...styles.subCheck, ...(task.subtaskStatus[sIdx] ? { background: phase.color, borderColor: phase.color } : {}) }} onClick={(e) => { e.stopPropagation(); toggleSubtask(pIdx, realIdx, sIdx); }}>
                                {task.subtaskStatus[sIdx] && <svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M2 7.5L5.5 11L12 3" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                              </div>
                              {editingSubtask?.taskId === task.id && editingSubtask?.sIdx === sIdx ? (
                                <input
                                  autoFocus
                                  style={{ ...styles.fieldInput, flex: 1, fontSize: 12, padding: "2px 7px" }}
                                  value={editingSubtaskText}
                                  onChange={(e) => setEditingSubtaskText(e.target.value)}
                                  onBlur={() => commitSubtask(pIdx, realIdx, sIdx)}
                                  onKeyDown={(e) => { if (e.key === "Enter") commitSubtask(pIdx, realIdx, sIdx); if (e.key === "Escape") setEditingSubtask(null); }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <>
                                  <span style={{ ...styles.subtaskText, flex: 1, ...(task.subtaskStatus[sIdx] ? { textDecoration: "line-through", opacity: 0.4 } : {}) }}>{sub}</span>
                                  <button onClick={(e) => { e.stopPropagation(); setEditingSubtask({ taskId: task.id, sIdx }); setEditingSubtaskText(sub); }} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.18)", padding: "0 3px", lineHeight: 1, flexShrink: 0 }} title="Edit subtask">
                                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); setOpenSubtaskNote(openSubtaskNote?.taskId === task.id && openSubtaskNote?.sIdx === sIdx ? null : { taskId: task.id, sIdx }); }} style={{ background: "none", border: "none", cursor: "pointer", color: (task.subtaskNotes || [])[sIdx] ? phase.color : "rgba(255,255,255,0.18)", padding: "0 3px", lineHeight: 1, flexShrink: 0 }} title="Add note">
                                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 2h8v7H7l-2 2V9H2V2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  </button>
                                </>
                              )}
                              {task.custom && editingSubtask?.taskId !== task.id && <button onClick={(e) => { e.stopPropagation(); deleteSubtask(pIdx, realIdx, sIdx); }} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.2)", padding: "0 4px", fontSize: 10, lineHeight: 1 }} title="Remove subtask">✕</button>}
                            </div>
                            {openSubtaskNote?.taskId === task.id && openSubtaskNote?.sIdx === sIdx && (
                              <div style={{ marginLeft: 28, marginBottom: 6, marginTop: 2 }} onClick={(e) => e.stopPropagation()}>
                                <textarea
                                  autoFocus
                                  placeholder="Add a note for this subtask..."
                                  value={(task.subtaskNotes || [])[sIdx] || ""}
                                  onChange={(e) => updateSubtaskNote(pIdx, realIdx, sIdx, e.target.value)}
                                  style={{ ...styles.fieldInput, width: "100%", minHeight: 52, resize: "vertical", fontSize: 11, color: "rgba(255,255,255,0.7)", boxSizing: "border-box" }}
                                />
                              </div>
                            )}
                            {task.trackDates && task.subtaskStatus[sIdx] && (() => {
                              const tracking = (task.orderTracking || [])[sIdx] || { ordered: "", shipped: "", eta: "", delivered: "", receivedBy: "" };
                              return (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 6, marginLeft: 28, marginBottom: 8, marginTop: 2 }}>
                                  {["ordered", "shipped", "eta", "delivered"].map((f) => (
                                    <div key={f}>
                                      <label style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2, display: "block" }}>{f === "eta" ? "Arrival ETA" : `Date ${f.charAt(0).toUpperCase() + f.slice(1)}`}</label>
                                      <input style={styles.fieldInput} type="date" value={tracking[f] || ""} onClick={(e) => e.stopPropagation()} onChange={(e) => updateOrderTracking(pIdx, realIdx, sIdx, f, e.target.value)} />
                                    </div>
                                  ))}
                                  <div>
                                    <label style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2, display: "block" }}>Received By</label>
                                    <input style={styles.fieldInput} type="text" placeholder="Name / Signature" value={tracking.receivedBy || ""} onClick={(e) => e.stopPropagation()} onChange={(e) => updateOrderTracking(pIdx, realIdx, sIdx, "receivedBy", e.target.value)} />
                                  </div>
                                </div>
                              );
                            })()}
                          </React.Fragment>
                        ))}
                      </div>
                      {task.stakeholders && !task.equipmentPicker && (
                        <div style={{ marginTop: 12 }}>
                          <label style={{ ...styles.fieldLabelSm, marginBottom: 8, display: "block" }}>STAKEHOLDER CONTACTS</label>
                          {(task.stakeholderContacts || Array.from({ length: 5 }, () => ({ name: "", email: "", phone: "" }))).map((contact, cIdx) => (
                            <div key={cIdx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
                              <input style={styles.fieldInput} placeholder={`Name ${cIdx + 1}`} value={contact.name} onChange={(e) => updateStakeholder(pIdx, realIdx, cIdx, "name", e.target.value)} onClick={(e) => e.stopPropagation()} />
                              <input style={styles.fieldInput} placeholder="Email" value={contact.email} onChange={(e) => updateStakeholder(pIdx, realIdx, cIdx, "email", e.target.value)} onClick={(e) => e.stopPropagation()} />
                              <input style={styles.fieldInput} placeholder="Phone" value={contact.phone} onChange={(e) => updateStakeholder(pIdx, realIdx, cIdx, "phone", e.target.value)} onClick={(e) => e.stopPropagation()} />
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Add Subtask */}
                      {!task.equipmentPicker && <div style={{ marginTop: 8, marginBottom: 4 }}>
                        {addingSubtaskTo === task.id ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 0" }}>
                            <input autoFocus style={{ ...styles.fieldInput, flex: 1 }} placeholder="New subtask..." value={newSubtaskText} onChange={(e) => setNewSubtaskText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSubtask(pIdx, realIdx); if (e.key === "Escape") { setAddingSubtaskTo(null); setNewSubtaskText(""); } }} />
                            <button style={styles.primaryBtn} onClick={() => addSubtask(pIdx, realIdx)}>ADD</button>
                            <button style={styles.ghostBtn} onClick={() => { setAddingSubtaskTo(null); setNewSubtaskText(""); }}>✕</button>
                          </div>
                        ) : (
                          <button style={{ background: "none", border: "1px dashed rgba(255,255,255,0.15)", borderRadius: 6, color: "rgba(255,255,255,0.35)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: "5px 12px", cursor: "pointer", width: "100%", textAlign: "left" }} onClick={() => { setAddingSubtaskTo(task.id); setNewSubtaskText(""); }}>+ Add subtask</button>
                        )}
                      </div>}
                      <div style={styles.taskFields}>
                        <div style={styles.fieldRow}>
                          <label style={styles.fieldLabelSm}>ASSIGNEE</label>
                          {teamMembers.length > 0 ? (
                            <select style={{ ...styles.fieldInput, color: task.assignee ? "#f1f1f1" : "rgba(255,255,255,0.3)" }} value={task.assignee} onChange={(e) => updateTaskField(pIdx, realIdx, "assignee", e.target.value)}>
                              <option value="">— Unassigned —</option>
                              {teamMembers.map((m) => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ""}</option>)}
                            </select>
                          ) : (
                            <input style={styles.fieldInput} placeholder="Who is responsible?" value={task.assignee} onChange={(e) => updateTaskField(pIdx, realIdx, "assignee", e.target.value)} />
                          )}
                        </div>
                        <div style={styles.fieldRow}>
                          <label style={styles.fieldLabelSm}>DUE DATE</label>
                          <input style={styles.fieldInput} type="date" value={task.dueDate} onChange={(e) => updateTaskField(pIdx, realIdx, "dueDate", e.target.value)} />
                        </div>
                        <div style={{ ...styles.fieldRow, gridColumn: "1 / -1" }}>
                          <label style={styles.fieldLabelSm}>NOTES</label>
                          <textarea style={{ ...styles.fieldInput, minHeight: 60, resize: "vertical" }} placeholder="Add notes..." value={task.notes} onChange={(e) => updateTaskField(pIdx, realIdx, "notes", e.target.value)} />
                        </div>
                      </div>
                      <div style={styles.attachSection}>
                        <div style={styles.attachHeader}>
                          <label style={styles.fieldLabelSm}>ATTACHMENTS</label>
                          <button style={styles.attachBtn} onClick={() => handleAttachClick(pIdx, realIdx)}>{Icons.paperclip}<span>Attach File</span></button>
                        </div>
                        <div
                          onDragOver={(e) => { e.preventDefault(); setDragOverTask(pIdx + "-" + realIdx); }}
                          onDragLeave={() => setDragOverTask(null)}
                          onDrop={(e) => { e.preventDefault(); setDragOverTask(null); Array.from(e.dataTransfer.files).forEach(f => attachFile(pIdx, realIdx, f)); }}
                          style={{ border: "2px dashed " + (dragOverTask === pIdx + "-" + realIdx ? phase.color : "rgba(255,255,255,0.08)"), borderRadius: 6, padding: "8px 10px", minHeight: 36, transition: "border-color 0.15s", background: dragOverTask === pIdx + "-" + realIdx ? phase.color + "10" : "transparent" }}
                        >
                        {(task.attachments || []).length === 0 ? (
                          <div style={{ ...styles.attachEmpty, textAlign: "center", padding: "6px 0" }}>Drop files here or click Attach File</div>
                        ) : (
                          <div style={styles.attachList}>
                            {task.attachments.map((att) => (
                              <div key={att.id} style={styles.attachItem}>
                                <div style={styles.attachFileIcon}>{getFileIcon(att.type)}</div>
                                <div style={styles.attachInfo}>
                                  <div style={styles.attachName}>{att.name}</div>
                                  <div style={styles.attachMeta}>{formatFileSize(att.size)}</div>
                                </div>
                                <div style={styles.attachActions}>
                                  <button style={styles.attachActionBtn} onClick={() => downloadAttachment(att)} title="Download">{Icons.download}</button>
                                  <button style={{ ...styles.attachActionBtn, color: "rgba(255,255,255,0.25)" }} onClick={() => removeAttachment(pIdx, realIdx, att.id)} title="Remove">{Icons.close}</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Add Custom Task */}
            <div style={{ marginTop: 12 }}>
              {addingTaskToPhase === pIdx ? (
                <div style={{ background: "rgba(30,30,34,0.9)", border: "1px solid rgba(230,57,70,0.3)", borderRadius: 8, padding: "14px 16px", animation: "fadeSlideIn 0.2s ease" }}>
                  <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, color: "#e63946", letterSpacing: 1.5, marginBottom: 10 }}>NEW TASK</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={styles.fieldLabelSm}>TASK TITLE *</label>
                      <input autoFocus style={styles.fieldInput} placeholder="Task name..." value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustomTask(pIdx); if (e.key === "Escape") { setAddingTaskToPhase(null); setNewTaskTitle(""); } }} />
                    </div>
                    <div>
                      <label style={styles.fieldLabelSm}>ASSIGN TO</label>
                      {teamMembers.length > 0 ? (
                        <select style={{ ...styles.fieldInput, color: newTaskAssignee ? "#f1f1f1" : "rgba(255,255,255,0.3)" }} value={newTaskAssignee} onChange={(e) => setNewTaskAssignee(e.target.value)}>
                          <option value="">— Unassigned —</option>
                          {teamMembers.map((m) => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ""}</option>)}
                        </select>
                      ) : (
                        <input style={styles.fieldInput} placeholder="Assignee name..." value={newTaskAssignee} onChange={(e) => setNewTaskAssignee(e.target.value)} />
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button style={styles.ghostBtn} onClick={() => { setAddingTaskToPhase(null); setNewTaskTitle(""); setNewTaskAssignee(""); }}>CANCEL</button>
                    <button style={{ ...styles.primaryBtn, opacity: newTaskTitle.trim() ? 1 : 0.4 }} onClick={() => addCustomTask(pIdx)}>ADD TASK</button>
                  </div>
                </div>
              ) : (
                <button style={{ width: "100%", background: "none", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 8, color: "rgba(255,255,255,0.3)", fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 1, padding: "10px 0", cursor: "pointer", transition: "all 0.15s" }} onClick={() => { setAddingTaskToPhase(pIdx); setNewTaskTitle(""); setNewTaskAssignee(""); }}>
                  + ADD TASK
                </button>
              )}
            </div>
          </div>
        );
          })()}
        </div>
      </div>
      )}
    </div>
  );
}

// ─── KANBAN VIEW ──────────────────────────────────────────────────────────
function KanbanView({ project, isPhaseUnlocked }) {
  const columns = [
    { key: "not_started", label: "Not Started", color: "rgba(255,255,255,0.25)" },
    { key: "in_progress", label: "In Progress", color: "#F59E0B" },
    { key: "complete", label: "Complete", color: "#22C55E" },
  ];
  const currentPhaseIdx = project.phases.findIndex((ph, i) => isPhaseUnlocked(i) && ph.tasks.some((t) => !t.completed));
  const allTasks = [];
  project.phases.forEach((phase, pIdx) => {
    phase.tasks.forEach((task) => {
      const subDone = task.subtaskStatus.filter(Boolean).length;
      const subTotal = task.subtasks.length;
      let status = "not_started";
      if (task.completed) status = "complete";
      else if (pIdx === currentPhaseIdx) status = "in_progress";
      else if (subDone > 0) status = "in_progress";
      allTasks.push({ ...task, phase, pIdx, subDone, subTotal, status });
    });
  });
  return (
    <div style={styles.kanbanBoard}>
      {columns.map((col) => {
        const colTasks = allTasks.filter((t) => t.status === col.key);
        return (
          <div key={col.key} style={styles.kanbanColumn}>
            <div style={styles.kanbanColumnHeader}>
              <div style={{ ...styles.kanbanColumnDot, background: col.color }} />
              <span style={styles.kanbanColumnTitle}>{col.label}</span>
              <span style={styles.kanbanColumnCount}>{colTasks.length}</span>
            </div>
            <div style={styles.kanbanColumnBody}>
              {colTasks.map((task) => (
                <div key={task.id} style={{ ...styles.kanbanCard, borderLeftColor: task.phase.color }}>
                  <div style={styles.kanbanCardPhase}>{task.phase.title}</div>
                  <div style={styles.kanbanCardTitle}>{task.title}</div>
                  <div style={styles.kanbanCardMeta}>
                    <div style={styles.kanbanProgress}>
                      <div style={{ ...styles.kanbanProgressBar, width: `${task.subTotal ? (task.subDone / task.subTotal) * 100 : 0}%`, background: task.phase.color }} />
                    </div>
                    <span style={styles.kanbanCardSub}>{task.subDone}/{task.subTotal}</span>
                  </div>
                  <div style={styles.kanbanCardFooter}>
                    {task.assignee && <span style={styles.kanbanCardAssignee}>{task.assignee}</span>}
                    {task.dueDate && <span style={styles.kanbanCardDue}>{Icons.calendar} {task.dueDate}</span>}
                  </div>
                </div>
              ))}
              {colTasks.length === 0 && <div style={styles.kanbanEmpty}>No tasks</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Quote PDF helpers ─────────────────────────────────────────────────────

function loadImgAsDataUrl(src) {
  return fetch(src)
    .then(r => r.blob())
    .then(blob => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    }))
    .catch(() => null);
}

function makeQuoteNumber() {
  const stored = localStorage.getItem("dxd:quoteSeq");
  const seq = (parseInt(stored) || 1000) + 1;
  localStorage.setItem("dxd:quoteSeq", seq);
  const y = new Date().getFullYear();
  return `DXD-${y}-${seq}`;
}

async function generateQuotePDF({ win, project, quantities, margin, customItems, manualPrices, paymentMode, contactName, contactPhone, contactEmail }) {
  const logoUrl    = await loadImgAsDataUrl(LOGO_IMAGE);
  const bgUrl      = await loadImgAsDataUrl("/images/bg-quote.jpg");
  const mult       = 1 + (margin / 100); // e.g. 1.30 for 30%
  const pdfPayMonths = paymentMode === "monthly12" ? 12 : paymentMode === "monthly24" ? 24 : paymentMode === "monthly36" ? 36 : null;
  const pdfDispPrice = (baseCustomerPrice) => pdfPayMonths
    ? Math.round((baseCustomerPrice / pdfPayMonths) * 100) / 100
    : baseCustomerPrice;

  const quoteNum = makeQuoteNumber();
  const today    = new Date();
  const fmt      = (d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const dateStr  = fmt(today);
  const expDate  = new Date(today); expDate.setDate(expDate.getDate() + 30);
  const expStr   = fmt(expDate);

  // Build line items grouped by category — only qty > 0
  const cats = {};
  PRICING_CATALOG.forEach((item, idx) => {
    const qty = quantities[idx] || 0;
    if (!qty) return;
    if (!cats[item.category]) cats[item.category] = [];
    cats[item.category].push({ ...item, qty, _idx: idx });
  });

  let grandTotal = 0;
  let hasTBD     = false;
  let itemsHTML  = "";

  const fmtUSD = (n) => n.toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2});

  Object.entries(cats).forEach(([cat, items]) => {
    itemsHTML += `<tr class="cat-row"><td colspan="4" class="cat-label">${cat}</td></tr>`;
    items.forEach((item) => {
      // Manual-price items use user-entered value; others use cost × margin — then apply payment mode
      const baseCp    = item.manualPrice
        ? (parseFloat((manualPrices || {})[item._idx]) || null)
        : (item.cost ? Math.round(item.cost * mult * 100) / 100 : null);
      const unitPrice = baseCp !== null ? pdfDispPrice(baseCp) : null;
      const lineTotal = unitPrice ? unitPrice * item.qty : null;
      if (lineTotal) grandTotal += lineTotal; else hasTBD = true;
      itemsHTML += `
        <tr class="line-item">
          <td class="item-description">${item.name}</td>
          <td class="item-qty">${item.qty}</td>
          <td class="item-rate">${unitPrice ? "$" + fmtUSD(unitPrice) : "<span class='tbd'>TBD</span>"}</td>
          <td class="item-amount">${lineTotal ? "$" + fmtUSD(lineTotal) : "<span class='tbd'>TBD</span>"}</td>
        </tr>`;
    });
  });

  // Custom items — appended as their own "Custom Items" category
  if (customItems && customItems.length > 0) {
    const activeCustom = customItems.filter(i => i.qty > 0);
    if (activeCustom.length > 0) {
      itemsHTML += `<tr class="cat-row"><td colspan="4" class="cat-label">Custom Items</td></tr>`;
      activeCustom.forEach((item) => {
        const unitPrice = pdfDispPrice(Math.round(item.cost * mult * 100) / 100);
        const lineTotal = unitPrice * item.qty;
        grandTotal += lineTotal;
        itemsHTML += `
          <tr class="line-item">
            <td class="item-description">${item.name}</td>
            <td class="item-qty">${item.qty}</td>
            <td class="item-rate">$${fmtUSD(unitPrice)}</td>
            <td class="item-amount">$${fmtUSD(lineTotal)}</td>
          </tr>`;
      });
    }
  }

  const logoTag = logoUrl
    ? `<img src="${logoUrl}" alt="DXD" style="width:54px;height:54px;object-fit:contain;display:block;margin-bottom:12px;">`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Deus X Defense - ${quoteNum}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
    html,body{font-family:'Courier New',monospace;background:#0a0a0a;padding:0;margin:0;min-height:100%}
    .print-btn{display:block;margin:0 auto 30px;padding:12px 24px;background:#c41e3a;color:#fff;border:none;font-family:'Courier New',monospace;font-size:12px;font-weight:700;letter-spacing:2px;cursor:pointer;text-transform:uppercase;position:relative;z-index:3}
    .print-btn:hover{background:#a01830}
    .container{max-width:900px;margin:0 auto;border-left:6px solid #c41e3a;box-shadow:0 8px 40px rgba(0,0,0,.8);position:relative;overflow:hidden;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    .print-wrap{padding:40px 20px}
    .bg-img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:center top;display:block;z-index:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    .bg-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.68);z-index:1;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    .header{background:linear-gradient(135deg,rgba(42,42,42,0.98),rgba(20,20,20,0.98));padding:40px;border-bottom:3px solid #c41e3a;break-inside:avoid}
    .logo-section{position:relative;z-index:1}
    .logo-title{font-size:28px;font-weight:700;color:#c41e3a;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px}
    .quote-badge{display:inline-block;background:#c41e3a;color:#fff;padding:8px 16px;font-size:11px;font-weight:700;letter-spacing:2px;margin-top:12px;text-transform:uppercase}
    .content{padding:40px;color:#ddd}
    .details-grid{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:40px;padding-bottom:30px;border-bottom:2px solid #333;break-inside:avoid}
    .detail-group{display:flex;flex-direction:column}
    .detail-label{font-size:10px;color:#c41e3a;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}
    .detail-value{font-size:14px;color:#fff;line-height:1.5}
    .detail-value.sm{font-size:12px}
    .items-table{width:100%;border-collapse:collapse;margin-bottom:0}
    .items-table th{font-size:10px;color:#c41e3a;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:10px 8px;border-bottom:1px solid #444;text-align:left}
    .items-table th:not(:first-child){text-align:right}
    .cat-row{break-after:avoid}
    .cat-row td{background:#222;color:#888;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;padding:8px 10px;border-top:1px solid #333;font-weight:700}
    .line-item{break-inside:avoid}
    .line-item td{padding:12px 8px;border-bottom:1px solid #2a2a2a;font-size:13px;vertical-align:middle}
    .item-description{color:#ddd}
    .item-qty,.item-rate{text-align:right;color:#aaa}
    .item-amount{text-align:right;color:#c41e3a;font-weight:700}
    .tbd{color:#c41e3a;font-style:italic}
    .grand-total{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:20px;padding:20px;background:#2a2a2a;border-left:4px solid #c41e3a;margin-top:20px;align-items:center;break-inside:avoid}
    .grand-total-label{grid-column:1;text-align:right;font-size:13px;font-weight:700;color:#c41e3a;text-transform:uppercase}
    .grand-total-amount{text-align:right;font-size:22px;font-weight:700;color:#c41e3a}
    .tbd-note{font-size:10px;color:#c41e3a;font-style:italic;text-align:right;margin-top:4px}
    .terms-section{margin-top:40px;padding:20px;background:#2a2a2a;border-left:4px solid #c41e3a;break-inside:avoid}
    .terms-label{font-size:10px;color:#c41e3a;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px}
    .terms-text{font-size:11px;color:#aaa;line-height:1.6}
    .signature-section{margin-top:50px;padding-top:30px;border-top:2px solid #333;break-inside:avoid}
    .signature-title{font-size:10px;color:#c41e3a;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:30px}
    .signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:60px}
    .signature-block{display:flex;flex-direction:column}
    .signature-line{border-top:1px solid #555;margin-bottom:8px;height:60px}
    .signature-name{font-size:11px;color:#aaa}
    .signature-date{font-size:11px;color:#aaa;margin-top:20px}
    .footer{background:#0f0f0f;padding:20px 40px;border-top:1px solid #333;font-size:10px;color:#666;display:flex;justify-content:space-between;letter-spacing:1px;break-inside:avoid}
    @page{margin:0}
    @media print{body{padding:0}.print-wrap{padding:0}.print-btn{display:none!important}.container{box-shadow:none;max-width:100%}.bg-img{position:absolute;top:0;left:0;width:100%;height:100%}}
  </style>
</head>
<body>
  <div class="print-wrap">
  <button class="print-btn" onclick="window.print()">&#11123; Save as PDF / Print</button>
  <div class="container">
    ${bgUrl ? `<img class="bg-img" src="${bgUrl}" alt="">` : ""}
    <div class="bg-overlay"></div>
    <div style="position:relative;z-index:2">
    <div class="header">
      <div class="logo-section">
        ${logoTag}
        <div class="logo-title">DEUS X DEFENSE</div>
        <div class="quote-badge">&#9679; QUOTE</div>
      </div>
    </div>
    <div class="content">
      <div class="details-grid">
        <div class="detail-group">
          <div class="detail-label">Project Name</div>
          <div class="detail-value">${project?.name || "—"}</div>
        </div>
        <div class="detail-group">
          <div class="detail-label">Quote Number</div>
          <div class="detail-value">${quoteNum}</div>
        </div>
        <div class="detail-group">
          <div class="detail-label">Client Name</div>
          <div class="detail-value">${project?.client || "—"}</div>
        </div>
        <div class="detail-group">
          <div class="detail-label">Date Issued</div>
          <div class="detail-value">${dateStr}</div>
        </div>
        <div class="detail-group">
          <div class="detail-label">Valid Through</div>
          <div class="detail-value">${expStr}</div>
        </div>
        <div class="detail-group">
          <div class="detail-label">Point of Contact</div>
          <div class="detail-value sm">
            ${[contactName, contactPhone, contactEmail].filter(Boolean).join("<br>") || "—"}
          </div>
        </div>
        ${project?.site ? `<div class="detail-group" style="grid-column:1/-1"><div class="detail-label">Site Address</div><div class="detail-value">${project.site}</div></div>` : ""}
      </div>

      <div class="items-section" style="margin-bottom:40px">
        <table class="items-table">
          <thead>
            <tr>
              <th>Item Description</th>
              <th style="text-align:right">Qty</th>
              <th style="text-align:right">Unit Price</th>
              <th style="text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>${itemsHTML}</tbody>
        </table>
        <div class="grand-total">
          <div class="grand-total-label">${pdfPayMonths ? `Monthly Payment (${pdfPayMonths}-Month Term)` : "Total Quote Value"}</div>
          <div></div><div></div>
          <div>
            <div class="grand-total-amount">$${grandTotal.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}${pdfPayMonths ? " / mo" : ""}</div>
            ${pdfPayMonths ? `<div class="tbd-note" style="color:#aaa;font-size:9px;margin-top:3px;">Amortized over ${pdfPayMonths} months · Total value $${(grandTotal * pdfPayMonths).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>` : ""}
            ${hasTBD ? `<div class="tbd-note">+ TBD items not included</div>` : ""}
          </div>
        </div>
      </div>

      <div class="terms-section">
        <div class="terms-label">Quote Terms</div>
        <div class="terms-text">This quote is valid for 30 days from the date of issue (expires ${expStr}). Pricing is subject to change based on site-specific requirements and infrastructure modifications. All installations subject to FAA approval and local regulatory compliance. Prices quoted are pre-tax. Acceptance of this quote constitutes agreement to standard terms of service.</div>
      </div>

      <div class="signature-section">
        <div class="signature-title">Authorized Acceptance</div>
        <div class="signature-grid">
          <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-name">Client Signature</div>
            <div class="signature-date">Date: _______________</div>
          </div>
          <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-name">Printed Name &amp; Title</div>
            <div class="signature-date">Date: _______________</div>
          </div>
        </div>
      </div>
    </div>
    </div>
    <div class="footer" style="position:relative;z-index:2">
      <span>DEUS X DEFENSE &nbsp;|&nbsp; Autonomous Drone Security &amp; Defense Systems</span>
      <span>${quoteNum} &nbsp;|&nbsp; Confidential</span>
    </div>
  </div>
  </div>
  <script>window.addEventListener("load",function(){setTimeout(window.print,800)});</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}


// ─── PRICING VIEW ─────────────────────────────────────────────────────────
function PricingView({ quantities, setQuantities, project, equipSelections = {} }) {
  const [contactName,   setContactName]   = React.useState("");
  const [contactPhone,  setContactPhone]  = React.useState("");
  const [contactEmail,  setContactEmail]  = React.useState("");
  const [generating,    setGenerating]    = React.useState(false);
  const [collapsedCats, setCollapsedCats] = React.useState({});
  const [margin,        setMargin]        = React.useState(30); // default 30%
  const [customItems,   setCustomItems]   = React.useState([]);
  const [newName,       setNewName]       = React.useState("");
  const [newCost,       setNewCost]       = React.useState("");
  const [manualPrices,  setManualPrices]  = React.useState({}); // idx → customer price for manualPrice items
  const [paymentMode,   setPaymentMode]   = React.useState("upfront"); // "upfront" | "monthly12" | "monthly24" | "monthly36"
  const setManualPrice = (idx, val) => setManualPrices(prev => ({ ...prev, [idx]: val }));
  const toggleCat = (cat) => setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }));

  const mult = 1 + (margin / 100);
  const custPrice  = (cost) => Math.round(cost * mult * 100) / 100;
  const payMonths = paymentMode === "monthly12" ? 12 : paymentMode === "monthly24" ? 24 : paymentMode === "monthly36" ? 36 : null;
  const displayPrice = (baseCustomerPrice) => payMonths
    ? Math.round((baseCustomerPrice / payMonths) * 100) / 100
    : baseCustomerPrice;

  const addCustomItem = () => {
    const name = newName.trim();
    const cost = parseFloat(newCost);
    if (!name || isNaN(cost) || cost < 0) return;
    setCustomItems(prev => [...prev, { id: Date.now(), name, cost, qty: 1 }]);
    setNewName(""); setNewCost("");
  };
  const removeCustomItem  = (id) => setCustomItems(prev => prev.filter(i => i.id !== id));
  const setCustomQty      = (id, val) => {
    const v = Math.max(0, parseInt(val) || 0);
    setCustomItems(prev => prev.map(i => i.id === id ? { ...i, qty: v } : i));
  };

  const categories = {};
  PRICING_CATALOG.forEach((item, idx) => {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push({ ...item, idx });
  });
  const catalogTotal  = PRICING_CATALOG.reduce((sum, item, idx) => {
    const qty    = quantities[idx] || 0;
    const cpBase = item.manualPrice ? (parseFloat(manualPrices[idx]) || 0) : custPrice(item.cost);
    return sum + displayPrice(cpBase) * qty;
  }, 0);
  const customTotal   = customItems.reduce((sum, i) => sum + (displayPrice(custPrice(i.cost)) * i.qty), 0);
  const grandTotal    = catalogTotal + customTotal;
  const totalItems    = quantities.reduce((sum, q) => sum + q, 0) + customItems.reduce((sum, i) => sum + i.qty, 0);
  const hasTBD        = PRICING_CATALOG.some((item, idx) => quantities[idx] > 0 && !item.cost);
  const setQty        = (idx, val) => {
    const v = Math.max(0, parseInt(val) || 0);
    setQuantities((prev) => { const n = [...prev]; n[idx] = v; return n; });
  };
  const clearAll = () => { setQuantities(PRICING_CATALOG.map(() => 0)); setCustomItems([]); setManualPrices({}); };

  const handleGeneratePDF = async () => {
    const win = window.open("", "_blank");
    if (!win) { alert("Pop-up blocked — please allow pop-ups for this site and try again."); return; }
    setGenerating(true);
    try {
      await generateQuotePDF({ win, project, quantities, margin, customItems, manualPrices, paymentMode, contactName, contactPhone, contactEmail });
    } catch (e) {
      console.error("PDF generation failed:", e);
      win.close();
      alert("PDF generation failed. Check console for details.");
    } finally {
      setGenerating(false);
    }
  };

  const fieldSt = {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 5, color: "#E8ECF4", fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 12, padding: "8px 12px", outline: "none", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={styles.pricingContainer}>
      {/* Contact info + generate button */}
      <div style={{ background: "rgba(229,57,53,0.05)", border: "1px solid rgba(229,57,53,0.18)", borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'Chakra Petch',sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: 1, color: "#fff", marginBottom: 2 }}>Quote Output</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>Contact info prints on the PDF · project name and site auto-populated</div>
          </div>
          <button
            onClick={handleGeneratePDF}
            disabled={generating || totalItems === 0}
            style={{ display: "flex", alignItems: "center", gap: 8, background: totalItems === 0 ? "rgba(229,57,53,0.2)" : "linear-gradient(135deg,#E53935,#C62828)", color: "#fff", border: "none", borderRadius: 7, padding: "11px 22px", fontFamily: "'Chakra Petch',sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, cursor: totalItems === 0 ? "not-allowed" : "pointer", opacity: totalItems === 0 ? 0.5 : 1, whiteSpace: "nowrap" }}>
            {generating ? (
              <><div style={{ width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />BUILDING PDF...</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3 3 3-3M1 10v1.5A1.5 1.5 0 002.5 13h9A1.5 1.5 0 0013 11.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>DOWNLOAD QUOTE PDF</>
            )}
          </button>
        </div>
        {/* Payment mode toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["upfront","All Upfront"],["monthly12","12-Month / Mo"],["monthly24","24-Month / Mo"],["monthly36","36-Month / Mo"]].map(([val, label]) => (
            <button key={val} onClick={() => setPaymentMode(val)} style={{ flex: 1, padding: "9px 0", fontFamily: "'Chakra Petch',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1, border: "1px solid", borderRadius: 6, cursor: "pointer", transition: "all 0.15s", borderColor: paymentMode === val ? "#E53935" : "rgba(255,255,255,0.12)", background: paymentMode === val ? "rgba(229,57,53,0.18)" : "rgba(255,255,255,0.04)", color: paymentMode === val ? "#E53935" : "rgba(255,255,255,0.45)" }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 140px", gap: 14 }}>
          <div>
            <label style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Contact Name</label>
            <input style={fieldSt} placeholder="e.g. John Smith" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <label style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Phone</label>
            <input style={fieldSt} placeholder="e.g. (214) 555-0100" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </div>
          <div>
            <label style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Email</label>
            <input style={fieldSt} placeholder="e.g. john@company.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
          <div>
            <label style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Margin %</label>
            <div style={{ position: "relative" }}>
              <input
                style={{ ...fieldSt, paddingRight: 28 }}
                type="number" min="0" max="200" step="1"
                value={margin}
                onChange={(e) => setMargin(Math.max(0, parseFloat(e.target.value) || 0))}
              />
              <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "rgba(255,255,255,0.4)", pointerEvents: "none" }}>%</span>
            </div>
          </div>
        </div>
      </div>

      <div style={styles.pricingHeader}>
        <div>
          <h2 style={styles.pricingTitle}>Deployment Quote Builder</h2>
          <p style={styles.pricingSubtitle}>Set quantities to calculate total deployment cost{Object.values(equipSelections || {}).some(q => q > 0) ? <span style={{ color: "#22c55e", marginLeft: 8, fontSize: 11 }}>● synced from Equipment Selection</span> : ""}</p>
        </div>
        <div style={styles.pricingTotal}>
          <span style={styles.pricingTotalLabel}>{payMonths ? `PER MONTH (${payMonths} MO)` : "CUSTOMER TOTAL"}</span>
          <span style={styles.pricingTotalAmount}>${grandTotal.toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2})}{payMonths ? <span style={{fontSize:14,fontWeight:400}}>/mo</span> : ""}</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{totalItems} item{totalItems !== 1 ? "s" : ""} · {margin}% margin{payMonths ? ` · amortized ${payMonths}mo` : ""}</span>
          {hasTBD && <span style={styles.pricingTBDNote}>* Some items pending pricing</span>}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 0 12px" }}>
        <button onClick={clearAll} style={{ ...styles.viewToggleBtn, fontSize: 11 }}>Clear All</button>
      </div>
      {Object.entries(categories).map(([cat, items]) => {
        const catTotal = items.reduce((sum, item) => {
        const cpBase = item.manualPrice ? (parseFloat(manualPrices[item.idx]) || 0) : custPrice(item.cost);
        return sum + displayPrice(cpBase) * (quantities[item.idx] || 0);
      }, 0);
        const isCollapsed = !!collapsedCats[cat];
        const selectedInCat = items.filter(item => (quantities[item.idx] || 0) > 0).length;
        return (
          <div key={cat} style={styles.pricingCategory}>
            <div
              onClick={() => toggleCat(cat)}
              style={{ ...styles.pricingCatHeader, cursor: "pointer", userSelect: "none" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", color: "rgba(255,255,255,0.4)", marginRight: 8 }}>
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={styles.pricingCatName}>{cat}</span>
              {selectedInCat > 0 && (
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#C41E3A", background: "rgba(196,30,58,0.15)", border: "1px solid rgba(196,30,58,0.3)", borderRadius: 10, padding: "1px 8px", marginLeft: 8 }}>
                  {selectedInCat} selected
                </span>
              )}
              <span style={{ ...styles.pricingCatTotal, marginLeft: "auto" }}>{catTotal > 0 ? `$${catTotal.toLocaleString()}` : ""}</span>
            </div>
            {!isCollapsed && items.map((item) => {
              const qty        = quantities[item.idx] || 0;
              const fmt2       = (n) => n.toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2});
              const cpBase     = item.manualPrice ? (parseFloat(manualPrices[item.idx]) || 0) : custPrice(item.cost);
              const cp         = displayPrice(cpBase);
              const lineTotal  = cp * qty;
              return (
                <div key={item.idx} style={styles.pricingRow}>
                  <div style={styles.pricingItemDot} />
                  <span style={styles.pricingItemName}>{item.name}</span>
                  <div style={styles.pricingItemLine} />
                  {/* Our Cost — hidden for manual-price items */}
                  {!item.manualPrice && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 90 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 1 }}>Our Cost</span>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "rgba(255,255,255,0.45)" }}>${fmt2(item.cost)}</span>
                    </div>
                  )}
                  {/* Customer Price — editable for manualPrice items, auto-calculated otherwise */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 110, marginLeft: 14 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 1 }}>Customer</span>
                    {item.manualPrice ? (
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "rgba(255,255,255,0.4)", pointerEvents: "none" }}>$</span>
                        <input
                          type="number" min="0" step="0.01"
                          placeholder="0.00"
                          value={manualPrices[item.idx] ?? ""}
                          onChange={(e) => setManualPrice(item.idx, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ background: "rgba(229,57,53,0.08)", border: "1px solid rgba(229,57,53,0.3)", borderRadius: 4, color: "#E53935", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, padding: "3px 6px 3px 18px", width: 100, outline: "none", boxSizing: "border-box" }}
                        />
                      </div>
                    ) : (
                      <span style={styles.pricingItemPrice}>${fmt2(cp)}</span>
                    )}
                  </div>
                  <span style={styles.pricingItemX}>×</span>
                  <div style={styles.pricingQtyWrap}>
                    <button style={styles.pricingQtyBtn} onClick={() => setQty(item.idx, qty - 1)}>−</button>
                    <input style={styles.pricingQtyInput} type="number" min="0" value={qty} onChange={(e) => setQty(item.idx, e.target.value)} onClick={(e) => e.stopPropagation()} />
                    <button style={styles.pricingQtyBtn} onClick={() => setQty(item.idx, qty + 1)}>+</button>
                  </div>
                  <span style={styles.pricingLineTotal}>
                    {qty > 0 && cp > 0 ? `$${fmt2(lineTotal)}` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* ── CUSTOM ITEMS ─────────────────────────────────────────────────── */}
      <div style={{ ...styles.pricingCategory, marginTop: 8 }}>
        <div style={{ ...styles.pricingCatHeader, cursor: "default" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "rgba(255,255,255,0.4)", marginRight: 8 }}>
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={styles.pricingCatName}>Custom Items</span>
          {customItems.length > 0 && (
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#C41E3A", background: "rgba(196,30,58,0.15)", border: "1px solid rgba(196,30,58,0.3)", borderRadius: 10, padding: "1px 8px", marginLeft: 8 }}>{customItems.length} added</span>
          )}
          {customTotal > 0 && <span style={{ ...styles.pricingCatTotal, marginLeft: "auto" }}>${customTotal.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>}
        </div>

        {/* Existing custom items */}
        {customItems.map((item) => {
          const cpBase    = custPrice(item.cost);
          const cp        = displayPrice(cpBase);
          const lineTotal = cp * item.qty;
          const fmt2      = (n) => n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
          return (
            <div key={item.id} style={styles.pricingRow}>
              <div style={styles.pricingItemDot} />
              <span style={styles.pricingItemName}>{item.name}</span>
              <div style={styles.pricingItemLine} />
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", minWidth:90 }}>
                <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:9, color:"rgba(255,255,255,0.3)", letterSpacing:1, textTransform:"uppercase", marginBottom:1 }}>Our Cost</span>
                <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:"rgba(255,255,255,0.45)" }}>${fmt2(item.cost)}</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", minWidth:100, marginLeft:14 }}>
                <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:9, color:"rgba(255,255,255,0.3)", letterSpacing:1, textTransform:"uppercase", marginBottom:1 }}>Customer</span>
                <span style={styles.pricingItemPrice}>${fmt2(cp)}</span>
              </div>
              <span style={styles.pricingItemX}>×</span>
              <div style={styles.pricingQtyWrap}>
                <button style={styles.pricingQtyBtn} onClick={() => setCustomQty(item.id, item.qty - 1)}>−</button>
                <input style={styles.pricingQtyInput} type="number" min="0" value={item.qty} onChange={(e) => setCustomQty(item.id, e.target.value)} />
                <button style={styles.pricingQtyBtn} onClick={() => setCustomQty(item.id, item.qty + 1)}>+</button>
              </div>
              <span style={styles.pricingLineTotal}>{item.qty > 0 ? `$${fmt2(lineTotal)}` : "—"}</span>
              <button onClick={() => removeCustomItem(item.id)} style={{ background:"none", border:"none", color:"rgba(229,57,53,0.6)", cursor:"pointer", fontSize:16, lineHeight:1, padding:"0 0 0 10px", flexShrink:0 }} title="Remove">×</button>
            </div>
          );
        })}

        {/* Add new custom item form */}
        <div style={{ display:"flex", gap:10, alignItems:"center", padding:"12px 16px", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          <input
            style={{ ...fieldSt, flex:3, fontSize:12 }}
            placeholder="Item name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomItem()}
          />
          <div style={{ position:"relative", flex:1 }}>
            <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:"rgba(255,255,255,0.35)", pointerEvents:"none" }}>$</span>
            <input
              style={{ ...fieldSt, paddingLeft:22, fontSize:12 }}
              placeholder="Our cost"
              type="number" min="0" step="0.01"
              value={newCost}
              onChange={(e) => setNewCost(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomItem()}
            />
          </div>
          <button
            onClick={addCustomItem}
            disabled={!newName.trim() || isNaN(parseFloat(newCost))}
            style={{ background: (!newName.trim() || isNaN(parseFloat(newCost))) ? "rgba(229,57,53,0.2)" : "linear-gradient(135deg,#E53935,#C62828)", color:"#fff", border:"none", borderRadius:6, padding:"8px 18px", fontFamily:"'Chakra Petch',sans-serif", fontSize:11, fontWeight:700, letterSpacing:1, cursor:(!newName.trim() || isNaN(parseFloat(newCost))) ? "not-allowed" : "pointer", opacity:(!newName.trim() || isNaN(parseFloat(newCost))) ? 0.5 : 1, whiteSpace:"nowrap", flexShrink:0 }}
          >
            + ADD ITEM
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── WEATHER INTEL (WX) VIEW ─────────────────────────────────────────────
const WX_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// ─── OPEN-METEO WEATHER FETCH (free, no API key, real ERA5 data) ───────────
function calcDaylightHours(latDeg, monthIdx) {
  const latRad = latDeg * Math.PI / 180;
  const dayOfYear = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][monthIdx];
  const decl = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * Math.PI / 180) * Math.PI / 180;
  const cosH = -Math.tan(latRad) * Math.tan(decl);
  if (cosH <= -1) return 24;
  if (cosH >= 1) return 0;
  return Math.round((2 * Math.acos(cosH) * 180 / Math.PI / 15) * 10) / 10;
}

/* ─── Improved Geocoder ───────────────────────────────────────────────────────
   Parses US addresses into components for structured Nominatim queries,
   which return building-level results instead of just road-level matches.
   Falls back to free-text + international if structured query fails.
   ─────────────────────────────────────────────────────────────────────────── */
function parseUSAddressApp(raw) {
  const s = raw.trim();
  const c = s.match(/^(\d+\s+[^,]+?),\s*([^,]+?),\s*([A-Za-z]{2})\s*(\d{5})?$/i);
  if (c) return { street: c[1].trim(), city: c[2].trim(), state: c[3].toUpperCase(), zip: c[4] || "" };
  const p = s.match(/^(\d+\s+[^,]+?),\s*([A-Za-z\s]+?)\s+([A-Za-z]{2})\s*(\d{5})?$/i);
  if (p) return { street: p[1].trim(), city: p[2].trim(), state: p[3].toUpperCase(), zip: p[4] || "" };
  const n = s.match(/^(\d+\s+(?:[NSEW]\s+)?[\w\s]+?(?:rd|st|ave|blvd|dr|ln|ct|pl|way|hwy|pkwy|pike|trl|run|loop|cir|ter|row|pt|sq|pass|xing)\b[^A-Z]*?)\s+([A-Za-z][\w\s]{1,20}?)\s+([A-Za-z]{2})\s*(\d{5})?$/i);
  if (n) return { street: n[1].trim(), city: n[2].trim(), state: n[3].toUpperCase(), zip: n[4] || "" };
  return null;
}

async function geocodeAddressApp(address) {
  const GKEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || "AIzaSyBnhUSUtGMAADdpNVTak0IEQ7uXE0k3CEo";
  // 1. Google Maps Geocoding — precise building-level results
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
    } catch (_) {}
  }
  // 2. Nominatim structured fallback
  const HDR = { "Accept-Language": "en", "User-Agent": "DXD-Deployment-Tracker/1.0" };
  const parsed = parseUSAddressApp(address);
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
    } catch (_) {}
  }
  // 3. Nominatim free-text global fallback
  try {
    const qs = new URLSearchParams({ format: "json", limit: "1", q: address });
    const r  = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, { headers: HDR });
    const res = await r.json();
    if (res.length > 0) return { lat: parseFloat(res[0].lat), lng: parseFloat(res[0].lon), displayName: res[0].display_name };
  } catch (_) {}
  return null;
}

async function fetchWeatherFromOpenMeteo(location, onStatus) {
  // Step 1: Geocode — structured Nominatim with US-address parser + fallbacks
  if (onStatus) onStatus("Geocoding location...");
  const geo = await geocodeAddressApp(location);
  if (!geo) throw new Error("Could not geocode location — check the site address");
  const { lat, lng } = geo;

  // Step 2: Fetch 11 years of daily data from Open-Meteo ERA5 archive (free, no key)
  if (onStatus) onStatus("Fetching weather data from Open-Meteo (2015–2025)...");
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    start_date: "2015-01-01",
    end_date: "2025-12-31",
    daily: [
      "temperature_2m_max", "temperature_2m_min",
      "precipitation_sum", "rain_sum", "snowfall_sum",
      "wind_speed_10m_max", "wind_gusts_10m_max",
      "relative_humidity_2m_max", "relative_humidity_2m_min",
      "weather_code",
    ].join(","),
    timezone: "UTC",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
  });
  const wxRes = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  if (!wxRes.ok) {
    const err = await wxRes.json().catch(() => ({}));
    throw new Error(err.reason || `Open-Meteo error (${wxRes.status})`);
  }
  const wxData = await wxRes.json();

  // Step 3: Aggregate daily → monthly averages across all 11 years
  if (onStatus) onStatus("Calculating monthly averages...");
  const d = wxData.daily;
  const dates = d.time;
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // Per-month buckets
  const md = Array.from({ length: 12 }, () => ({
    highs: [], lows: [], windSpeeds: [], gusts: [], humidities: [],
    rainDays: 0, snowDays: 0, fogDays: 0, thunderDays: 0,
  }));
  // Track monthly precip totals per year so we can average them
  const monthYearPrecip = {};

  dates.forEach((dateStr, i) => {
    const mIdx = parseInt(dateStr.slice(5, 7)) - 1;
    const year = dateStr.slice(0, 4);
    const m = md[mIdx];

    if (d.temperature_2m_max[i] != null) m.highs.push(d.temperature_2m_max[i]);
    if (d.temperature_2m_min[i] != null) m.lows.push(d.temperature_2m_min[i]);
    if (d.wind_speed_10m_max[i] != null) m.windSpeeds.push(d.wind_speed_10m_max[i]);
    if (d.wind_gusts_10m_max[i] != null) m.gusts.push(d.wind_gusts_10m_max[i]);

    const hMax = d.relative_humidity_2m_max?.[i];
    const hMin = d.relative_humidity_2m_min?.[i];
    if (hMax != null && hMin != null) m.humidities.push((hMax + hMin) / 2);

    const code = d.weather_code?.[i];
    if ((d.rain_sum?.[i] || 0) >= 0.10) m.rainDays++; // 0.10" threshold — excludes trace/drizzle
    if ((d.snowfall_sum?.[i] || 0) >= 0.1) m.snowDays++;
    if (code != null && [45, 48].includes(code)) m.fogDays++;
    if (code != null && [95, 96, 99].includes(code)) m.thunderDays++;

    const key = `${mIdx}_${year}`;
    monthYearPrecip[key] = (monthYearPrecip[key] || 0) + (d.precipitation_sum?.[i] || 0);
  });

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const months = md.map((m, i) => {
    const precipByYear = Object.entries(monthYearPrecip)
      .filter(([k]) => k.startsWith(`${i}_`))
      .map(([, v]) => v);
    const yearsCount = precipByYear.length || 1;
    return {
      month: MONTH_NAMES[i],
      avg_high_f: Math.round(avg(m.highs) * 10) / 10,
      avg_low_f: Math.round(avg(m.lows) * 10) / 10,
      avg_precip_inches: Math.round(avg(precipByYear) * 10) / 10,
      avg_rain_days: Math.round((m.rainDays / yearsCount) * 10) / 10,
      avg_snow_days: Math.round((m.snowDays / yearsCount) * 10) / 10,
      avg_fog_days: Math.round((m.fogDays / yearsCount) * 10) / 10,
      avg_thunderstorm_days: Math.round((m.thunderDays / yearsCount) * 10) / 10,
      avg_wind_speed_mph: Math.round(avg(m.windSpeeds) * 10) / 10,
      avg_wind_gust_mph: Math.round(avg(m.gusts) * 10) / 10,
      avg_humidity_pct: Math.round(avg(m.humidities)),
      avg_visibility_miles: 10,
      avg_daylight_hours: calcDaylightHours(lat, i),
    };
  });

  return {
    location: geo.displayName || location,
    data_period: "2015–2025 (11-year average)",
    sources: ["Open-Meteo ERA5 Historical Archive"],
    months,
  };
}

function classifyMonth(m) {
  const daysInMonth = [31,28,31,30,31,30,31,31,30,31,30,31];
  const idx = WX_MONTHS.indexOf(m.month?.slice(0, 3)) ?? 0;
  const totalDays = daysInMonth[idx] || 30;

  // avg_wind_speed_mph = average of daily MAX wind speeds
  // User hard cutoff: 27 mph (DJI M4 rated max wind resistance)
  // User can fly in light rain; only heavy rain / active thunderstorm = no-fly
  // Thunderstorms: no-fly during cell, ops resume once cleared (~40% day lost)

  // ── NO-FLY ────────────────────────────────────────────────────────────────

  // Thunderstorms: cell is active ~40% of the day on average (grounded until clear)
  const thunderNofly = m.avg_thunderstorm_days * 0.40;

  // Heavy rain only — rain days (≥0.10") that are severe enough to ground ops
  // ~20% of meaningful rain days have sustained/heavy rain that prevents flight
  const lightRainDays = Math.max(m.avg_rain_days - m.avg_thunderstorm_days, 0);
  const heavyRainNofly = lightRainDays * 0.20;

  // Snow / icing: dock roof icing + prop icing risk — 80% of snow days no-fly
  const snowNofly = m.avg_snow_days * 0.80;

  // Wind: estimate % of days where daily MAX exceeds 27 mph hard cutoff
  const windNoflyPct =
    m.avg_wind_speed_mph > 25 ? 0.40 :
    m.avg_wind_speed_mph > 22 ? 0.20 :
    m.avg_wind_speed_mph > 18 ? 0.08 :
    m.avg_wind_speed_mph > 14 ? 0.02 :
    m.avg_wind_speed_mph > 10 ? 0.005 : 0.001;
  const windNofly = totalDays * windNoflyPct;

  // Fog: BVLOS requires clear visibility — 80% of fog days grounded
  const fogNofly = m.avg_fog_days * 0.80;

  // Extreme cold (battery failure risk below 14°F avg low)
  const coldNofly = m.avg_low_f < 14 ? 6 : m.avg_low_f < 20 ? 3 : 0;

  // Extreme heat (thermal shutdown above 113°F)
  const heatNofly = m.avg_high_f > 113 ? 3 : m.avg_high_f > 104 ? 1 : 0;

  const noflyDays = Math.min(
    Math.round(thunderNofly + heavyRainNofly + snowNofly + windNofly + fogNofly + coldNofly + heatNofly),
    totalDays
  );

  // ── MARGINAL ──────────────────────────────────────────────────────────────
  // Post-storm cautious window — ops resuming as weather clears
  const thunderMarginal = m.avg_thunderstorm_days * 0.25;

  // Light rain days: flyable but reduced ops efficiency
  const lightRainMarginal = lightRainDays * 0.15;

  // Wind: days approaching but not exceeding 27 mph (gusty, reduced stability)
  const windMarginalPct =
    m.avg_wind_speed_mph > 22 ? 0.20 :
    m.avg_wind_speed_mph > 18 ? 0.10 :
    m.avg_wind_speed_mph > 14 ? 0.04 :
    m.avg_wind_speed_mph > 10 ? 0.01 : 0.003;
  const windMarginal = totalDays * windMarginalPct;

  // Cold but above hard cutoff (reduced battery life)
  const coldMarginal = m.avg_low_f >= 14 && m.avg_low_f < 32
    ? Math.min(3, Math.round(m.avg_snow_days * 0.5) + 1)
    : 0;

  const fogMarginal = m.avg_fog_days * 0.20;

  const marginalDays = Math.min(
    Math.round(thunderMarginal + lightRainMarginal + windMarginal + coldMarginal + fogMarginal),
    totalDays - noflyDays
  );

  const nofly = noflyDays;
  const marginal = marginalDays;
  const flyable = Math.max(totalDays - nofly - marginal, 0);
  return { flyable, marginal, nofly };
}

const WxStatCard = ({ label, value, unit, sub, color = "#e63946", icon }) => (
  <div style={{ background: "linear-gradient(135deg, rgba(30,30,34,0.95), rgba(22,22,26,0.98))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color}, transparent)` }} />
    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>{icon && <span style={{ fontSize: 14 }}>{icon}</span>}{label}</div>
    <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 28, fontWeight: 700, color: "#f1f1f1", lineHeight: 1 }}>{value}<span style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", marginLeft: 4 }}>{unit}</span></div>
    {sub && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>{sub}</div>}
  </div>
);

const WxFlyabilityBar = ({ flyable, marginal, nofly }) => {
  const total = flyable + marginal + nofly;
  if (total === 0) return null;
  const fp = (flyable / total * 100).toFixed(0);
  const mp = (marginal / total * 100).toFixed(0);
  const np = (nofly / total * 100).toFixed(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "rgba(255,255,255,0.05)" }}>
        <div style={{ width: `${fp}%`, background: "linear-gradient(90deg, #2ecc71, #27ae60)", transition: "width 0.6s" }} />
        <div style={{ width: `${mp}%`, background: "linear-gradient(90deg, #f39c12, #e67e22)", transition: "width 0.6s" }} />
        <div style={{ width: `${np}%`, background: "linear-gradient(90deg, #e74c3c, #c0392b)", transition: "width 0.6s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
        <span><span style={{ color: "#2ecc71", fontSize: 8 }}>&#9632;</span> GO {fp}%</span>
        <span><span style={{ color: "#f39c12", fontSize: 8 }}>&#9632;</span> MARGINAL {mp}%</span>
        <span><span style={{ color: "#e74c3c", fontSize: 8 }}>&#9632;</span> NO-FLY {np}%</span>
      </div>
    </div>
  );
};

const WxBarChart = ({ data, dataKey, label, unit, color = "#e63946" }) => {
  const values = data.map((d) => d[dataKey] ?? 0);
  const mx = Math.max(...values, 1);
  return (
    <div style={{ background: "rgba(30,30,34,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "16px 18px" }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90 }}>
        {values.map((v, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{v < 10 ? v.toFixed(1) : Math.round(v)}</span>
            <div style={{ width: "100%", height: `${Math.max((v / mx) * 70, 2)}px`, background: `linear-gradient(180deg, ${color}, ${color}88)`, borderRadius: "3px 3px 0 0", transition: "height 0.4s ease" }} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{WX_MONTHS[i]}</span>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 8, textAlign: "right" }}>{unit}</div>
    </div>
  );
};

const WxFlyabilityChart = ({ flyData }) => (
  <div style={{ background: "rgba(30,30,34,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "16px 18px" }}>
    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>Estimated Flyable Days / Month</div>
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90 }}>
      {WX_MONTHS.map((m, i) => {
        const d = flyData[i] || { flyable: 0, marginal: 0, nofly: 0 };
        const total = d.flyable + d.marginal + d.nofly;
        const maxH = 70;
        const fH = total > 0 ? (d.flyable / total) * maxH : 0;
        const mH = total > 0 ? (d.marginal / total) * maxH : 0;
        const nH = total > 0 ? (d.nofly / total) * maxH : 0;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{d.flyable}</span>
            <div style={{ display: "flex", flexDirection: "column", width: "100%", borderRadius: "3px 3px 0 0", overflow: "hidden" }}>
              <div style={{ height: nH, background: "linear-gradient(180deg, #e74c3c, #c0392b88)" }} />
              <div style={{ height: mH, background: "linear-gradient(180deg, #f39c12, #e67e2288)" }} />
              <div style={{ height: fH, background: "linear-gradient(180deg, #2ecc71, #27ae6088)" }} />
            </div>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{m}</span>
          </div>
        );
      })}
    </div>
    <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 10 }}>
      {[["#2ecc71","GO"],["#f39c12","MARGINAL"],["#e74c3c","NO-FLY"]].map(([c,l]) => (
        <span key={l} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: "inline-block" }} />{l}
        </span>
      ))}
    </div>
  </div>
);

const WxTempRangeChart = ({ data }) => {
  const allTemps = data.flatMap((d) => [d.avg_high_f, d.avg_low_f]);
  const minT = Math.min(...allTemps) - 5;
  const maxT = Math.max(...allTemps) + 5;
  const range = maxT - minT || 1;
  return (
    <div style={{ background: "rgba(30,30,34,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "16px 18px" }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>Temperature Range (°F)</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, height: 100, position: "relative" }}>
        {32 >= minT && 32 <= maxT && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: `${((32 - minT) / range) * 100}%`, height: 1, borderTop: "1px dashed rgba(52,152,219,0.4)", zIndex: 1 }}>
            <span style={{ position: "absolute", right: 0, top: -14, fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "rgba(52,152,219,0.5)" }}>32°F</span>
          </div>
        )}
        {data.map((d, i) => {
          const bottom = ((d.avg_low_f - minT) / range) * 100;
          const top = ((d.avg_high_f - minT) / range) * 100;
          const h = top - bottom;
          const avg = (d.avg_high_f + d.avg_low_f) / 2;
          const hue = avg < 32 ? 210 : avg < 60 ? 50 : avg < 85 ? 25 : 0;
          const col = `hsl(${hue}, 70%, 55%)`;
          return (
            <div key={i} style={{ flex: 1, position: "relative", height: "100%" }}>
              <div style={{ position: "absolute", bottom: `${bottom}%`, height: `${Math.max(h, 3)}%`, width: "100%", background: `linear-gradient(180deg, ${col}, ${col}66)`, borderRadius: 3 }} />
              <div style={{ position: "absolute", bottom: -16, width: "100%", textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{WX_MONTHS[i]}</div>
              <div style={{ position: "absolute", bottom: `${top + 1}%`, width: "100%", textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "rgba(255,255,255,0.45)" }}>{Math.round(d.avg_high_f)}°</div>
              <div style={{ position: "absolute", bottom: `${Math.max(bottom - 8, -2)}%`, width: "100%", textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "rgba(255,255,255,0.35)" }}>{Math.round(d.avg_low_f)}°</div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 18 }} />
    </div>
  );
};

// ─── CONNECTIVITY VIEW ────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dL = (lat2-lat1)*Math.PI/180, dO = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dO/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function ConnectivityView({ project, cachedData, onCacheUpdate }) {
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [data, setData] = useState(cachedData?.result || null);
  const [error, setError] = useState(null);

  async function fetchConnectivity(address) {
    // Step 1: Geocode — structured Nominatim with US-address parser + fallbacks
    setLoadMsg("Geocoding address...");
    const geoResult = await geocodeAddressApp(address);
    if (!geoResult) throw new Error("Address not found — verify site address in project settings");
    const { lat, lng: lon, displayName: display_name } = geoResult;

    // Step 2: FCC Census Block lookup → county FIPS + state
    setLoadMsg("Looking up FCC coverage area...");
    const fccRes = await fetch(`https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`);
    const fccData = await fccRes.json();
    if (fccData.status !== "OK") throw new Error("Could not determine coverage area");
    const { County: { FIPS: countyFIPS, name: countyName }, State: { code: stateCode, name: stateName, FIPS: stateFIPS } } = fccData;
    const countyCode = countyFIPS.slice(2);

    // Step 3: Census ACS 5-year broadband data for county
    setLoadMsg("Fetching Census broadband data...");
    const censusRes = await fetch(
      `https://api.census.gov/data/2022/acs/acs5?get=NAME,B28002_001E,B28002_004E,B28002_007E,B28002_013E&for=county:${countyCode}&in=state:${stateFIPS}`
    );
    const censusJson = await censusRes.json();
    const [headers, values] = censusJson;
    const census = {};
    headers.forEach((h, i) => { census[h] = parseInt(values[i]) || 0; });

    const totalHH = census.B28002_001E || 1;
    const hasInternet = census.B28002_004E || 0;
    const internetPct   = Math.round(hasInternet / totalHH * 100);
    const broadbandPct  = Math.round(census.B28002_007E / totalHH * 100);
    const satellitePct  = Math.round(census.B28002_013E / totalHH * 100);
    const noInternetPct = Math.round((totalHH - hasInternet) / totalHH * 100);

    // Step 4: Cell towers near location via Overpass (non-fatal)
    setLoadMsg("Scanning cell tower infrastructure...");
    let towerCount = 0;
    let towerTypes = {};
    try {
      const ovQuery = `[out:json][timeout:15];node["communication:mobile_phone"="yes"](around:16000,${lat},${lon});out tags;`;
      const ovRes = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST", body: `data=${encodeURIComponent(ovQuery)}`
      });
      const ovJson = await ovRes.json();
      towerCount = ovJson.elements?.length || 0;
      for (const el of (ovJson.elements || [])) {
        const c = el.tags?.["tower:construction"] || "lattice";
        towerTypes[c] = (towerTypes[c] || 0) + 1;
      }
    } catch (_) { /* non-fatal */ }

    // Step 5: Power infrastructure via Overpass (substations, lines, generators)
    setLoadMsg("Scanning power infrastructure...");
    let power = { substationCount: 0, operators: [], nearestSubDist: null, nearestSub: null, voltages: [], plantCount: 0 };
    try {
      const pwrQ = `[out:json][timeout:20];(node["power"="substation"](around:40000,${lat},${lon});way["power"="substation"](around:40000,${lat},${lon});way["power"="line"]["voltage"](around:20000,${lat},${lon});node["power"="plant"](around:60000,${lat},${lon});way["power"="plant"](around:60000,${lat},${lon}););out tags center;`;
      const pwrRes = await fetch("https://overpass-api.de/api/interpreter", { method:"POST", body:`data=${encodeURIComponent(pwrQ)}` });
      const pwrJson = await pwrRes.json();
      const opSet = new Set(), voltSet = new Set();
      let nearDist = null, nearSub = null;
      for (const el of (pwrJson.elements || [])) {
        const t = el.tags || {};
        if (t.power === "substation") {
          const elLat = el.lat ?? el.center?.lat;
          const elLon = el.lon ?? el.center?.lon;
          if (t.operator) opSet.add(t.operator);
          power.substationCount++;
          if (elLat && elLon) {
            const d = haversineKm(parseFloat(lat), parseFloat(lon), elLat, elLon);
            if (nearDist === null || d < nearDist) {
              nearDist = d;
              nearSub = { name: t.name || "Substation", operator: t.operator || null, voltage: t.voltage || null, type: t.substation || "distribution" };
            }
          }
        } else if (t.power === "line" && t.voltage) {
          const v = parseInt(t.voltage);
          if (v > 0) voltSet.add(v);
          if (t.operator) opSet.add(t.operator);
        } else if (t.power === "plant" || t.power === "generator") {
          power.plantCount++;
          if (t.operator) opSet.add(t.operator);
          if (t.name) opSet.add(t.name);
        }
      }
      power.operators     = [...opSet].slice(0, 6);
      power.voltages      = [...voltSet].sort((a, b) => b - a).slice(0, 6);
      power.nearestSubDist = nearDist !== null ? Math.round(nearDist * 10) / 10 : null;
      power.nearestSub    = nearSub;
    } catch (_) { /* non-fatal */ }

    // BVLOS verdict based on wired broadband penetration
    let verdict;
    if (broadbandPct >= 60) verdict = "ready";
    else if (broadbandPct >= 35) verdict = "mixed";
    else verdict = "starlink";

    return {
      lat, lon, display_name, countyName, stateName, stateCode,
      totalHH, internetPct, broadbandPct, satellitePct, noInternetPct,
      towerCount, towerTypes, verdict, power
    };
  }

  const handleAnalyze = async () => {
    const address = project.site || "";
    if (!address.trim()) { setError("No site address set — add a site location in project settings first"); return; }
    setLoading(true); setError(null); setData(null);
    try {
      const result = await fetchConnectivity(address);
      setData(result);
      if (onCacheUpdate) onCacheUpdate({ result, timestamp: new Date().toISOString(), address });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false); setLoadMsg("");
    }
  };

  const monoNum = { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 };

  const carriers = [
    { key: "att", label: "AT&T", color: "#00A8E0", url: "https://www.att.com/maps/wireless-coverage-map.html" },
    { key: "tmobile", label: "T-Mobile", color: "#E20074", url: "https://www.t-mobile.com/coverage/coverage-map" },
    { key: "verizon", label: "Verizon", color: "#CD040B", url: "https://www.verizon.com/coverage-map/" },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, background: "linear-gradient(135deg, #e63946, #a62633)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="22" height="22" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="2" stroke="#fff" strokeWidth="1.3"/>
            <path d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12" stroke="#fff" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M2.9 2.9l1.1 1.1M9 9l1.1 1.1M9 4L7.9 5.1M4 9L2.9 10.1" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1, fontFamily: "'Chakra Petch', sans-serif" }}>POWER &amp; NETWORK</h2>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 1.5, marginTop: 2 }}>FCC CENSUS · BROADBAND &amp; CELLULAR INFRASTRUCTURE ANALYSIS</div>
        </div>
      </div>

      {/* Site Address + Actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20, background: "rgba(30,30,34,0.8)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "12px 18px" }}>
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 2, marginBottom: 4 }}>SITE ADDRESS</div>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, color: project.site ? "#E8ECF4" : "rgba(255,255,255,0.25)" }}>
            {project.site || "No site address set"}
          </div>
          {cachedData?.timestamp && (
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>
              Last analyzed: {new Date(cachedData.timestamp).toLocaleString()}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {cachedData?.result && !loading && (
            <button onClick={handleAnalyze} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "rgba(255,255,255,0.6)", fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 600, padding: "8px 16px", cursor: "pointer", letterSpacing: 0.8 }}>
              RE-ANALYZE
            </button>
          )}
          <button onClick={handleAnalyze} disabled={loading || !project.site}
            style={{ background: loading ? "rgba(230,57,70,0.3)" : "linear-gradient(135deg, #e63946, #c42d39)", border: "none", borderRadius: 6, color: "#fff", fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 600, padding: "8px 20px", cursor: loading || !project.site ? "not-allowed" : "pointer", letterSpacing: 1, opacity: !project.site ? 0.4 : 1 }}>
            {loading ? "ANALYZING..." : "ANALYZE CONNECTIVITY"}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ background: "rgba(230,57,70,0.08)", border: "1px solid rgba(230,57,70,0.2)", borderRadius: 8, padding: "14px 18px", marginBottom: 24, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#e63946", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 16, height: 16, border: "2px solid #e63946", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          {loadMsg}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "14px 18px", marginBottom: 24, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#EF4444", wordBreak: "break-word" }}>
          {error}
        </div>
      )}

      {/* Results */}
      {data && !loading && (() => {
        const verdictConfig = {
          ready:   { color: "#22C55E", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.35)",   icon: "✓", label: "BVLOS CONNECTIVITY LIKELY",  sub: `${data.broadbandPct}% of ${data.countyName} households have wired broadband — site likely has sufficient connectivity` },
          mixed:   { color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.35)",  icon: "⚡", label: "MIXED CONNECTIVITY",          sub: `${data.broadbandPct}% wired broadband — verify specific carrier and ISP coverage at site before deployment` },
          starlink:{ color: "#EF4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.35)",   icon: "↑", label: "STARLINK RECOMMENDED",        sub: `Only ${data.broadbandPct}% wired broadband in area — Starlink Enterprise required for reliable BVLOS C2 link` },
        };
        const v = verdictConfig[data.verdict];
        return (
          <div style={{ animation: "fadeSlideIn 0.5s ease" }}>
            {/* BVLOS Verdict Banner */}
            <div style={{ background: v.bg, border: `1px solid ${v.border}`, borderRadius: 12, padding: "20px 24px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 22, fontWeight: 700, color: v.color, letterSpacing: 1, marginBottom: 6 }}>{v.icon} {v.label}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{v.sub}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ ...monoNum, fontSize: 32, color: v.color }}>{data.broadbandPct}<span style={{ fontSize: 14, fontWeight: 400, color: "rgba(255,255,255,0.4)" }}>%</span></div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>WIRED BROADBAND</div>
              </div>
            </div>

            {/* County Broadband Stats */}
            <div style={{ marginBottom: 28 }}>
              <div style={styles.columnHeader}><span style={styles.columnDot} /><span style={styles.columnTitle}>COUNTY INTERNET INFRASTRUCTURE — {data.countyName.toUpperCase()}, {data.stateCode}</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginTop: 12 }}>
                {[
                  { label: "ANY INTERNET",     pct: data.internetPct,    color: "#60A5FA", sub: "of households" },
                  { label: "WIRED BROADBAND",  pct: data.broadbandPct,   color: "#22C55E", sub: "cable · fiber · DSL" },
                  { label: "SATELLITE ONLY",   pct: data.satellitePct,   color: "#F59E0B", sub: "satellite dependent" },
                  { label: "NO ACCESS",        pct: data.noInternetPct,  color: "#EF4444", sub: "underserved" },
                ].map(({ label, pct, color, sub }) => (
                  <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "16px 18px" }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1.5, marginBottom: 8 }}>{label}</div>
                    <div style={{ ...monoNum, fontSize: 28, color }}>{pct}<span style={{ fontSize: 14, fontWeight: 400, color: "rgba(255,255,255,0.4)" }}>%</span></div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{sub}</div>
                    <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.07)", overflow: "hidden", marginTop: 8 }}>
                      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cellular Coverage — Verify Links */}
            <div style={{ marginBottom: 28 }}>
              <div style={styles.columnHeader}><span style={styles.columnDot} /><span style={styles.columnTitle}>CELLULAR CARRIERS — VERIFY SITE COVERAGE</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 12 }}>
                {carriers.map(({ key, label, color, url }) => (
                  <div key={key} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, fontWeight: 700, color, letterSpacing: 0.5 }}>{label}</div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
                      Verify LTE &amp; 5G coverage at {data.countyName} on the carrier's official coverage map.
                    </div>
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      style={{ display: "block", textAlign: "center", padding: "8px 14px", background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 6, color, fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textDecoration: "none" }}>
                      CHECK {label.toUpperCase()} COVERAGE →
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Cell Tower Infrastructure */}
            <div style={{ marginBottom: 28 }}>
              <div style={styles.columnHeader}><span style={styles.columnDot} /><span style={styles.columnTitle}>CELL TOWER INFRASTRUCTURE — 16km RADIUS</span></div>
              <div style={{ marginTop: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "18px 20px", display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1.5, marginBottom: 6 }}>TOWERS DETECTED</div>
                  <div style={{ ...monoNum, fontSize: 36, color: data.towerCount > 5 ? "#22C55E" : data.towerCount > 1 ? "#F59E0B" : "#EF4444" }}>{data.towerCount}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
                    {data.towerCount > 5 ? "Good infrastructure density" : data.towerCount > 1 ? "Limited — verify with carriers" : "Minimal tower presence"}
                  </div>
                </div>
                {Object.keys(data.towerTypes).length > 0 && (
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    {Object.entries(data.towerTypes).map(([type, count]) => (
                      <div key={type} style={{ textAlign: "center" }}>
                        <div style={{ ...monoNum, fontSize: 22, color: "rgba(255,255,255,0.7)" }}>{count}</div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1, textTransform: "capitalize" }}>{type.replace(/_/g, " ")}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginLeft: "auto" }}>
                  <a href="https://broadbandmap.fcc.gov/home" target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-block", padding: "8px 16px", background: "rgba(230,57,70,0.12)", border: "1px solid rgba(230,57,70,0.3)", borderRadius: 6, color: "#e63946", fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textDecoration: "none" }}>
                    FCC BROADBAND MAP →
                  </a>
                </div>
              </div>
            </div>

            {/* Power Infrastructure */}
            <div style={{ marginBottom: 28 }}>
              <div style={styles.columnHeader}><span style={styles.columnDot} /><span style={styles.columnTitle}>POWER INFRASTRUCTURE</span></div>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

                {/* Electric Utility Providers */}
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "18px 20px" }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1.5, marginBottom: 10 }}>ELECTRIC UTILITY PROVIDERS DETECTED</div>
                  {data.power?.operators?.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {data.power.operators.map((op, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FBBF24", flexShrink: 0 }} />
                          <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, color: "#E8ECF4", fontWeight: 600 }}>{op}</span>
                        </div>
                      ))}
                      <a href={`https://atlas.eia.gov/datasets/f4cd55044b924fed9bc8b64022966097_0/explore?location=${data.lat},${data.lon},12`} target="_blank" rel="noopener noreferrer"
                        style={{ display: "inline-block", marginTop: 8, padding: "6px 14px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 6, color: "#FBBF24", fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textDecoration: "none" }}>
                        EIA ELECTRICITY ATLAS →
                      </a>
                    </div>
                  ) : (
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                      No tagged utility operators found in OSM data.
                      <a href={`https://atlas.eia.gov/datasets/f4cd55044b924fed9bc8b64022966097_0/explore?location=${data.lat},${data.lon},12`} target="_blank" rel="noopener noreferrer"
                        style={{ display: "block", marginTop: 10, padding: "6px 14px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 6, color: "#FBBF24", fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textDecoration: "none", textAlign: "center" }}>
                        LOOK UP ON EIA ELECTRICITY ATLAS →
                      </a>
                    </div>
                  )}
                </div>

                {/* Grid Infrastructure Stats */}
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1.5, marginBottom: 2 }}>GRID INFRASTRUCTURE</div>

                  {/* Nearest Substation */}
                  <div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: 1, marginBottom: 4 }}>NEAREST SUBSTATION</div>
                    {data.power?.nearestSub ? (
                      <div>
                        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, color: "#60A5FA", fontWeight: 700 }}>
                          {data.power.nearestSubDist !== null ? `${data.power.nearestSubDist} km away` : "Detected"}
                        </div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                          {data.power.nearestSub.name}{data.power.nearestSub.type ? ` · ${data.power.nearestSub.type}` : ""}
                          {data.power.nearestSub.voltage ? ` · ${Math.round(parseInt(data.power.nearestSub.voltage)/1000)}kV` : ""}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.25)" }}>Not found within 40km</div>
                    )}
                  </div>

                  {/* Substations in area */}
                  <div style={{ display: "flex", gap: 24 }}>
                    <div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: 1, marginBottom: 4 }}>SUBSTATIONS (40km)</div>
                      <div style={{ ...monoNum, fontSize: 26, color: data.power?.substationCount > 3 ? "#22C55E" : data.power?.substationCount > 0 ? "#F59E0B" : "#EF4444" }}>
                        {data.power?.substationCount ?? 0}
                      </div>
                    </div>
                    {data.power?.plantCount > 0 && (
                      <div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: 1, marginBottom: 4 }}>POWER PLANTS (60km)</div>
                        <div style={{ ...monoNum, fontSize: 26, color: "#A78BFA" }}>{data.power.plantCount}</div>
                      </div>
                    )}
                  </div>

                  {/* Voltage levels */}
                  {data.power?.voltages?.length > 0 && (
                    <div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: 1, marginBottom: 6 }}>TRANSMISSION VOLTAGES DETECTED</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {data.power.voltages.map(v => {
                          const kv = Math.round(v/1000);
                          const color = kv >= 200 ? "#EF4444" : kv >= 100 ? "#F59E0B" : kv >= 30 ? "#60A5FA" : "#6B7280";
                          return (
                            <span key={v} style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, fontWeight:700, color, background:`${color}18`, border:`1px solid ${color}44`, borderRadius:4, padding:"2px 8px" }}>
                              {kv}kV
                            </span>
                          );
                        })}
                      </div>
                      <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:9, color:"rgba(255,255,255,0.2)", marginTop:6 }}>
                        {data.power.voltages[0] >= 100000 ? "Transmission grid access" : data.power.voltages[0] >= 30000 ? "Sub-transmission distribution" : "Distribution level"}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Data Note */}
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.2)", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              Broadband data: US Census Bureau ACS 5-Year Estimates (2022) · Cell tower &amp; power data: OpenStreetMap · County: {data.countyName}, {data.stateName}
            </div>
          </div>
        );
      })()}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.2)" }}>
          <svg width="48" height="48" viewBox="0 0 13 13" fill="none" style={{ opacity: 0.3, marginBottom: 16 }}>
            <circle cx="6.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M2.9 2.9l1.1 1.1M9 9l1.1 1.1M9 4L7.9 5.1M4 9L2.9 10.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>Analyze site connectivity to view broadband and cellular coverage</div>
        </div>
      )}
    </div>
  );
}

function WeatherIntel({ defaultLocation, cachedData, onCacheUpdate }) {
  const [query, setQuery] = useState(defaultLocation || "");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [error, setError] = useState(null);
  const [weatherData, setWeatherData] = useState(cachedData?.weatherData || null);
  const [flyData, setFlyData] = useState(cachedData?.flyData || null);
  const [annualStats, setAnnualStats] = useState(cachedData?.annualStats || null);

  const handleSearch = useCallback(async (locationOverride) => {
    const loc = (locationOverride || query).trim();
    if (!loc) return;
    setLoading(true); setError(null); setWeatherData(null); setFlyData(null); setAnnualStats(null);
    setLoadMsg("Querying weather data for " + loc + "...");
    try {
      const result = await fetchWeatherFromOpenMeteo(loc, setLoadMsg);
      if (!result.months || result.months.length !== 12) throw new Error("Invalid data returned \u2014 expected 12 months of weather data.");
      setWeatherData(result);
      setLoadMsg("Calculating flyability metrics...");
      const fly = result.months.map((m) => classifyMonth(m));
      setFlyData(fly);
      const ms = result.months;
      const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const sum = (arr) => arr.reduce((a, b) => a + b, 0);
      const totalFlyable = sum(fly.map((f) => f.flyable));
      const totalMarginal = sum(fly.map((f) => f.marginal));
      const totalNofly = sum(fly.map((f) => f.nofly));
      const totalDays = totalFlyable + totalMarginal + totalNofly;
      const bestIdx = fly.reduce((best, f, i) => f.flyable > fly[best].flyable ? i : best, 0);
      const stats = {
        avgTemp: Math.round(avg(ms.map((m) => (m.avg_high_f + m.avg_low_f) / 2))),
        avgHigh: Math.round(avg(ms.map((m) => m.avg_high_f))),
        avgLow: Math.round(avg(ms.map((m) => m.avg_low_f))),
        totalPrecip: sum(ms.map((m) => m.avg_precip_inches)).toFixed(1),
        totalRainDays: Math.round(sum(ms.map((m) => m.avg_rain_days))),
        totalSnowDays: Math.round(sum(ms.map((m) => m.avg_snow_days))),
        totalFogDays: Math.round(sum(ms.map((m) => m.avg_fog_days))),
        totalThunderDays: Math.round(sum(ms.map((m) => m.avg_thunderstorm_days))),
        avgGust: avg(ms.map((m) => m.avg_wind_speed_mph)).toFixed(1),
        peakGust: Math.max(...ms.map((m) => m.avg_wind_speed_mph)),
        avgHumidity: Math.round(avg(ms.map((m) => m.avg_humidity_pct))),
        flyableDays: totalFlyable,
        flyablePct: totalDays > 0 ? (totalFlyable / totalDays * 100) : 0,
        marginalPct: totalDays > 0 ? (totalMarginal / totalDays * 100) : 0,
        noflyPct: totalDays > 0 ? (totalNofly / totalDays * 100) : 0,
        bestMonth: bestIdx,
        bestMonthFlyable: fly[bestIdx].flyable,
      };
      setAnnualStats(stats);
      if (onCacheUpdate) onCacheUpdate({ weatherData: result, flyData: fly, annualStats: stats });
    } catch (e) { setError(typeof e?.message === 'string' && e.message ? e.message : e instanceof Error ? e.toString() : String(e)); }
    finally { setLoading(false); setLoadMsg(""); }
  }, [query, onCacheUpdate]);

  // Auto-fetch on mount if no cached data and location is available
  useEffect(() => {
    if (!cachedData && defaultLocation) handleSearch(defaultLocation);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKey = (e) => { if (e.key === "Enter") handleSearch(); };

  return (
    <div style={{ marginBottom: 24 }}>
      {/* WX Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, background: "linear-gradient(135deg, #e63946, #a62633)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, letterSpacing: -1, color: "#fff" }}>WX</div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1, fontFamily: "'Chakra Petch', sans-serif" }}>DXD WEATHER INTEL</h2>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 1.5, marginTop: 2 }}>BVLOS DRONE OPS — AI-POWERED CLIMATE ANALYSIS</div>
        </div>
      </div>
      {/* Search */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, background: "rgba(30,30,34,0.8)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 6 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKey} placeholder="Enter city or address — e.g. Dallas, TX"
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f1f1f1", fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, padding: "10px 14px", letterSpacing: 0.5 }} />
        <button onClick={() => handleSearch()} disabled={loading}
          style={{ background: loading ? "rgba(230,57,70,0.3)" : "linear-gradient(135deg, #e63946, #c42d39)", border: "none", borderRadius: 6, color: "#fff", fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 600, padding: "10px 24px", cursor: loading ? "wait" : "pointer", letterSpacing: 1, textTransform: "uppercase" }}>
          {loading ? "ANALYZING..." : "ANALYZE"}
        </button>
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 32, paddingLeft: 4 }}>Open-Meteo ERA5 · 10-year historical averages · Flyability based on wind, temp, precip &amp; weather patterns</div>
      {/* Loading */}
      {loading && (
        <div style={{ background: "rgba(230,57,70,0.08)", border: "1px solid rgba(230,57,70,0.2)", borderRadius: 8, padding: "14px 18px", marginBottom: 24, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#e63946", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 16, height: 16, border: "2px solid #e63946", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />{loadMsg}
        </div>
      )}
      {/* Error */}
      {error && <div style={{ background: "rgba(231,76,60,0.1)", border: "1px solid rgba(231,76,60,0.3)", borderRadius: 8, padding: "14px 18px", marginBottom: 24, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#e74c3c", wordBreak: "break-word" }}>{error}</div>}
      {/* Results */}
      {weatherData && flyData && annualStats && (
        <div style={{ animation: "fadeSlideIn 0.5s ease" }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#e63946", textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>Location Analysis</div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{weatherData.location}</h2>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span>&#128197; {weatherData.data_period || "10-year average"}</span>
              {weatherData.sources && weatherData.sources.length > 0 && <span>&#128202; Sources: {weatherData.sources.join(", ")}</span>}
            </div>
          </div>
          {/* Stat Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
            <WxStatCard label="Flyable Days/Yr" value={annualStats.flyableDays} unit="days" sub={annualStats.flyablePct.toFixed(0) + "% of year"} color="#2ecc71" icon="✓" />
            <WxStatCard label="Avg Wind Speed" value={annualStats.avgGust} unit="mph" sub={"Peak month avg: " + annualStats.peakGust + " mph"} color="#3498db" icon="~" />
            <WxStatCard label="Annual Precip" value={annualStats.totalPrecip} unit="in" sub={annualStats.totalRainDays + " rain days"} color="#9b59b6" icon="&#9730;" />
            <WxStatCard label="Avg Temp" value={annualStats.avgTemp} unit="°F" sub={"H: " + annualStats.avgHigh + "° / L: " + annualStats.avgLow + "°"} color="#e67e22" icon="°" />
            <WxStatCard label="Thunderstorm Days" value={annualStats.totalThunderDays} unit="/yr" sub="Lightning = auto ground" color="#e74c3c" icon="&#9928;" />
            <WxStatCard label="Fog Days" value={annualStats.totalFogDays} unit="/yr" sub="Visibility risk" color="#95a5a6" icon="&#9783;" />
            <WxStatCard label="Avg Humidity" value={annualStats.avgHumidity} unit="%" sub="Sensor/lens condensation" color="#16a085" icon="%" />
            <WxStatCard label="Best Month" value={WX_MONTHS[annualStats.bestMonth]} unit="" sub={annualStats.bestMonthFlyable + " flyable days"} color="#2ecc71" icon="★" />
          </div>
          {/* Flyability bar */}
          <div style={{ background: "rgba(30,30,34,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "16px 18px", marginBottom: 24 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Annual Flyability Index</div>
            <WxFlyabilityBar flyable={annualStats.flyablePct} marginal={annualStats.marginalPct} nofly={annualStats.noflyPct} />
          </div>
          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <WxFlyabilityChart flyData={flyData} />
            <WxTempRangeChart data={weatherData.months} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <WxBarChart data={weatherData.months} dataKey="avg_wind_speed_mph" label="Avg Wind Speed (mph)" unit="mph" color="#3498db" />
            <WxBarChart data={weatherData.months} dataKey="avg_precip_inches" label="Precipitation (in)" unit="inches" color="#9b59b6" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <WxBarChart data={weatherData.months} dataKey="avg_humidity_pct" label="Humidity (%)" unit="%" color="#16a085" />
            <WxBarChart data={weatherData.months} dataKey="avg_daylight_hours" label="Daylight Hours" unit="hrs" color="#f39c12" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            <WxBarChart data={weatherData.months} dataKey="avg_rain_days" label="Rain Days / Month" unit="days" color="#2980b9" />
            <WxBarChart data={weatherData.months} dataKey="avg_thunderstorm_days" label="Thunderstorm Days / Month" unit="days" color="#e74c3c" />
          </div>
          {/* Full table */}
          <div style={{ background: "rgba(30,30,34,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5 }}>Monthly Breakdown</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    {["Month","High \u00B0F","Low \u00B0F","Wind mph","Rain Days","Snow","Thunder","Fog","Precip in","Humidity","Vis mi","Daylight","GO","MARG","NO-FLY"].map(h => (
                      <th key={h} style={{ padding: "10px 6px", textAlign: "right", color: "rgba(255,255,255,0.35)", fontWeight: 500, fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weatherData.months.map((m, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "8px 6px", color: "#f1f1f1", fontWeight: 600, textAlign: "left" }}>{WX_MONTHS[i]}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: m.avg_high_f > 104 ? "#e74c3c" : "rgba(255,255,255,0.6)" }}>{Math.round(m.avg_high_f)}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: m.avg_low_f < 32 ? "#3498db" : "rgba(255,255,255,0.6)" }}>{Math.round(m.avg_low_f)}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: m.avg_wind_speed_mph > 25 ? "#e67e22" : "rgba(255,255,255,0.6)" }}>{Math.round(m.avg_wind_speed_mph)}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: "rgba(255,255,255,0.6)" }}>{m.avg_rain_days}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: m.avg_snow_days > 0 ? "#3498db" : "rgba(255,255,255,0.3)" }}>{m.avg_snow_days}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: m.avg_thunderstorm_days > 2 ? "#e74c3c" : "rgba(255,255,255,0.6)" }}>{m.avg_thunderstorm_days}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: "rgba(255,255,255,0.6)" }}>{m.avg_fog_days}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: "rgba(255,255,255,0.6)" }}>{m.avg_precip_inches.toFixed(1)}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: m.avg_humidity_pct > 80 ? "#16a085" : "rgba(255,255,255,0.6)" }}>{m.avg_humidity_pct}%</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: m.avg_visibility_miles < 5 ? "#e67e22" : "rgba(255,255,255,0.6)" }}>{m.avg_visibility_miles}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: "rgba(255,255,255,0.6)" }}>{m.avg_daylight_hours.toFixed(1)}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: "#2ecc71", fontWeight: 600 }}>{flyData[i].flyable}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: "#f39c12" }}>{flyData[i].marginal}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: "#e74c3c" }}>{flyData[i].nofly}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* Legend */}
          <div style={{ background: "rgba(30,30,34,0.5)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 8, padding: "16px 18px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Flyability Classification Criteria</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
              <div><div style={{ color: "#2ecc71", fontWeight: 600, marginBottom: 6 }}>GO — FLYABLE</div><div style={{ color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>Gusts &lt; 25 mph<br />Temp 32–104°F<br />No fog/storms</div></div>
              <div><div style={{ color: "#f39c12", fontWeight: 600, marginBottom: 6 }}>MARGINAL</div><div style={{ color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>Gusts 25–35 mph<br />Temp 14–32°F or 104°F+<br />Fog / low vis</div></div>
              <div><div style={{ color: "#e74c3c", fontWeight: 600, marginBottom: 6 }}>NO-FLY</div><div style={{ color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>Gusts &gt; 35 mph<br />Temp &lt; 14°F or &gt; 113°F<br />Thunderstorms</div></div>
            </div>
          </div>
        </div>
      )}
      {!weatherData && !loading && !error && (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "rgba(255,255,255,0.2)" }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>WX</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>AWAITING TARGET LOCATION</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>Enter a deployment city to generate BVLOS weather intelligence</div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────
const styles = {
  app: { fontFamily: "'Chakra Petch', sans-serif", background: `#000000 url(${BG_IMAGE}) no-repeat center center`, backgroundSize: "cover", backgroundAttachment: "fixed", minHeight: "100vh", color: "#E8ECF4", position: "relative" },
  appOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.50) 30%, rgba(0,0,0,0.65) 60%, rgba(0,0,0,0.75) 100%)", pointerEvents: "none", zIndex: 0 },
  appContent: { position: "relative", zIndex: 1 },
  loadingScreen: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#1C1C1E", color: "#E53935", gap: 16 },
  loadingText: { fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, letterSpacing: 4, opacity: 0.7 },
  container: { maxWidth: 1160, margin: "0 auto", padding: "24px 28px 60px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 16 },
  logoRow: { display: "flex", alignItems: "center", gap: 12, color: "#E53935" },
  logoImg: { width: 48, height: 48, objectFit: "contain" },
  logoTitle: { fontSize: 22, fontWeight: 700, letterSpacing: 3, margin: 0, lineHeight: 1.1, background: "linear-gradient(135deg, #E53935, #FF6B6B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  logoSub: { fontSize: 9, letterSpacing: 4, color: "rgba(255,255,255,0.35)", marginTop: 2, fontWeight: 500 },
  primaryBtn: { display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg, #E53935, #C62828)", color: "#1C1C1E", border: "none", borderRadius: 6, padding: "10px 20px", fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 2, cursor: "pointer" },
  ghostBtn: { background: "transparent", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "10px 20px", fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 2, cursor: "pointer" },
  newProjectCard: { background: "rgba(40,40,42,0.85)", border: "1px solid rgba(229,57,53,0.2)", borderRadius: 10, padding: 24, marginBottom: 24, backdropFilter: "blur(12px)" },
  newProjectGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 },
  fieldLabel: { fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.4)", marginBottom: 6, display: "block", fontWeight: 600 },
  input: { width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "10px 12px", color: "#E8ECF4", fontSize: 14, outline: "none" },
  newProjectActions: { display: "flex", justifyContent: "flex-end", gap: 12 },
  emptyState: { textAlign: "center", padding: "80px 20px", color: "rgba(255,255,255,0.3)" },
  emptyTitle: { fontSize: 20, fontWeight: 600, marginBottom: 8, color: "rgba(255,255,255,0.5)" },
  emptySub: { fontSize: 14, maxWidth: 360, margin: "0 auto" },
  projectGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 14 },
  projectCard: { background: "linear-gradient(160deg, rgba(32,32,36,0.97), rgba(22,22,26,0.99))", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "18px 20px", cursor: "pointer", transition: "all 0.2s", backdropFilter: "blur(16px)", boxShadow: "0 2px 16px rgba(0,0,0,0.35)" },
  projectCardCompleted: { border: "1px solid rgba(34,197,94,0.25)", background: "linear-gradient(160deg, rgba(34,197,94,0.07), rgba(22,22,26,0.99))" },
  columnHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.09)" },
  columnDot: { width: 9, height: 9, borderRadius: "50%", background: "#E53935", flexShrink: 0, boxShadow: "0 0 6px #E5393588" },
  columnTitle: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700, letterSpacing: 3, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" },
  columnCount: { marginLeft: "auto", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)", borderRadius: 4, padding: "2px 10px", border: "1px solid rgba(255,255,255,0.08)" },
  columnEmpty: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "40px 0", textAlign: "center" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardPhaseTag: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase" },
  phaseDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  cardName: { fontSize: 18, fontWeight: 700, marginBottom: 5, lineHeight: 1.25, color: "#FFFFFF" },
  cardClient: { fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 3, fontWeight: 500 },
  cardSite: { display: "flex", alignItems: "center", fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'IBM Plex Mono', monospace" },
  cardProgress: { marginBottom: 8 },
  progressBarBg: { height: 7, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden" },
  progressBarFill: { height: "100%", borderRadius: 4, transition: "width 0.6s ease" },
  progressLabel: { display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: "rgba(255,255,255,0.35)" },
  cardDate: { fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono', monospace" },
  deleteBtn: { background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", padding: 4, borderRadius: 4, lineHeight: 0 },
  detailHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 },
  backBtn: { display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "#E53935", fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 2, cursor: "pointer" },
  searchBox: { display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "6px 12px", color: "rgba(255,255,255,0.3)" },
  searchInput: { background: "none", border: "none", color: "#E8ECF4", fontSize: 13, outline: "none", width: 180 },
  projectInfo: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, gap: 16 },
  projectTitle: { fontSize: 28, fontWeight: 700, marginBottom: 4, lineHeight: 1.2 },
  projectMeta: { display: "flex", gap: 8, fontSize: 14, color: "rgba(255,255,255,0.4)" },
  overallRing: { position: "relative", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  ringText: { position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" },
  ringPct: { fontSize: 18, fontWeight: 700, color: "#E53935", lineHeight: 1 },
  ringLabel: { fontSize: 7, letterSpacing: 2, color: "rgba(255,255,255,0.3)", marginTop: 2 },
  timeline: { display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", marginBottom: 32, padding: "0 8px" },
  timelineDot: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 1 },
  dot: { width: 16, height: 16, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "2px solid rgba(255,255,255,0.15)", transition: "all 0.3s", display: "flex", alignItems: "center", justifyContent: "center" },
  dotLabel: { fontSize: 9, fontWeight: 700, letterSpacing: 1, transition: "color 0.3s" },
  timelineLine: { position: "absolute", top: 7, left: 20, right: 20, height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 1 },
  timelineLineFill: { height: "100%", background: "linear-gradient(90deg, #E53935, #B71C1C)", borderRadius: 1, transition: "width 0.6s ease" },
  phaseGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 },
  phaseCard: { background: "rgba(255,255,255,0.03)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", padding: "0 16px 16px", cursor: "pointer", transition: "all 0.25s ease", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  phaseCardLocked: { opacity: 0.35, pointerEvents: "none", filter: "grayscale(0.5)" },
  phaseCardRibbon: { width: "100%", height: 3, borderRadius: "0 0 4px 4px", marginBottom: 14 },
  phaseCardHeader: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4 },
  phaseCardNum: { fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Chakra Petch', sans-serif" },
  phaseCardTitle: { fontSize: 13, fontWeight: 700, lineHeight: 1.3, marginBottom: 12, fontFamily: "'Chakra Petch', sans-serif", minHeight: 34 },
  phaseCardRing: { position: "relative", width: 56, height: 56, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center" },
  phaseCardRingText: { position: "absolute", fontSize: 13, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" },
  phaseCardStats: { display: "flex", gap: 16, marginBottom: 10 },
  phaseCardStat: { display: "flex", flexDirection: "column", alignItems: "center" },
  phaseCardStatVal: { fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.8)", fontFamily: "'IBM Plex Mono', monospace" },
  phaseCardStatLabel: { fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5, textTransform: "uppercase" },
  phaseCardOwner: { marginTop: "auto", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", width: "100%" },
  phaseCardOwnerName: { fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)" },
  phaseCardOwnerEmpty: { fontSize: 10, color: "rgba(255,255,255,0.2)", fontStyle: "italic" },
  phaseDetailPanel: { padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.1)", marginBottom: 24 },
  phaseDetailHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  phaseDetailClose: { background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 4, borderRadius: 6, display: "flex", flexShrink: 0 },
  phaseLabel: { fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.35)", fontWeight: 600 },
  phaseDesc: { fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 16, lineHeight: 1.6, fontFamily: "'IBM Plex Mono', monospace" },
  taskCard: { background: "rgba(45,45,48,0.6)", border: "1px solid rgba(255,255,255,0.05)", borderLeft: "3px solid rgba(255,255,255,0.08)", borderRadius: 8, marginBottom: 8, overflow: "hidden" },
  taskTop: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" },
  checkbox: { width: 22, height: 22, borderRadius: 5, flexShrink: 0, border: "2px solid rgba(255,255,255,0.2)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#1C1C1E", transition: "all 0.2s", padding: 0 },
  taskInfo: { flex: 1, cursor: "pointer" },
  taskTitle: { fontSize: 14, fontWeight: 600, transition: "all 0.2s" },
  taskBadges: { display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" },
  subtaskBadge: { fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono', monospace", background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 4 },
  assigneeBadge: { fontSize: 10, color: "#E53935", fontFamily: "'IBM Plex Mono', monospace", background: "rgba(229,57,53,0.12)", padding: "2px 8px", borderRadius: 4 },
  dueDateBadge: { fontSize: 10, color: "#FCA5A5", fontFamily: "'IBM Plex Mono', monospace", display: "flex", alignItems: "center", gap: 4, background: "rgba(255,171,145,0.1)", padding: "2px 8px", borderRadius: 4 },
  attachBadge: { fontSize: 10, color: "#E53935", fontFamily: "'IBM Plex Mono', monospace", display: "flex", alignItems: "center", gap: 4, background: "rgba(229,57,53,0.08)", padding: "2px 8px", borderRadius: 4 },
  chevronSm: { color: "rgba(255,255,255,0.2)", transition: "transform 0.2s", display: "flex", cursor: "pointer", padding: 4 },
  taskExpanded: { padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)" },
  subtaskList: { marginTop: 12, marginBottom: 16 },
  subtaskRow: { display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0", cursor: "pointer" },
  subCheck: { width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1, border: "1.5px solid rgba(255,255,255,0.18)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" },
  subtaskText: { fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.4, transition: "all 0.2s" },
  taskFields: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 14 },
  fieldRow: {},
  fieldLabelSm: { fontSize: 9, letterSpacing: 2, color: "rgba(255,255,255,0.3)", marginBottom: 4, display: "block", fontWeight: 600 },
  fieldInput: { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "8px 10px", color: "#E8ECF4", fontSize: 12, outline: "none", fontFamily: "'IBM Plex Mono', monospace" },
  attachSection: { marginTop: 14, background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 14 },
  attachHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  attachBtn: { display: "flex", alignItems: "center", gap: 6, background: "rgba(229,57,53,0.12)", color: "#E53935", border: "1px solid rgba(229,57,53,0.25)", borderRadius: 5, padding: "5px 12px", fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 1, cursor: "pointer" },
  attachEmpty: { fontSize: 12, color: "rgba(255,255,255,0.25)", fontFamily: "'IBM Plex Mono', monospace", fontStyle: "italic", padding: "8px 0" },
  attachList: { display: "flex", flexDirection: "column", gap: 6 },
  attachItem: { display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: "8px 12px" },
  attachFileIcon: { fontSize: 18, flexShrink: 0, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)", borderRadius: 5 },
  attachInfo: { flex: 1, minWidth: 0 },
  attachName: { fontSize: 12, fontWeight: 600, color: "#E8ECF4", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  attachMeta: { fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono', monospace", marginTop: 1 },
  attachActions: { display: "flex", gap: 4, flexShrink: 0 },
  attachActionBtn: { background: "none", border: "none", color: "#E53935", cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" },
  // View Toggle
  viewToggleBtn: { display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 11, fontFamily: "'Chakra Petch', sans-serif", fontWeight: 600, letterSpacing: 0.5, transition: "all 0.2s" },
  viewToggleActive: { background: "rgba(229,57,53,0.15)", borderColor: "rgba(229,57,53,0.4)", color: "#E53935" },
  // Kanban
  kanbanBoard: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 },
  kanbanColumn: { background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", minHeight: 200, display: "flex", flexDirection: "column" },
  kanbanColumnHeader: { display: "flex", alignItems: "center", gap: 8, padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  kanbanColumnDot: { width: 8, height: 8, borderRadius: "50%" },
  kanbanColumnTitle: { fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "rgba(255,255,255,0.6)", fontFamily: "'Chakra Petch', sans-serif" },
  kanbanColumnCount: { fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.25)", marginLeft: "auto", background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 10 },
  kanbanColumnBody: { padding: 10, display: "flex", flexDirection: "column", gap: 8, flex: 1 },
  kanbanCard: { background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid rgba(255,255,255,0.1)", transition: "background 0.2s" },
  kanbanCardPhase: { fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 4 },
  kanbanCardTitle: { fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 8, lineHeight: 1.3 },
  kanbanCardMeta: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  kanbanProgress: { flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" },
  kanbanProgressBar: { height: "100%", borderRadius: 2, transition: "width 0.4s ease" },
  kanbanCardSub: { fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 },
  kanbanCardFooter: { display: "flex", gap: 8, flexWrap: "wrap" },
  kanbanCardAssignee: { fontSize: 10, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 6, fontWeight: 600 },
  kanbanCardDue: { fontSize: 10, color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: 3 },
  kanbanEmpty: { fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "center", padding: 24, fontStyle: "italic" },
  // Pricing
  pricingContainer: { marginBottom: 24 },
  pricingHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" },
  pricingTitle: { fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.9)", fontFamily: "'Chakra Petch', sans-serif", margin: 0 },
  pricingSubtitle: { fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4, margin: "4px 0 0" },
  pricingTotal: { textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end" },
  pricingTotalLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,0.35)" },
  pricingTotalAmount: { fontSize: 28, fontWeight: 700, color: "#E53935", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.2 },
  pricingTBDNote: { fontSize: 10, color: "rgba(255,255,255,0.3)", fontStyle: "italic", marginTop: 2 },
  pricingCategory: { marginBottom: 16, background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" },
  pricingCatHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" },
  pricingCatName: { fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", fontFamily: "'Chakra Petch', sans-serif" },
  pricingCatTotal: { fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.7)", fontFamily: "'IBM Plex Mono', monospace" },
  pricingRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.03)" },
  pricingItemDot: { width: 6, height: 6, borderRadius: "50%", background: "#E53935", flexShrink: 0 },
  pricingItemName: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: 500, flexShrink: 0 },
  pricingItemLine: { flex: 1, height: 1, background: "rgba(255,255,255,0.06)", borderBottom: "1px dashed rgba(255,255,255,0.08)" },
  pricingItemPrice: { fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.8)", fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0, minWidth: 60, textAlign: "right" },
  pricingItemTBD: { fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.25)", fontFamily: "'IBM Plex Mono', monospace", fontStyle: "italic", flexShrink: 0, minWidth: 60, textAlign: "right" },
  pricingItemX: { fontSize: 12, color: "rgba(255,255,255,0.2)", flexShrink: 0, margin: "0 2px" },
  pricingQtyWrap: { display: "flex", alignItems: "center", gap: 0, flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden" },
  pricingQtyBtn: { width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" },
  pricingQtyInput: { width: 36, height: 28, textAlign: "center", border: "none", background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", outline: "none" },
  pricingLineTotal: { fontSize: 13, fontWeight: 700, color: "#E53935", fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0, minWidth: 80, textAlign: "right" },
};

// ─── EQUIPMENT TRACKER ────────────────────────────────────────────────────
function EquipmentTracker({ equipment, setEquipment, projects, teamMembers, onBack }) {
  const [_view, _setView] = useState("all"); // eslint-disable-line no-unused-vars
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [collapsedProjects, setCollapsedProjects] = useState({});
  const toggleProject = (id) => setCollapsedProjects(prev => ({ ...prev, [id]: !prev[id] }));
  const [groups, setGroups] = useState([]); // custom group names
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const emptyForm = { name: "", serialNumber: "", faaRegNumber: "", assignedOperator: "", assignedProjectId: "", group: "", dateOrdered: "", dateReceived: "", status: "ordered", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const statusColors = {
    ordered: "#F59E0B",
    "in-transit": "#3B82F6",
    received: "#8B5CF6",
    deployed: "#22C55E",
    maintenance: "#F97316",
    decommissioned: "#6B7280",
  };
  const statusLabels = {
    ordered: "ORDERED",
    "in-transit": "SHIPPED",
    received: "DELIVERED",
    deployed: "OPERATIONAL",
    maintenance: "MAINTENANCE REQ.",
    decommissioned: "DECOMMISSIONED",
  };
  const [inlineEdit, setInlineEdit] = useState(null); // { id, field }
  const [inlineVal, setInlineVal] = useState("");

  // Derive auto-populated entries from equipment picker (Phase 1 task 1-4) and Phase 2 procurement tasks
  const autoProcured = [];
  for (const proj of projects) {
    // ── From equipment picker (task 1-4) ──
    const pickerTask = proj.phases.flatMap(ph => ph.tasks).find(t => t.equipmentPicker);
    if (pickerTask?.equipmentSelections) {
      Object.entries(pickerTask.equipmentSelections).forEach(([itemName, qty]) => {
        if (!qty || qty <= 0) return;
        const cat = PRICING_CATALOG.find(i => i.name === itemName)?.category || "";
        for (let unit = 1; unit <= qty; unit++) {
          const autoId = `auto-picker-${proj.id}-${itemName}-${unit}`;
          if (!equipment.some(e => e.autoId === autoId)) {
            autoProcured.push({
              id: autoId, autoId,
              name: qty > 1 ? `${itemName} #${unit}` : itemName,
              serialNumber: "", faaRegNumber: "", assignedOperator: "",
              assignedProjectId: proj.id,
              group: cat,
              dateOrdered: "", dateReceived: "",
              status: "ordered",
              notes: "", isAuto: true,
              projectName: proj.name,
            });
          }
        }
      });
    }
    // ── From Phase 2 procurement trackDates tasks ──
    const phase2 = proj.phases.find(ph => ph.id === "phase-2");
    if (!phase2) continue;
    for (const task of phase2.tasks) {
      if (!task.trackDates || !task.orderTracking) continue;
      task.subtasks.forEach((subtaskName, i) => {
        const tracking = task.orderTracking[i] || {};
        const isSelected = task.subtaskStatus?.[i];
        if (isSelected || tracking.ordered) {
          const cleanName = subtaskName.replace(/\s*[→–-]\s*.+$/, "").trim();
          const autoId = `auto-${proj.id}-${task.id}-${i}`;
          if (!equipment.some(e => e.autoId === autoId)) {
            autoProcured.push({
              id: autoId, autoId,
              name: cleanName,
              serialNumber: "", faaRegNumber: "", assignedOperator: "",
              assignedProjectId: proj.id,
              group: "",
              dateOrdered: tracking.ordered || "",
              dateReceived: tracking.delivered || "",
              status: tracking.delivered ? "received" : tracking.shipped ? "in-transit" : "ordered",
              notes: "", isAuto: true,
              projectName: proj.name,
            });
          }
        }
      });
    }
  }

  const deletedAutoIds = new Set(equipment.filter(e => e._deleted).map(e => e.autoId).filter(Boolean));
  const merged = [...equipment.filter(e => !e._deleted), ...autoProcured.filter(a => !deletedAutoIds.has(a.autoId))];

  const filtered = merged.filter(e => {
    if (search) {
      const q = search.toLowerCase();
      const projName = projects.find(p => p.id === e.assignedProjectId)?.name || e.projectName || "";
      if (!e.name.toLowerCase().includes(q) && !(e.serialNumber || "").toLowerCase().includes(q) && !(e.faaRegNumber || "").toLowerCase().includes(q) && !(e.assignedOperator || "").toLowerCase().includes(q) && !projName.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const openAdd = () => { setForm(emptyForm); setEditId(null); setShowForm(true); };
  const openEdit = (item) => {
    setForm({
      name: item.name || "",
      serialNumber: item.serialNumber || "",
      faaRegNumber: item.faaRegNumber || "",
      assignedOperator: item.assignedOperator || "",
      assignedProjectId: item.assignedProjectId || "",
      group: item.group || "",
      dateOrdered: item.dateOrdered || "",
      dateReceived: item.dateReceived || "",
      status: item.status || "ordered",
      notes: item.notes || "",
    });
    setEditId(item.id);
    setShowForm(true);
  };

  const saveForm = () => {
    if (!form.name.trim()) return;
    const editingItem = merged.find(e => e.id === editId);
    if (editId && editingItem) {
      if (editingItem.isAuto) {
        // Convert auto item to manual override
        const newEntry = { ...form, id: "eq-" + Date.now(), autoId: editingItem.autoId, isAuto: false };
        setEquipment([...equipment, newEntry]);
      } else {
        setEquipment(equipment.map(e => e.id === editId ? { ...e, ...form } : e));
      }
    } else {
      setEquipment([...equipment, { ...form, id: "eq-" + Date.now() }]);
    }
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const deleteItem = (item) => {
    if (item.isAuto) {
      // Convert auto item to a "deleted" manual override so it doesn't reappear
      setEquipment([...equipment, { ...item, id: "eq-del-" + Date.now(), _deleted: true, isAuto: false }]);
    } else {
      setEquipment(equipment.filter(e => e.id !== item.id));
    }
  };

  const startInline = (item, field) => {
    setInlineEdit({ id: item.id || item.autoId, field });
    setInlineVal(item[field] || "");
  };
  const commitInline = (item) => {
    if (!inlineEdit) return;
    const updates = { [inlineEdit.field]: inlineVal };
    if (item.isAuto) {
      setEquipment([...equipment, { ...item, id: "eq-" + Date.now(), isAuto: false, ...updates }]);
    } else {
      setEquipment(equipment.map(e => e.id === item.id ? { ...e, ...updates } : e));
    }
    setInlineEdit(null);
    setInlineVal("");
  };
  const isEditing = (item, field) => inlineEdit?.id === (item.id || item.autoId) && inlineEdit?.field === field;

  // Stats
  const totalItems = merged.length;
  const deployedCount = merged.filter(e => e.status === "deployed").length;
  const inTransitCount = merged.filter(e => e.status === "in-transit").length;
  const maintenanceCount = merged.filter(e => e.status === "maintenance").length;

  const getProjName = (item) => projects.find(p => p.id === item.assignedProjectId)?.name || item.projectName || "—";

  const StatusBadge = ({ status }) => {
    const color = statusColors[status] || "#6B7280";
    return (
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 600, letterSpacing: 0.8, color, background: `${color}26`, border: `1px solid ${color}44`, borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap" }}>
        {statusLabels[status] || status}
      </span>
    );
  };

  const inputSm = { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 12px", color: "#E8ECF4", fontSize: 12, outline: "none", fontFamily: "'IBM Plex Mono', monospace" };
  const labelSm = { display: "block", fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: "rgba(255,255,255,0.35)", marginBottom: 5, textTransform: "uppercase" };
  const inlineCellStyle = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.35)", cursor: "text", borderRadius: 4, padding: "2px 4px", transition: "background 0.15s" };
  const inlineInputStyle = { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(196,30,58,0.5)", borderRadius: 4, padding: "2px 6px", color: "#E8ECF4", fontSize: 11, outline: "none", fontFamily: "'IBM Plex Mono', monospace", width: "100%" };

  const EquipRow = ({ item, showProject }) => (
    <div style={{ display: "grid", gridTemplateColumns: showProject ? "2fr 1fr 1fr 1fr 1fr 1fr auto" : "2fr 1fr 1fr 1fr 1fr auto", gap: 0, padding: "11px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center", transition: "background 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      {/* Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 600, color: "#E8ECF4" }}>{item.name}</span>
        {item.isAuto && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, fontWeight: 700, color: "#F59E0B", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 3, padding: "1px 5px" }}>AUTO</span>}
      </div>
      {/* Project (optional column) */}
      {showProject && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{getProjName(item)}</div>}
      {/* Serial # — inline editable */}
      <div onClick={() => { startInline(item, "serialNumber"); }}>
        {isEditing(item, "serialNumber") ? (
          <input autoFocus style={inlineInputStyle} value={inlineVal} onChange={e => setInlineVal(e.target.value)}
            onBlur={() => commitInline(item)}
            onKeyDown={e => { if (e.key === "Enter") commitInline(item); if (e.key === "Escape") { setInlineEdit(null); } }}
          />
        ) : (
          <span style={{ ...inlineCellStyle, color: item.serialNumber ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            title="Click to edit">{item.serialNumber || "click to add"}</span>
        )}
      </div>
      {/* FAA Reg # — inline editable */}
      <div onClick={() => startInline(item, "faaRegNumber")}>
        {isEditing(item, "faaRegNumber") ? (
          <input autoFocus style={inlineInputStyle} value={inlineVal} onChange={e => setInlineVal(e.target.value)}
            onBlur={() => commitInline(item)}
            onKeyDown={e => { if (e.key === "Enter") commitInline(item); if (e.key === "Escape") setInlineEdit(null); }}
          />
        ) : (
          <span style={{ ...inlineCellStyle, color: item.faaRegNumber ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            title="Click to edit">{item.faaRegNumber || "click to add"}</span>
        )}
      </div>
      {/* Operator — inline dropdown */}
      <div>
        {isEditing(item, "assignedOperator") ? (
          <select autoFocus style={{ ...inlineInputStyle, padding: "2px 4px" }} value={inlineVal} onChange={e => setInlineVal(e.target.value)}
            onBlur={() => commitInline(item)}
            onKeyDown={e => { if (e.key === "Escape") setInlineEdit(null); }}
          >
            <option value="">— Unassigned —</option>
            {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ""}</option>)}
          </select>
        ) : (
          <span style={{ ...inlineCellStyle, color: item.assignedOperator ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)" }}
            onClick={() => startInline(item, "assignedOperator")}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            title="Click to assign operator">{item.assignedOperator || "unassigned"}</span>
        )}
      </div>
      {/* Status — inline dropdown */}
      <div>
        {isEditing(item, "status") ? (
          <select autoFocus style={{ ...inlineInputStyle, padding: "2px 4px", color: statusColors[inlineVal] || "#E8ECF4" }} value={inlineVal} onChange={e => setInlineVal(e.target.value)}
            onBlur={() => commitInline(item)}
            onKeyDown={e => { if (e.key === "Escape") setInlineEdit(null); }}
          >
            {Object.entries(statusLabels).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
          </select>
        ) : (
          <span onClick={() => startInline(item, "status")} title="Click to change status" style={{ cursor: "pointer" }}>
            <StatusBadge status={item.status} />
          </span>
        )}
      </div>
      {/* Actions */}
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
        <button onClick={() => openEdit(item)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: "4px 8px", display: "flex", alignItems: "center" }} title="Edit all fields">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button onClick={() => deleteItem(item)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, cursor: "pointer", color: "rgba(255,100,100,0.5)", padding: "4px 8px", display: "flex", alignItems: "center" }} title={item.isAuto ? "Remove from tracker" : "Delete"}>
          {Icons.trash}
        </button>
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button style={styles.backBtn} onClick={onBack}>{Icons.back}</button>
          <img src={LOGO_IMAGE} alt="Deus X" style={{ width: 40, height: 40, objectFit: "contain" }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1, fontFamily: "'Chakra Petch', sans-serif", color: "#E8ECF4" }}>EQUIPMENT TRACKER</h2>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 1.5, marginTop: 2 }}>DEUS X DEFENSE</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...styles.ghostBtn, borderColor: "rgba(139,92,246,0.3)", color: "#8B5CF6" }} onClick={() => setAddingGroup(true)}>{Icons.plus}<span>NEW GROUP</span></button>
          <button style={styles.primaryBtn} onClick={openAdd}>{Icons.plus}<span>ADD EQUIPMENT</span></button>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "TOTAL ITEMS", value: totalItems, color: "#E8ECF4", icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M6 4V3a3 3 0 016 0v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M2 9h14" stroke="currentColor" strokeWidth="1.4"/></svg> },
          { label: "DEPLOYED", value: deployedCount, color: "#22C55E", icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2l2 5h5l-4 3 1.5 5L9 12l-4.5 3L6 10 2 7h5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg> },
          { label: "IN TRANSIT", value: inTransitCount, color: "#3B82F6", icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="7" width="13" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M14 10l2-1.5V13h-2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><circle cx="5" cy="15" r="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="12" cy="15" r="1.5" stroke="currentColor" strokeWidth="1.2"/></svg> },
          { label: "MAINTENANCE", value: maintenanceCount, color: "#F97316", icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M15 3l-4 4-2-1-1 2 1 2 2-1 4-4a4 4 0 01-4 8 4 4 0 01-4-4 4 4 0 018-6z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ color, opacity: 0.8 }}>{icon}</div>
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", pointerEvents: "none" }}>{Icons.search}</div>
          <input
            style={{ ...inputSm, paddingLeft: 32 }}
            placeholder="Search equipment, serial #, operator, project..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div style={{ background: "rgba(20,20,24,0.98)", border: "1px solid rgba(196,30,58,0.35)", borderRadius: 14, padding: "20px 24px", marginBottom: 24, animation: "fadeSlideIn 0.25s ease" }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, color: "#C41E3A", letterSpacing: 1.5, marginBottom: 16 }}>{editId ? "EDIT EQUIPMENT" : "ADD EQUIPMENT"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelSm}>Equipment Name *</label>
              <input style={inputSm} placeholder="e.g. DJI Dock 3" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "2 / -1" }}>
              <label style={labelSm}>Group / Category</label>
              {groups.length > 0 ? (
                <select style={{ ...inputSm, color: form.group ? "#E8ECF4" : "rgba(255,255,255,0.3)" }} value={form.group} onChange={e => setForm(f => ({ ...f, group: e.target.value === "__new__" ? "" : e.target.value }))}>
                  <option value="">— No group —</option>
                  {groups.map(g => <option key={g} value={g}>{g}</option>)}
                  <option value="__new__">+ Create new group...</option>
                </select>
              ) : (
                <input style={inputSm} placeholder="e.g. DJI Dock 3, DAA, Accessories..." value={form.group} onChange={e => setForm(f => ({ ...f, group: e.target.value }))} />
              )}
            </div>
            <div>
              <label style={labelSm}>Serial Number</label>
              <input style={inputSm} placeholder="e.g. SN-123456" value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
            </div>
            <div>
              <label style={labelSm}>FAA Registration #</label>
              <input style={inputSm} placeholder="e.g. FA3-1234567" value={form.faaRegNumber} onChange={e => setForm(f => ({ ...f, faaRegNumber: e.target.value }))} />
            </div>
            <div>
              <label style={labelSm}>Assigned Operator</label>
              {teamMembers.length > 0 ? (
                <select style={{ ...inputSm }} value={form.assignedOperator} onChange={e => setForm(f => ({ ...f, assignedOperator: e.target.value }))}>
                  <option value="">— Unassigned —</option>
                  {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ""}</option>)}
                  <option value="__custom__">Other (type below)</option>
                </select>
              ) : (
                <input style={inputSm} placeholder="e.g. Tyler Morris" value={form.assignedOperator} onChange={e => setForm(f => ({ ...f, assignedOperator: e.target.value }))} />
              )}
            </div>
            <div>
              <label style={labelSm}>Assigned Project</label>
              <select style={{ ...inputSm }} value={form.assignedProjectId} onChange={e => setForm(f => ({ ...f, assignedProjectId: e.target.value }))}>
                <option value="">— None —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSm}>Status</label>
              <select style={{ ...inputSm, color: statusColors[form.status] || "#E8ECF4" }} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {Object.entries(statusLabels).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSm}>Date Ordered</label>
              <input type="date" style={inputSm} value={form.dateOrdered} onChange={e => setForm(f => ({ ...f, dateOrdered: e.target.value }))} />
            </div>
            <div>
              <label style={labelSm}>Date Received</label>
              <input type="date" style={inputSm} value={form.dateReceived} onChange={e => setForm(f => ({ ...f, dateReceived: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelSm}>Notes</label>
              <textarea style={{ ...inputSm, height: 70, resize: "vertical" }} placeholder="Additional notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button style={styles.ghostBtn} onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }}>CANCEL</button>
            <button style={{ ...styles.primaryBtn, opacity: form.name.trim() ? 1 : 0.4 }} onClick={saveForm}>SAVE EQUIPMENT</button>
          </div>
        </div>
      )}

      {/* Content — two fixed sections: Operator Assigned, then per-Project */}
      {filtered.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyTitle}>No Equipment Found</div>
          <div style={styles.emptySub}>{search ? "No items match your search." : "Add equipment or mark procurement items in Phase 4 of a project."}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

          {/* ── SECTION 2: Per-Project Sections ── */}
          {(() => {
            // Build list of all projects that have equipment (exclude unassigned)
            const projectIds = [...new Set(filtered.filter(e => e.assignedProjectId).map(e => e.assignedProjectId))];
            const orderedProjects = projects.filter(p => projectIds.includes(p.id));
            if (orderedProjects.length === 0) return null;
            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 3, height: 18, background: "#3B82F6", borderRadius: 2 }} />
                  <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Equipment by Project</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", padding: "2px 10px", borderRadius: 10 }}>{orderedProjects.length} PROJECT{orderedProjects.length !== 1 ? "S" : ""}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {orderedProjects.map(proj => {
                    const projItems = filtered.filter(e => e.assignedProjectId === proj.id);
                    if (projItems.length === 0) return null;
                    const isCollapsed = !!collapsedProjects[proj.id];
                    return (
                      <div key={proj.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
                        {/* Project header — click to collapse/expand */}
                        <div onClick={() => toggleProject(proj.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", background: "rgba(255,255,255,0.03)", borderBottom: isCollapsed ? "none" : "1px solid rgba(255,255,255,0.05)", cursor: "pointer", userSelect: "none", transition: "background 0.15s" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.055)"}
                          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", color: "rgba(255,255,255,0.35)" }}>
                            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#C41E3A", boxShadow: "0 0 7px #C41E3A88", flexShrink: 0, display: "inline-block" }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, fontWeight: 700, color: "#E8ECF4", letterSpacing: 0.3 }}>{proj.name}</div>
                            {(proj.client || proj.site) && (
                              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
                                {[proj.client, proj.site].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </div>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.06)", padding: "2px 10px", borderRadius: 10, flexShrink: 0 }}>{projItems.length} ITEM{projItems.length !== 1 ? "S" : ""}</span>
                          <button onClick={e => { e.stopPropagation(); setForm({ ...emptyForm, assignedProjectId: proj.id }); setEditId(null); setShowForm(true); }} style={{ background: "rgba(196,30,58,0.15)", border: "1px solid rgba(196,30,58,0.3)", borderRadius: 6, cursor: "pointer", color: "#C41E3A", padding: "4px 10px", fontSize: 11, fontFamily: "'Chakra Petch', sans-serif", letterSpacing: 0.5, flexShrink: 0 }}>+ Add</button>
                        </div>
                        {/* Collapsible body */}
                        {!isCollapsed && (() => {
                          const subGroups = [...new Set(projItems.map(i => i.group || ""))];
                          const hasGroups = subGroups.some(g => g);
                          return (
                            <>
                            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", gap: 0, padding: "7px 18px", background: "rgba(0,0,0,0.15)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                              {["NAME", "SERIAL #", "FAA REG #", "OPERATOR", "STATUS", ""].map((h, i) => (
                                <div key={i} style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.25)" }}>{h}</div>
                              ))}
                            </div>
                            {hasGroups ? subGroups.map(grp => {
                              const grpItems = projItems.filter(i => (i.group || "") === grp);
                              return (
                                <div key={grp || "__nogrp__"}>
                                  {grp && <div style={{ padding: "5px 18px", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "#C41E3A", background: "rgba(196,30,58,0.06)", borderBottom: "1px solid rgba(196,30,58,0.1)", textTransform: "uppercase", fontFamily: "'Chakra Petch', sans-serif" }}>{grp}</div>}
                                  {grpItems.map(item => <EquipRow key={item.id || item.autoId} item={item} />)}
                                </div>
                              );
                            }) : projItems.map(item => <EquipRow key={item.id || item.autoId} item={item} />)}
                            </>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── SECTION 3: Custom Groups ── */}
          {(addingGroup || groups.length > 0) && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 3, height: 18, background: "#8B5CF6", borderRadius: 2 }} />
                <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Custom Groups</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", padding: "2px 10px", borderRadius: 10 }}>{groups.length} GROUP{groups.length !== 1 ? "S" : ""}</span>
              </div>
              {addingGroup && (
                <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
                  <input autoFocus style={{ ...inputSm, flex: 1 }} placeholder="Group name (e.g. Site A Equipment, Spare Parts...)" value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newGroupName.trim()) { setGroups(g => [newGroupName.trim(), ...g]); setNewGroupName(""); setAddingGroup(false); }
                      if (e.key === "Escape") { setAddingGroup(false); setNewGroupName(""); }
                    }} />
                  <button style={styles.primaryBtn} onClick={() => { if (newGroupName.trim()) { setGroups(g => [newGroupName.trim(), ...g]); setNewGroupName(""); setAddingGroup(false); } }}>CREATE</button>
                  <button style={styles.ghostBtn} onClick={() => { setAddingGroup(false); setNewGroupName(""); }}>✕</button>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {groups.map(grpName => {
                  const grpItems = filtered.filter(e => e.group === grpName);
                  const isCollapsed = !!collapsedProjects[`grp-${grpName}`];
                  return (
                    <div key={grpName} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
                      {/* Group header — same layout as project header */}
                      <div onClick={() => toggleProject(`grp-${grpName}`)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", background: "rgba(255,255,255,0.03)", borderBottom: isCollapsed ? "none" : "1px solid rgba(255,255,255,0.05)", cursor: "pointer", userSelect: "none", transition: "background 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.055)"}
                        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", color: "rgba(255,255,255,0.35)" }}><path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#8B5CF6", boxShadow: "0 0 7px #8B5CF688", flexShrink: 0, display: "inline-block" }} />
                        <div style={{ flex: 1, fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, fontWeight: 700, color: "#E8ECF4", letterSpacing: 0.3 }}>{grpName}</div>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.06)", padding: "2px 10px", borderRadius: 10, flexShrink: 0 }}>{grpItems.length} ITEM{grpItems.length !== 1 ? "S" : ""}</span>
                        <button onClick={e => { e.stopPropagation(); setForm({ ...emptyForm, group: grpName }); setEditId(null); setShowForm(true); }} style={{ background: "rgba(196,30,58,0.15)", border: "1px solid rgba(196,30,58,0.3)", borderRadius: 6, cursor: "pointer", color: "#C41E3A", padding: "4px 10px", fontSize: 11, fontFamily: "'Chakra Petch', sans-serif", letterSpacing: 0.5, flexShrink: 0 }}>+ Add</button>
                        <button onClick={e => { e.stopPropagation(); setGroups(g => g.filter(n => n !== grpName)); }} style={{ background: "none", border: "1px solid rgba(255,100,100,0.2)", borderRadius: 4, cursor: "pointer", color: "rgba(255,100,100,0.4)", padding: "4px 8px", fontSize: 11, flexShrink: 0 }} title="Delete group">✕</button>
                      </div>
                      {!isCollapsed && (
                        grpItems.length === 0 ? (
                          <div style={{ padding: "20px 18px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>No items yet — click "+ Add" to add equipment to this group.</div>
                        ) : (
                          <>
                          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", gap: 0, padding: "7px 18px", background: "rgba(0,0,0,0.15)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            {["NAME", "SERIAL #", "FAA REG #", "OPERATOR", "STATUS", ""].map((h, i) => <div key={i} style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.25)" }}>{h}</div>)}
                          </div>
                          {grpItems.map(item => <EquipRow key={item.id || item.autoId} item={item} />)}
                          </>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default App;
