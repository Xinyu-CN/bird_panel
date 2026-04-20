'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { GitBranch, RefreshCw, Waypoints } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { TunnelWithServers } from '@/types'

export default function TunnelsPage() {
  const [tunnels, setTunnels] = useState<TunnelWithServers[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTunnels = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/tunnels', { cache: 'no-store' })
      const result = await response.json()
      if (result.success) {
        setTunnels(result.data)
      }
    } catch (error) {
      console.error('Failed to fetch tunnels:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTunnels()
  }, [fetchTunnels])

  return (
    <div className="flex flex-col">
      <Header title="隧道管理" description="查看全局 underlay / internal 链路，以及它们的状态、带宽和延迟。" />
      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">共 {tunnels.length} 条隧道</div>
          <Button variant="outline" onClick={() => void fetchTunnels()} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            刷新
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-8 w-8" />
          </div>
        ) : tunnels.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <GitBranch className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">还没有隧道</p>
                <p className="text-sm text-muted-foreground">请先到节点详情页或拓扑页创建 tunnel / internal link。</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {tunnels.map((tunnel) => (
              <Card key={tunnel.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {tunnel.name || `${tunnel.server_a.name} <-> ${tunnel.server_b.name}`}
                      </CardTitle>
                      <CardDescription>
                        <Link href={`/servers/${tunnel.server_a.id}`} className="hover:underline">
                          {tunnel.server_a.name}
                        </Link>
                        {' <-> '}
                        <Link href={`/servers/${tunnel.server_b.id}`} className="hover:underline">
                          {tunnel.server_b.name}
                        </Link>
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{tunnel.tunnel_type}</Badge>
                      <Badge
                        className={cn(
                          tunnel.status === 'up'
                            ? 'bg-status-online/20 text-status-online'
                            : tunnel.status === 'down' || tunnel.status === 'error'
                              ? 'bg-status-offline/20 text-status-offline'
                              : 'bg-status-pending/20 text-status-pending',
                        )}
                      >
                        {tunnel.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-3">
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">端点 A</p>
                    <p className="text-muted-foreground">IPv4: {tunnel.tunnel_ipv4_a || '-'}</p>
                    <p className="text-muted-foreground">IPv6: {tunnel.tunnel_ipv6_a || '-'}</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">端点 B</p>
                    <p className="text-muted-foreground">IPv4: {tunnel.tunnel_ipv4_b || '-'}</p>
                    <p className="text-muted-foreground">IPv6: {tunnel.tunnel_ipv6_b || '-'}</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">链路属性</p>
                    <p className="text-muted-foreground">带宽: {tunnel.bandwidth_mbps ? `${tunnel.bandwidth_mbps} Mbps` : '-'}</p>
                    <p className="text-muted-foreground">OSPF: {tunnel.ospf_enabled ? `${tunnel.ospf_mode || '-'} / ${tunnel.ospf_type || '-'}` : 'disabled'}</p>
                    <p className="text-muted-foreground">Cost: {tunnel.ospf_cost}</p>
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Waypoints className="h-4 w-4" />
                      {tunnel.latency_ms !== null ? `${tunnel.latency_ms} ms` : '暂无探测结果'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
