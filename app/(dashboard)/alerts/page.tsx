'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { Alert } from '@/types'

type Filter = 'all' | 'unresolved'

function severityLabel(severity: Alert['severity']) {
  switch (severity) {
    case 'critical':
      return '严重'
    case 'error':
      return '错误'
    case 'warning':
      return '告警'
    default:
      return '信息'
  }
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('unresolved')

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/alerts?limit=100&unresolved=${filter === 'unresolved'}`, { cache: 'no-store' })
      const result = await response.json()
      if (result.success) {
        setAlerts(result.data)
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void fetchAlerts()
  }, [fetchAlerts])

  const stats = useMemo(() => ({
    critical: alerts.filter((alert) => alert.severity === 'critical').length,
    error: alerts.filter((alert) => alert.severity === 'error').length,
    warning: alerts.filter((alert) => alert.severity === 'warning').length,
  }), [alerts])

  return (
    <div className="flex flex-col">
      <Header title="告警中心" description="查看最新告警，按严重级别与来源快速定位异常节点、隧道或会话。" />
      <div className="flex-1 space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
            <TabsList>
              <TabsTrigger value="unresolved">未处理</TabsTrigger>
              <TabsTrigger value="all">全部</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Badge variant="outline">严重 {stats.critical}</Badge>
            <Badge variant="outline">错误 {stats.error}</Badge>
            <Badge variant="outline">告警 {stats.warning}</Badge>
            <Button variant="outline" onClick={() => void fetchAlerts()} disabled={loading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
              刷新
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-8 w-8" />
          </div>
        ) : alerts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">暂无告警</p>
                <p className="text-sm text-muted-foreground">当前筛选条件下没有告警记录。</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {alerts.map((alert) => (
              <Card key={alert.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{alert.message}</CardTitle>
                      <CardDescription>{alert.type}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        className={cn(
                          alert.severity === 'critical'
                            ? 'bg-destructive/20 text-destructive'
                            : alert.severity === 'error'
                              ? 'bg-status-offline/20 text-status-offline'
                              : alert.severity === 'warning'
                                ? 'bg-status-warning/20 text-status-warning'
                                : 'bg-status-pending/20 text-status-pending',
                        )}
                      >
                        {severityLabel(alert.severity)}
                      </Badge>
                      <Badge variant={alert.resolved ? 'secondary' : 'outline'}>
                        {alert.resolved ? '已处理' : '未处理'}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>创建时间：{new Date(alert.created_at * 1000).toLocaleString('zh-CN')}</p>
                  <div className="flex flex-wrap gap-4">
                    {alert.server_id && (
                      <Link href={`/servers/${alert.server_id}`} className="hover:text-foreground hover:underline">
                        节点 #{alert.server_id}
                      </Link>
                    )}
                    {alert.tunnel_id && <span>隧道 #{alert.tunnel_id}</span>}
                    {alert.session_id && <span>Session #{alert.session_id}</span>}
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
