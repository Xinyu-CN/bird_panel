'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/dashboard/header'
import { ServerForm } from '@/components/servers/server-form'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { Server } from '@/types'

interface EditServerPageProps { params: Promise<{ id: string }> }

export default function EditServerPage({ params }: EditServerPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [server, setServer] = useState<Server | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchServer = async () => {
      try {
        const response = await fetch(`/api/servers/${id}`)
        const result = await response.json()
        if (result.success) setServer(result.data)
      } catch (error) {
        console.error('Failed to fetch server for edit:', error)
      } finally {
        setLoading(false)
      }
    }
    void fetchServer()
  }, [id])

  if (loading) return <div className="flex h-full items-center justify-center"><Spinner className="h-8 w-8" /></div>
  if (!server) return <div className="flex h-full flex-col items-center justify-center gap-4"><p className="text-muted-foreground">Server not found.</p><Button onClick={() => router.back()}>Back</Button></div>

  return (
    <div className="flex flex-col">
      <Header title={`Edit ${server.name}`} description="Update base info, ICAO lookup, and SSH settings." />
      <div className="flex-1 p-6"><div className="mx-auto max-w-3xl"><ServerForm mode="edit" serverId={server.id} initialData={{ name: server.name, type: server.type, is_core: server.is_core, is_initialized: server.is_initialized, icao_code: server.icao_code, latitude: server.latitude, longitude: server.longitude, city: server.city || '', country_code: server.country_code, region_code: server.region_code, ssh_host: server.ssh_host, ssh_port: server.ssh_port, ssh_user: server.ssh_user, ssh_key_id: server.ssh_key_id }} /></div></div>
    </div>
  )
}
