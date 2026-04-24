export interface ProjectSummary {
  id: string
  name: string
  client: string
  site: string
  createdAt: string
  totalTasks: number
  doneTasks: number
  hubspotDealId?: string
  currentStage?: number | null
  faaAuthorizationRequired: boolean
  faaAuthStartedAt: string | null
}

export interface ProjectFull {
  id: string
  name: string
  client: string
  site: string
  createdAt: string
  mapCache: string | null
  airspaceCache: string | null
  networkCache: string | null
  weatherCache: string | null
  phases: Phase[]
  branchAnswers: Record<string, boolean>
  hubspotDealId?: string
  faaAuthorizationRequired: boolean
  faaAuthStartedAt: string | null
}

// ── HubSpot ───────────────────────────────────────────────────────────────────

export interface HubSpotDealProperties {
  dealname?: string
  dealstage?: string
  amount?: string
  closedate?: string
  pipeline?: string
  description?: string
  hs_lastmodifieddate?: string
  hubspot_owner_id?: string
}

export interface HubSpotContact {
  id: string
  properties: {
    firstname?: string
    lastname?: string
    email?: string
    phone?: string
    jobtitle?: string
    company?: string
  }
}

export interface HubSpotDeal {
  id: string
  properties: HubSpotDealProperties
  pinned?: boolean
  companyDetails?: Array<{ id: string; properties: { name?: string; domain?: string } }>
  contactDetails?: HubSpotContact[]
}

export interface HubSpotActiveDeal {
  projectId: string
  deal: HubSpotDeal
}

export interface HubSpotStatus {
  connected: boolean
}

export interface HubSpotOwner {
  id: string
  firstName?: string
  lastName?: string
  email?: string
}

export interface Phase {
  id: string
  projectId: string
  phaseNumber: number
  title: string
  color: string
  description: string
  owner: string
  unlocked: boolean
  completedAt: string | null
  sortOrder: number
  tasks: Task[]
}

export interface Task {
  id: string
  phaseId: string
  projectId: string
  title: string
  completed: boolean
  notes: string
  dueDate: string
  assignee: string
  isGate: boolean
  isCustom: boolean
  trackDates: boolean
  hasStakeholders: boolean
  hasEquipmentPicker: boolean
  sortOrder: number
  roleTag: string
  stageNumber: number | null
  subtasks: Subtask[]
  stakeholderContacts: Contact[]
  attachments: AttachmentMeta[]
}

export interface Subtask {
  id: number
  taskId: string
  sortIndex: number
  text: string
  isDone: boolean
  note: string
  otOrdered: string
  otShipped: string
  otEta: string
  otDelivered: string
  otReceivedBy: string
  priority: string
  conditionKey: string
}

export interface Contact {
  id: number
  taskId: string
  slotIndex: number
  name: string
  email: string
  phone: string
}

export interface AttachmentMeta {
  id: string
  taskId: string
  name: string
  mimeType: string
  sizeBytes: number
  addedAt: string
  addedBy: string
}

export interface TeamMember {
  id: string
  name: string
  role: string
  email: string
}

export interface AdminTask {
  id: string
  title: string
  description: string
  assignee: string
  dueDate: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'todo' | 'inprogress' | 'done'
  createdAt: string
}

// Request bodies
export interface CreateProject {
  name: string
  client?: string
  site?: string
}

export interface UpdateProject {
  name?: string
  client?: string
  site?: string
  mapCache?: string | null
  airspaceCache?: string | null
  networkCache?: string | null
  weatherCache?: string | null
  faaAuthorizationRequired?: boolean
}

export interface UpdatePhase {
  owner?: string
  unlocked?: boolean
  completedAt?: string | null
}

export interface UpdateTask {
  title?: string
  completed?: boolean
  notes?: string
  dueDate?: string
  assignee?: string
}

export interface UpdateSubtask {
  text?: string
  isDone?: boolean
  note?: string
  otOrdered?: string
  otShipped?: string
  otEta?: string
  otDelivered?: string
  otReceivedBy?: string
}

export interface UpdateContact {
  name?: string
  email?: string
  phone?: string
}

// ── Equipment ─────────────────────────────────────────────────────────────────

export interface EquipmentItem {
  id: string
  projectId: string | null
  sectionId: string | null
  subtaskId: number | null
  name: string
  serialNumber: string
  faaRegNumber: string
  status: string
  operator: string
  qty: number
  notes: string
  dateOrdered: string
  dateReceived: string
  groupName: string
  createdAt: string
  isVirtual: boolean
}

export interface EquipmentSection {
  id: string
  name: string
  createdAt: string
}

export interface CreateEquipment {
  name: string
  serialNumber?: string
  faaRegNumber?: string
  status?: string
  operator?: string
  qty?: number
  notes?: string
  subtaskId?: number | null
  dateOrdered?: string
  dateReceived?: string
  groupName?: string
}

export interface UpdateEquipment {
  name?: string
  serialNumber?: string
  faaRegNumber?: string
  status?: string
  operator?: string
  qty?: number
  notes?: string
  dateOrdered?: string
  dateReceived?: string
  groupName?: string
  reassignProjectId?: string
  reassignSectionId?: string
}
