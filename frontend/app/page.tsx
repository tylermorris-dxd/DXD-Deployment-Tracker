'use client'

import { useState } from 'react'
import ProjectList from '@/components/ProjectList'
import ProjectView from '@/components/ProjectView'

export default function Home() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  if (activeProjectId) {
    return <ProjectView projectId={activeProjectId} onBack={() => setActiveProjectId(null)} />
  }
  return <ProjectList onSelectProject={setActiveProjectId} />
}
