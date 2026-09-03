import type {
  ProjectSummary, ProjectFull, Phase, Task, Subtask, Contact, AttachmentMeta,
  ProjectAttachmentMeta,
  TeamMember, AdminTask,
  CreateProject, UpdateProject, UpdatePhase, UpdateTask, UpdateSubtask, UpdateContact,
  EquipmentItem, CreateEquipment, UpdateEquipment, EquipmentSection,
  HubSpotDeal, HubSpotActiveDeal, HubSpotStatus, HubSpotOwner,
  PricingCatalogItem, CreatePricingItem, UpdatePricingItem,
} from './types'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, err.error ?? 'Unknown error')
  }
  // 204 No Content (and other empty bodies) must NOT call res.json() —
  // it throws on an empty body and makes void-returning routes appear
  // to fail even though the server succeeded. The Drone TEVI save and
  // every DELETE / PATCH route that returns NO_CONTENT hit this path.
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  try { return JSON.parse(text) as T }
  catch { return undefined as T }
}

export const api = {
  me: () => apiFetch<{ principal: string }>('/me'),

  pricingCatalog: {
    list: () => apiFetch<PricingCatalogItem[]>('/pricing-catalog'),
    create: (body: CreatePricingItem) =>
      apiFetch<PricingCatalogItem>('/pricing-catalog', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: UpdatePricingItem) =>
      apiFetch<void>(`/pricing-catalog/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) =>
      apiFetch<void>(`/pricing-catalog/${id}`, { method: 'DELETE' }),
  },

  // Shared Drone TEVI (Products tool) evaluation state — single row,
  // team-wide. Save button writes the whole reducer snapshot here so
  // everyone sees the same vendor evals/results across browsers.
  droneTevi: {
    get: () => apiFetch<{ state: unknown; updatedAt: string }>('/drone-tevi-state'),
    save: (state: unknown) =>
      apiFetch<void>('/drone-tevi-state', { method: 'PUT', body: JSON.stringify({ state }) }),
  },

  projects: {
    list: () => apiFetch<ProjectSummary[]>('/projects'),
    get: (id: string) => apiFetch<ProjectFull>(`/projects/${id}`),
    create: (body: CreateProject) =>
      apiFetch<ProjectSummary>('/projects', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: UpdateProject) =>
      apiFetch<ProjectSummary>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => apiFetch<void>(`/projects/${id}`, { method: 'DELETE' }),
    updateBranchAnswers: (id: string, answers: Record<string, boolean>) =>
      apiFetch<void>(`/projects/${id}/branch-answers`, { method: 'PATCH', body: JSON.stringify({ answers }) }),
  },

  phases: {
    update: (projectId: string, phaseId: string, body: UpdatePhase) =>
      apiFetch<Phase>(`/projects/${projectId}/phases/${phaseId}`, {
        method: 'PATCH', body: JSON.stringify(body),
      }),
  },

  tasks: {
    create: (projectId: string, phaseId: string, title: string) =>
      apiFetch<Task>(`/projects/${projectId}/phases/${phaseId}/tasks`, {
        method: 'POST', body: JSON.stringify({ title }),
      }),
    update: (taskId: string, body: UpdateTask) =>
      apiFetch<Task>(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (taskId: string) => apiFetch<void>(`/tasks/${taskId}`, { method: 'DELETE' }),
  },

  subtasks: {
    create: (taskId: string, text: string) =>
      apiFetch<Subtask>(`/tasks/${taskId}/subtasks`, {
        method: 'POST', body: JSON.stringify({ text }),
      }),
    update: (subtaskId: number, body: UpdateSubtask) =>
      apiFetch<Subtask>(`/subtasks/${subtaskId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (subtaskId: number) => apiFetch<void>(`/subtasks/${subtaskId}`, { method: 'DELETE' }),
  },

  contacts: {
    update: (taskId: string, slotIndex: number, body: UpdateContact) =>
      apiFetch<Contact>(`/tasks/${taskId}/stakeholders/${slotIndex}`, {
        method: 'PATCH', body: JSON.stringify(body),
      }),
  },

  attachments: {
    upload: async (taskId: string, file: File): Promise<AttachmentMeta> => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new ApiError(res.status, err.error ?? 'Upload failed')
      }
      return res.json()
    },
    downloadUrl: (attachmentId: string) => `/api/attachments/${attachmentId}`,
    delete: (attachmentId: string) =>
      apiFetch<void>(`/attachments/${attachmentId}`, { method: 'DELETE' }),
  },

  // Project-scoped attachments (parallel to the task-scoped set above).
  // Used by the Customer Signoff tab: the browser generates the PDF and
  // uploads it here so it's persisted on the deal itself.
  projectAttachments: {
    list: (projectId: string) =>
      apiFetch<ProjectAttachmentMeta[]>(`/projects/${projectId}/attachments`),
    upload: async (
      projectId: string,
      file: File | Blob,
      opts: { filename?: string; kind?: string } = {},
    ): Promise<ProjectAttachmentMeta> => {
      const form = new FormData()
      const name = opts.filename ?? (file as File).name ?? 'upload.bin'
      form.append('file', file, name)
      if (opts.kind) form.append('kind', opts.kind)
      const res = await fetch(`/api/projects/${projectId}/attachments`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new ApiError(res.status, err.error ?? 'Upload failed')
      }
      return res.json()
    },
    downloadUrl: (attachmentId: string) => `/api/project-attachments/${attachmentId}`,
    delete: (attachmentId: string) =>
      apiFetch<void>(`/project-attachments/${attachmentId}`, { method: 'DELETE' }),
  },

  // Live customer signoff sessions — the operator creates a session,
  // gets back a token + URL, sends it to the customer. Customer signs
  // in the browser and strokes are POSTed back to the same session so
  // the operator can watch stroke-by-stroke via polling.
  signoffSessions: {
    create: (projectId: string, body: { project_name?: string; client_name?: string; site?: string }) =>
      apiFetch<{ token: string; url: string }>(`/projects/${projectId}/signoff-sessions`, {
        method: 'POST', body: JSON.stringify(body),
      }),
    status: (projectId: string, token: string) =>
      apiFetch<{
        token: string
        created_at: string
        completed_at: string | null
        accepted: boolean
        customer_name: string | null
        customer_email: string | null
        strokes: number[][][]  // stroke = array of [x, y] points
      }>(`/projects/${projectId}/signoff-sessions/${token}/status`),
  },

  // Email a Customer Signoff PDF via the server-side Resend proxy.
  // pdfBase64 is the raw PDF encoded as base64 (no data: prefix).
  sendSignoffEmail: (body: {
    to?: string
    subject?: string
    project?: string
    client?: string
    site?: string
    filename: string
    pdf_base64: string
    hubspot_deal_id?: string
  }) =>
    apiFetch<unknown>('/send-signoff-email', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  team: {
    list: () => apiFetch<TeamMember[]>('/team'),
    create: (name: string, role?: string, email?: string) =>
      apiFetch<TeamMember>('/team', { method: 'POST', body: JSON.stringify({ name, role, email }) }),
    update: (id: string, name: string, role?: string, email?: string) =>
      apiFetch<TeamMember>(`/team/${id}`, { method: 'PATCH', body: JSON.stringify({ name, role, email }) }),
    delete: (id: string) => apiFetch<void>(`/team/${id}`, { method: 'DELETE' }),
  },

  adminTasks: {
    list: () => apiFetch<AdminTask[]>('/admin-tasks'),
    create: (body: Partial<AdminTask> & { title: string }) =>
      apiFetch<AdminTask>('/admin-tasks', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<AdminTask>) =>
      apiFetch<AdminTask>(`/admin-tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => apiFetch<void>(`/admin-tasks/${id}`, { method: 'DELETE' }),
  },

  equipment: {
    list: (projectId: string) =>
      apiFetch<EquipmentItem[]>(`/projects/${encodeURIComponent(projectId)}/equipment`),
    create: (projectId: string, body: CreateEquipment) =>
      apiFetch<EquipmentItem>(`/projects/${encodeURIComponent(projectId)}/equipment`, {
        method: 'POST', body: JSON.stringify(body),
      }),
    update: (id: string, body: UpdateEquipment) =>
      apiFetch<void>(`/equipment/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) =>
      apiFetch<void>(`/equipment/${id}`, { method: 'DELETE' }),
    sections: {
      list: () =>
        apiFetch<EquipmentSection[]>('/equipment-sections'),
      create: (body: { name: string }) =>
        apiFetch<EquipmentSection>('/equipment-sections', { method: 'POST', body: JSON.stringify(body) }),
      rename: (id: string, name: string) =>
        apiFetch<void>(`/equipment-sections/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
      delete: (id: string) =>
        apiFetch<void>(`/equipment-sections/${id}`, { method: 'DELETE' }),
      listEquipment: (sectionId: string) =>
        apiFetch<EquipmentItem[]>(`/equipment-sections/${encodeURIComponent(sectionId)}/equipment`),
      createEquipment: (sectionId: string, body: CreateEquipment) =>
        apiFetch<EquipmentItem>(`/equipment-sections/${encodeURIComponent(sectionId)}/equipment`, {
          method: 'POST', body: JSON.stringify(body),
        }),
    },
  },

  hubspot: {
    getStatus: () => apiFetch<HubSpotStatus>('/hubspot/status'),
    saveToken: (token: string) =>
      apiFetch<void>('/hubspot/token', { method: 'PUT', body: JSON.stringify({ token }) }),
    deleteToken: () => apiFetch<void>('/hubspot/token', { method: 'DELETE' }),
    getDeals: () => apiFetch<{ results: HubSpotDeal[] }>('/hubspot/deals'),
    getActive: () => apiFetch<HubSpotActiveDeal[]>('/hubspot/active'),
    getDeal: (dealId: string) => apiFetch<HubSpotDeal>(`/hubspot/deal/${dealId}`),
    getOwners: () => apiFetch<{ results: HubSpotOwner[] }>('/hubspot/owners'),
    pinDeal: (dealId: string) =>
      apiFetch<{ projectId: string; created: boolean }>(`/hubspot/pin/${dealId}`, { method: 'POST' }),
    unpinDeal: (dealId: string) => apiFetch<void>(`/hubspot/pin/${dealId}`, { method: 'DELETE' }),
  },

  claude: (body: unknown) =>
    apiFetch<unknown>('/claude', { method: 'POST', body: JSON.stringify(body) }),

  // OEM spec page proxy — fetches an OEM specification page server-side
  // (avoids CORS) and returns the cleaned text content so the Products tool
  // can ask Claude to extract structured specs and pre-fill matrix fields.
  oemSpecsFetch: (url: string) =>
    apiFetch<{ url: string; contentType: string; text: string; rawLen: number; cleanLen: number }>(
      `/oem-specs-fetch?url=${encodeURIComponent(url)}`
    ),

  geocode: (address: string) =>
    apiFetch<{ lat: number; lng: number; display: string; source: string }>(
      `/geocode?address=${encodeURIComponent(address)}`
    ),
}
