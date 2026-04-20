'use client'

import { AlertCircle, AlertTriangle, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Alert, AlertSeverity } from '@/types'

interface AlertListProps {
  alerts: Alert[]
}

const SEVERITY_CONFIG: Record<AlertSeverity, {
  icon: typeof AlertTriangle
  className: string
  label: string
}> = {
  critical: {
    icon: XCircle,
    className: 'text-destructive bg-destructive/10',
    label: '严重',
  },
  error: {
    icon: AlertCircle,
    className: 'text-status-offline bg-status-offline/10',
    label: '错误',
  },
  warning: {
    icon: AlertTriangle,
    className: 'text-status-warning bg-status-warning/10',
    label: '警告',
  },
  info: {
    icon: Info,
    className: 'text-status-pending bg-status-pending/10',
    label: '信息',
  },
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const diff = Date.now() - date.getTime()

  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function AlertList({ alerts }: AlertListProps) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Info className="mb-2 h-8 w-8" />
        <p className="text-sm">暂无告警</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const config = SEVERITY_CONFIG[alert.severity]
        const Icon = config.icon

        return (
          <div key={alert.id} className={cn('flex items-start gap-3 rounded-lg p-3', config.className)}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{config.label}</span>
                <span className="text-xs opacity-70">{formatTime(alert.created_at)}</span>
              </div>
              <p className="mt-0.5 text-sm">{alert.message}</p>
              {alert.type && <span className="text-xs opacity-70">{alert.type}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
