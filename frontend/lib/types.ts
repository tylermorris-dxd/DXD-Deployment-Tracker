export interface ProjectSummary {
  id: string
  name: string
  client: string
  site: string
  createdAt: string
  totalTasks: number
  doneTasks: number
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
  projectId: string
  subtaskId: number | null
  name: string
  serialNumber: string
  status: string
  operator: string
  qty: number
  notes: string
  createdAt: string
  isVirtual: boolean
}

export interface CreateEquipment {
  name: string
  serialNumber?: string
  status?: string
  operator?: string
  qty?: number
  notes?: string
  subtaskId?: number | null
}

export interface UpdateEquipment {
  name?: string
  serialNumber?: string
  status?: string
  operator?: string
  qty?: number
  notes?: string
}
