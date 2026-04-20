'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, RefreshCw, Server as ServerIcon } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { InitializationConsole } from '@/components/servers/initialization-console'
import { ServerCard } from '@/components/servers/server-card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Server, ServerType } from '@/types'

type FilterType = 'all' | ServerType

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleServerId, setConsoleServerId] = useState<number | null>(null)
  const [autoStartToken, setAutoStartToken] = useState(0)

  const fetchServers = useCallback(async () => {
    setLoading(true)
    try {
      const url = filter === 'all' ? '/api/servers' : `/api/servers?type=${filter}`
      const response = await fetch(url)
      const result = await response.json()
      if (result.success) {
        setServers(result.data)
      }
    } catch (error) {
      console.error('Failed to fetch servers:', error)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void fetchServers()
  }, [fetchServers])

  const selectedConsoleServer = useMemo(
    () => servers.find((server) => server.id === consoleServerId) || null,
    [consoleServerId, servers],
  )

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this server? Related tunnels and sessions will also be removed.')) {
      return
    }

    try {
      const response = await fetch(`/api/servers/${id}`, { method: 'DELETE' })
      const result = await response.json()
      if (result.success) {
        setServers((current) => current.filter((server) => server.id !== id))
      } else {
        alert(result.error || 'Delete failed.')
      }
    } catch (error) {
      console.error('Failed to delete server:', error)
      alert('Delete request failed.')
    }
  }

  const handleInitialize = (id: number) => {
    setConsoleServerId(id)
    setConsoleOpen(true)
    setAutoStartToken((current) => current + 1)
  }

  const stats = {
    total: servers.length,
    online: servers.filter((server) => server.status === 'online').length,
    offline: servers.filter((server) => server.status === 'offline').length,
    pending: servers.filter((server) => server.status === 'pending').length,
  }

  return (
    <>
      <div className="flex flex-col">
        <Header title="Server Inventory" description="Manage RR and node servers." />
        <div className="flex-1 space-y-6 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterType)}>
                <TabsList>
                  <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
                  <TabsTrigger value="rr">RR</TabsTrigger>
                  <TabsTrigger value="node">Node</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-online" />{stats.online} online</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-offline" />{stats.offline} offline</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-pending" />{stats.pending} pending</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => void fetchServers()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
              <Button asChild><Link href="/servers/new"><Plus className="mr-2 h-4 w-4" />Add Server</Link></Button>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Spinner className="h-8 w-8" /></div>
          ) : servers.length === 0 ? (
            <Empty className="border py-12">
              <EmptyMedia variant="icon"><ServerIcon className="h-5 w-5" /></EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No Servers Yet</EmptyTitle>
                <EmptyDescription>{filter === 'all' ? 'Create your first server from the button above.' : `No ${filter === 'rr' ? 'RR' : 'node'} servers match this filter.`}</EmptyDescription>
              </EmptyHeader>
              {filter === 'all' && <EmptyContent><Button asChild><Link href="/servers/new"><Plus className="mr-2 h-4 w-4" />Add Server</Link></Button></EmptyContent>}
            </Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{servers.map((server) => <ServerCard key={server.id} server={server} onDelete={handleDelete} onInitialize={handleInitialize} />)}</div>
          )}
        </div>
      </div>

      <InitializationConsole
        open={consoleOpen}
        onOpenChange={setConsoleOpen}
        server={selectedConsoleServer}
        autoStartToken={autoStartToken}
        onTaskChange={fetchServers}
      />
    </>
  )
}
