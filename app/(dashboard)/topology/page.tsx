'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { GitBranch, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { InitializationConsole } from '@/components/servers/initialization-console'
import { TopologyCanvas } from '@/components/topology/topology-canvas'
import { TunnelForm, type TunnelFormData } from '@/components/tunnels/tunnel-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getServerRoleLabel } from '@/lib/server/roles'
import { cn } from '@/lib/utils'
import type { Server, TunnelWithServers } from '@/types'

export default function TopologyPage() {
  const [servers, setServers] = useState<Server[]>([])
  const [tunnels, setTunnels] = useState<TunnelWithServers[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedServer, setSelectedServer] = useState<Server | null>(null)
  const [pendingConnection, setPendingConnection] = useState<{ serverA: Server; serverB: Server } | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleServerId, setConsoleServerId] = useState<number | null>(null)
  const [autoStartToken, setAutoStartToken] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [serversRes, tunnelsRes] = await Promise.all([
        fetch('/api/servers', { cache: 'no-store' }),
        fetch('/api/tunnels', { cache: 'no-store' }),
      ])
      const [serversData, tunnelsData] = await Promise.all([serversRes.json(), tunnelsRes.json()])
      if (serversData.success) setServers(serversData.data)
      if (tunnelsData.success) setTunnels(tunnelsData.data)
    } catch (error) {
      console.error('Failed to fetch topology data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const selectedConsoleServer = useMemo(
    () => servers.find((server) => server.id === consoleServerId) || null,
    [consoleServerId, servers],
  )

  const handleCreateConnection = (serverA: Server, serverB: Server) => {
    const exists = tunnels.some((tunnel) =>
      (tunnel.server_a_id === serverA.id && tunnel.server_b_id === serverB.id) ||
      (tunnel.server_a_id === serverB.id && tunnel.server_b_id === serverA.id),
    )

    if (exists) {
      alert('A tunnel between these nodes already exists.')
      return
    }

    setPendingConnection({ serverA, serverB })
    setFormOpen(true)
  }

  const handleSubmitTunnel = async (data: TunnelFormData) => {
    try {
      const response = await fetch('/api/tunnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Tunnel creation failed')
      }

      await fetchData()
      setPendingConnection(null)
    } catch (error) {
      console.error('Failed to create tunnel:', error)
      alert(error instanceof Error ? error.message : 'Tunnel creation failed.')
    }
  }

  const handleInitializeServer = (serverId: number) => {
    setConsoleServerId(serverId)
    setConsoleOpen(true)
    setAutoStartToken((current) => current + 1)
  }

  const pendingRRServers = servers.filter((server) => !server.is_initialized && server.type === 'rr')
  const pendingNodeServers = servers.filter((server) => !server.is_initialized && server.type === 'node')

  const stats = {
    totalServers: servers.length,
    totalTunnels: tunnels.length,
    tunnelsUp: tunnels.filter((tunnel) => tunnel.status === 'up').length,
    tunnelsDown: tunnels.filter((tunnel) => tunnel.status === 'down' || tunnel.status === 'error').length,
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <Header title="Topology" description="Visualize node connectivity, initialization state, and tunnel relationships." />
        <div className="flex-1 space-y-6 overflow-hidden p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span>{stats.totalServers} nodes</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Wifi className="h-4 w-4 text-status-online" />
              <span>{stats.tunnelsUp} healthy tunnels</span>
            </div>
            {stats.tunnelsDown > 0 && (
              <div className="flex items-center gap-2 text-sm text-status-offline">
                <WifiOff className="h-4 w-4" />
                <span>{stats.tunnelsDown} failing tunnels</span>
              </div>
            )}
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => void fetchData()} disabled={loading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          <Tabs defaultValue="topology" className="flex flex-1 flex-col overflow-hidden">
            <TabsList>
              <TabsTrigger value="init">Initialization</TabsTrigger>
              <TabsTrigger value="topology">Canvas</TabsTrigger>
              <TabsTrigger value="list">Tunnels</TabsTrigger>
            </TabsList>

            <TabsContent value="init" className="flex-1 overflow-auto">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Uninitialized RR Nodes</CardTitle>
                    <CardDescription>These nodes still need RR initialization or manual import from existing vars.conf.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pendingRRServers.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">No RR nodes are waiting for initialization.</p>
                    ) : (
                      <div className="space-y-2">
                        {pendingRRServers.map((server) => (
                          <div key={server.id} className="flex items-center justify-between rounded-lg border p-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{server.name}</p>
                                <Badge variant="outline">{getServerRoleLabel(server)}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{server.city || server.icao_code} | {server.ipv6_address}</p>
                            </div>
                            <Button size="sm" onClick={() => handleInitializeServer(server.id)}>Initialize</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Uninitialized Node Servers</CardTitle>
                    <CardDescription>Both standard and core-marked nodes appear here until they are initialized or imported.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pendingNodeServers.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">No node servers are waiting for initialization.</p>
                    ) : (
                      <div className="space-y-2">
                        {pendingNodeServers.map((server) => (
                          <div key={server.id} className="flex items-center justify-between rounded-lg border p-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{server.name}</p>
                                <Badge variant="outline">{getServerRoleLabel(server)}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{server.city || server.icao_code} | {server.ipv6_address}</p>
                            </div>
                            <Button size="sm" onClick={() => handleInitializeServer(server.id)}>Initialize</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="topology" className="min-h-0 flex-1">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner className="h-8 w-8" />
                </div>
              ) : servers.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-muted-foreground">Add servers first to see the topology canvas.</p>
                </div>
              ) : (
                <div className="h-full min-h-[500px]">
                  <TopologyCanvas
                    servers={servers}
                    tunnels={tunnels}
                    onCreateConnection={handleCreateConnection}
                    selectedServer={selectedServer}
                    onSelectServer={setSelectedServer}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="list" className="flex-1 overflow-auto">
              <Card>
                <CardHeader>
                  <CardTitle>Tunnel List</CardTitle>
                  <CardDescription>All configured tunnels in the current SQLite database.</CardDescription>
                </CardHeader>
                <CardContent>
                  {tunnels.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">No tunnels exist yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {tunnels.map((tunnel) => (
                        <div key={tunnel.id} className="flex items-center justify-between rounded-lg border p-3">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              'h-2 w-2 rounded-full',
                              tunnel.status === 'up'
                                ? 'bg-status-online'
                                : tunnel.status === 'down' || tunnel.status === 'error'
                                  ? 'bg-status-offline'
                                  : 'bg-status-pending',
                            )} />
                            <div>
                              <p className="font-medium">
                                {tunnel.server_a?.name || 'Unknown'}
                                <span className="mx-2 text-muted-foreground">{'<->'}</span>
                                {tunnel.server_b?.name || 'Unknown'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {tunnel.tunnel_type}
                                {tunnel.bandwidth_mbps ? ` | ${tunnel.bandwidth_mbps} Mbps` : ''}
                                {tunnel.ospf_enabled ? ` | OSPF ${tunnel.ospf_mode}` : ' | no OSPF'}
                                {tunnel.latency_ms !== null ? ` | ${tunnel.latency_ms} ms` : ' | -'}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className={cn(
                            tunnel.status === 'up'
                              ? 'bg-status-online/20 text-status-online'
                              : tunnel.status === 'down' || tunnel.status === 'error'
                                ? 'bg-status-offline/20 text-status-offline'
                                : 'bg-status-pending/20 text-status-pending',
                          )}>
                            {tunnel.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <TunnelForm
          open={formOpen}
          onOpenChange={setFormOpen}
          serverA={pendingConnection?.serverA || null}
          serverB={pendingConnection?.serverB || null}
          onSubmit={handleSubmitTunnel}
        />
      </div>

      <InitializationConsole
        open={consoleOpen}
        onOpenChange={setConsoleOpen}
        server={selectedConsoleServer}
        autoStartToken={autoStartToken}
        onTaskChange={fetchData}
      />
    </>
  )
}
