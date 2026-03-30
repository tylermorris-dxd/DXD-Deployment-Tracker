import type {
  ProjectSummary, ProjectFull, Phase, Task, Subtask, Contact, AttachmentMeta,
  TeamMember, AdminTask,
  CreateProject, UpdateProject, UpdatePhase, UpdateTask, UpdateSubtask, UpdateContact,
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
  return res.json() as Promise<T>
}

export const api = {
  me: () => apiFetch<{ principal: string }>('/me'),

  projects: {
    list: () => apiFetch<ProjectSummary[]>('/projects'),
    get: (id: string) => apiFetch<ProjectFull>(`/projects/${id}`),
    create: (body: CreateProject) =>
      apiFetch<ProjectSummary>('/projects', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: UpdateProject) =>
      apiFetch<ProjectSummary>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => apiFetch<void>(`/projects/${id}`, { method: 'DELETE' }),
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

  team: {
    list: () => apiFetch<TeamMember[]>('/team'),
    create: (name: string, role?: string, email?: string) =>
      apiFetch<TeamMember>('/team', { method: 'POST', body: JSON.stringify({ name, role, email }) }),
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

  claude: (body: unknown) =>
    apiFetch<unknown>('/claude', { method: 'POST', body: JSON.stringify(body) }),

  geocode: (address: string) =>
    apiFetch<{ lat: number; lng: number; display: string; source: string }>(
      `/geocode?address=${encodeURIComponent(address)}`
    ),
}
