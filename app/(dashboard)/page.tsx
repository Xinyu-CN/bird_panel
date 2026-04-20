'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, ArrowUpRight, GitBranch, Maximize2, RefreshCw, Server } from 'lucide-react'
import { TrafficChart } from '@/components/charts/traffic-chart'
import { AlertList } from '@/components/dashboard/alert-list'
import { StatsCard, StatsGrid } from '@/components/dashboard/stats-cards'
import { NetworkGlobe } from '@/components/globe/network-globe'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { Alert, Server as ServerType, Tunnel, TunnelWithServers } from '@/types'

interface DashboardStatsResponse {
  servers: {
    total: number
    online: number
  }
  tunnels: {
    total: number
    up: number
    down: number
    error: number
  }
  alerts: {
    total: number
  }
  trafficSeries: Array<{
    time: string
    inbound: number
    outbound: number
  }>
  topRoutes: Array<{
    tunnel_id: number
    name: string
    traffic_gb: number
    status: Tunnel['status']
  }>
}

const EMPTY_STATS: DashboardStatsResponse = {
  servers: { total: 0, online: 0 },
  tunnels: { total: 0, up: 0, down: 0, error: 0 },
  alerts: { total: 0 },
  trafficSeries: [],
  topRoutes: [],
}

export default function DashboardPage() {
  const [servers, setServers] = useState<ServerType[]>([])
  const [tunnels, setTunnels] = useState<TunnelWithServers[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [stats, setStats] = useState<DashboardStatsResponse>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [selectedServer, setSelectedServer] = useState<ServerType | null>(null)
  const [isGlobeFullscreen, setIsGlobeFullscreen] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [serversRes, tunnelsRes, alertsRes, statsRes] = await Promise.all([
        fetch('/api/servers'),
        fetch('/api/tunnels'),
        fetch('/api/alerts?unresolved=true&limit=10'),
        fetch('/api/stats'),
      ])

      const [serversData, tunnelsData, alertsData, statsData] = await Promise.all([
        serversRes.json(),
        tunnelsRes.json(),
        alertsRes.json(),
        statsRes.json(),
      ])

      if (serversData.success) setServers(serversData.data)
      if (tunnelsData.success) setTunnels(tunnelsData.data)
      if (alertsData.success) setAlerts(alertsData.data)
      if (statsData.success) setStats(statsData.data)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
    const interval = setInterval(() => void fetchData(), 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const totalTrafficGb = useMemo(() => {
    return stats.trafficSeries.reduce((sum, item) => sum + item.inbound + item.outbound, 0)
  }, [stats.trafficSeries])

  const tunnelIssueCount = stats.tunnels.down + stats.tunnels.error

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">监控大屏</h1>
          <p className="text-sm text-muted-foreground">查看全网节点、隧道、告警和近 24 小时流量。</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void fetchData()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-auto p-6">
        <StatsGrid>
          <StatsCard
            title="节点总数"
            value={stats.servers.total}
            change={`${stats.servers.online} 在线`}
            changeType="positive"
            icon={Server}
          />
          <StatsCard
            title="隧道连接"
            value={stats.tunnels.total}
            change={tunnelIssueCount > 0 ? `${tunnelIssueCount} 异常` : '全部正常'}
            changeType={tunnelIssueCount > 0 ? 'negative' : 'positive'}
            icon={GitBranch}
          />
          <StatsCard
            title="24 小时流量"
            value={`${totalTrafficGb.toFixed(2)} GB`}
            change={stats.trafficSeries.some((item) => item.inbound > 0 || item.outbound > 0) ? '来自 SQLite 聚合' : '暂无流量数据'}
            changeType={totalTrafficGb > 0 ? 'positive' : 'neutral'}
            icon={Activity}
          />
          <StatsCard
            title="未处理告警"
            value={stats.alerts.total}
            change={stats.alerts.total > 0 ? '需要处理' : '暂无告警'}
            changeType={stats.alerts.total > 0 ? 'negative' : 'neutral'}
            icon={AlertTriangle}
          />
        </StatsGrid>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
          <Card className={cn(
            'min-w-0 overflow-hidden border-border/80',
            isGlobeFullscreen && 'fixed inset-4 z-50 max-h-[calc(100vh-2rem)] shadow-2xl'
          )}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>全球网络</CardTitle>
                <CardDescription>POP 节点分布和链路状态</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsGlobeFullscreen(!isGlobeFullscreen)}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className={cn(
                'h-[420px] w-full md:h-[500px]',
                isGlobeFullscreen && 'h-[calc(100vh-8.5rem)]'
              )}>
                <NetworkGlobe
                  servers={servers}
                  tunnels={tunnels}
                  onSelectServer={setSelectedServer}
                />
              </div>
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-6">
            {selectedServer && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{selectedServer.name}</CardTitle>
                  <CardDescription>{selectedServer.city || selectedServer.icao_code}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">状态</span>
                    <Badge className={cn(
                      selectedServer.status === 'online' ? 'bg-status-online/20 text-status-online' :
                      selectedServer.status === 'offline' ? 'bg-status-offline/20 text-status-offline' :
                      'bg-status-pending/20 text-status-pending'
                    )}>
                      {selectedServer.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">类型</span>
                    <span>{selectedServer.type}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">IPv6</span>
                    <code className="text-right text-xs">{selectedServer.ipv6_address}</code>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">最近告警</CardTitle>
                  {stats.alerts.total > 0 && (
                    <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                      {stats.alerts.total}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <AlertList alerts={alerts.slice(0, 5)} />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">24 小时流量</CardTitle>
              <CardDescription>基于 `traffic_stats` 表实时聚合，没有数据时显示 0。</CardDescription>
            </CardHeader>
            <CardContent>
              <TrafficChart data={stats.trafficSeries} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">热门链路</CardTitle>
              <CardDescription>仅展示 SQLite 中已记录流量的隧道。</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.topRoutes.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  暂无链路流量数据
                </p>
              ) : (
                <div className="space-y-2">
                  {stats.topRoutes.map((route, index) => (
                    <div
                      key={route.tunnel_id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-secondary text-xs font-medium">
                          {index + 1}
                        </span>
                        <span className="font-mono text-sm">{route.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">{route.traffic_gb.toFixed(2)} GB</span>
                        <div className={cn(
                          'h-2 w-2 rounded-full',
                          route.status === 'up' ? 'bg-status-online' : 'bg-status-offline'
                        )} />
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
