'use client'

import Link from 'next/link'
import {
  MoreVertical,
  Network,
  Play,
  Server as ServerIcon,
  Settings,
  Terminal,
  Trash2,
  MapPin,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getServerRole, getServerRoleLabel, type ServerRole } from '@/lib/server/roles'
import { cn } from '@/lib/utils'
import type { Server, ServerStatus } from '@/types'

interface ServerCardProps {
  server: Server
  onDelete?: (id: number) => void
  onInitialize?: (id: number) => void
}

const STATUS_CONFIG: Record<ServerStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-status-pending/20 text-status-pending border-status-pending/30' },
  initializing: { label: 'Initializing', className: 'bg-status-warning/20 text-status-warning border-status-warning/30' },
  online: { label: 'Online', className: 'bg-status-online/20 text-status-online border-status-online/30' },
  offline: { label: 'Offline', className: 'bg-status-offline/20 text-status-offline border-status-offline/30' },
  error: { label: 'Error', className: 'bg-destructive/20 text-destructive border-destructive/30' },
}

const ROLE_CONFIG: Record<ServerRole, { color: string }> = {
  rr: { color: 'bg-chart-4/20 text-chart-4 border-chart-4/30' },
  core: { color: 'bg-chart-1/20 text-chart-1 border-chart-1/30' },
  edge: { color: 'bg-chart-2/20 text-chart-2 border-chart-2/30' },
}

export function ServerCard({ server, onDelete, onInitialize }: ServerCardProps) {
  const statusConfig = STATUS_CONFIG[server.status]
  const role = getServerRole(server)
  const roleConfig = ROLE_CONFIG[role]

  return (
    <Card className="group relative overflow-hidden transition-all hover:border-primary/50">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            <ServerIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <Link
              href={`/servers/${server.id}`}
              className="font-semibold text-foreground transition-colors hover:text-primary"
            >
              {server.name}
            </Link>
            <p className="font-mono text-xs text-muted-foreground">
              {server.hostname || `${server.icao_code}-${server.node_id.toString().padStart(2, '0')}`}
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/servers/${server.id}`}>
                <Settings className="mr-2 h-4 w-4" />
                Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/servers/${server.id}/edit`}>
                <Terminal className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </DropdownMenuItem>
            {server.status === 'pending' && (
              <DropdownMenuItem onClick={() => onInitialize?.(server.id)}>
                <Play className="mr-2 h-4 w-4" />
                Initialize
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete?.(server.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Badge variant="outline" className={cn('text-xs', statusConfig.className)}>
            <span
              className={cn(
                'mr-1.5 h-1.5 w-1.5 rounded-full',
                server.status === 'online'
                  ? 'bg-status-online'
                  : server.status === 'offline'
                    ? 'bg-status-offline'
                    : server.status === 'error'
                      ? 'bg-destructive'
                      : server.status === 'initializing'
                        ? 'bg-status-warning animate-pulse'
                        : 'bg-status-pending',
              )}
            />
            {statusConfig.label}
          </Badge>
          <Badge variant="outline" className={cn('text-xs', roleConfig.color)}>
            {getServerRoleLabel(server)}
          </Badge>
        </div>

        <div className="grid gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{server.city || server.icao_code}</span>
            <span className="text-xs">({server.region_code}/{server.country_code})</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Network className="h-4 w-4" />
            <span className="font-mono text-xs">{server.ipv6_address}</span>
          </div>
        </div>

        <div className="rounded-lg bg-secondary/50 p-2 text-xs font-mono text-muted-foreground">
          ssh {server.ssh_user}@{server.ssh_host}:{server.ssh_port}
        </div>
      </CardContent>
    </Card>
  )
}
