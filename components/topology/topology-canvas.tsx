'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getServerRole, getServerRoleShortLabel } from '@/lib/server/roles'
import { cn } from '@/lib/utils'
import type { Server, TunnelWithServers } from '@/types'

interface TopologyCanvasProps {
  servers: Server[]
  tunnels: TunnelWithServers[]
  onCreateConnection: (serverA: Server, serverB: Server) => void
  selectedServer: Server | null
  onSelectServer: (server: Server | null) => void
}

interface NodePosition {
  id: number
  x: number
  y: number
}

const NODE_SIZE = 80
const CANVAS_PADDING = 40

export function TopologyCanvas({
  servers,
  tunnels,
  onCreateConnection,
  selectedServer,
  onSelectServer,
}: TopologyCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [positions, setPositions] = useState<NodePosition[]>([])
  const [dragging, setDragging] = useState<number | null>(null)
  const [connecting, setConnecting] = useState<{ server: Server; mousePos: { x: number; y: number } } | null>(null)

  useEffect(() => {
    if (servers.length === 0) {
      return
    }

    const nextPositions: NodePosition[] = servers.map((server, index) => {
      const existingPosition = positions.find((position) => position.id === server.id)
      if (existingPosition) {
        return existingPosition
      }

      const columns = Math.ceil(Math.sqrt(servers.length))
      const row = Math.floor(index / columns)
      const column = index % columns

      return {
        id: server.id,
        x: CANVAS_PADDING + column * (NODE_SIZE + 60) + NODE_SIZE / 2,
        y: CANVAS_PADDING + row * (NODE_SIZE + 60) + NODE_SIZE / 2,
      }
    })

    setPositions(nextPositions)
  }, [positions, servers])

  const getPosition = useCallback(
    (serverId: number) => positions.find((position) => position.id === serverId) || { id: serverId, x: 100, y: 100 },
    [positions],
  )

  const handleMouseDown = (event: React.MouseEvent, server: Server) => {
    event.stopPropagation()

    if (event.shiftKey || selectedServer) {
      if (selectedServer && selectedServer.id !== server.id) {
        onCreateConnection(selectedServer, server)
        onSelectServer(null)
      } else {
        onSelectServer(server)
      }
      return
    }

    setDragging(server.id)
  }

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!containerRef.current) {
        return
      }

      const rect = containerRef.current.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      if (dragging !== null) {
        setPositions((current) => current.map((position) => (position.id === dragging ? { ...position, x, y } : position)))
      }

      if (selectedServer) {
        setConnecting({ server: selectedServer, mousePos: { x, y } })
      }
    },
    [dragging, selectedServer],
  )

  const handleMouseUp = () => {
    setDragging(null)
    setConnecting(null)
  }

  const handleCanvasClick = () => {
    onSelectServer(null)
    setConnecting(null)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
      case 'up':
        return '#4ade80'
      case 'offline':
      case 'down':
      case 'error':
        return '#f87171'
      case 'pending':
        return '#60a5fa'
      case 'configuring':
      case 'initializing':
        return '#fbbf24'
      default:
        return '#6b7280'
    }
  }

  const getTypeColor = (server: Server) => {
    switch (getServerRole(server)) {
      case 'rr':
        return '#c084fc'
      case 'core':
        return '#4ade80'
      default:
        return '#60a5fa'
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-lg border bg-card"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleCanvasClick}
    >
      <svg className="absolute inset-0 h-full w-full">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeOpacity="0.05" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {tunnels.map((tunnel) => {
          const positionA = getPosition(tunnel.server_a_id)
          const positionB = getPosition(tunnel.server_b_id)
          const color = getStatusColor(tunnel.status)

          return (
            <g key={tunnel.id}>
              <line
                x1={positionA.x}
                y1={positionA.y}
                x2={positionB.x}
                y2={positionB.y}
                stroke={color}
                strokeWidth={2}
                strokeOpacity={0.6}
              />
              {tunnel.latency_ms !== null && (
                <text
                  x={(positionA.x + positionB.x) / 2}
                  y={(positionA.y + positionB.y) / 2 - 8}
                  textAnchor="middle"
                  fill="currentColor"
                  className="fill-muted-foreground text-xs"
                >
                  {tunnel.latency_ms}ms
                </text>
              )}
              <text
                x={(positionA.x + positionB.x) / 2}
                y={(positionA.y + positionB.y) / 2 + 8}
                textAnchor="middle"
                fill="currentColor"
                className="fill-muted-foreground text-xs"
              >
                {tunnel.tunnel_type}{tunnel.bandwidth_mbps ? ` · ${tunnel.bandwidth_mbps}M` : ''}
              </text>
            </g>
          )
        })}

        {connecting && (
          <line
            x1={getPosition(connecting.server.id).x}
            y1={getPosition(connecting.server.id).y}
            x2={connecting.mousePos.x}
            y2={connecting.mousePos.y}
            stroke="currentColor"
            strokeWidth={2}
            strokeDasharray="5,5"
            className="stroke-primary"
          />
        )}
      </svg>

      {servers.map((server) => {
        const position = getPosition(server.id)
        const isSelected = selectedServer?.id === server.id
        const typeColor = getTypeColor(server)
        const statusColor = getStatusColor(server.status)

        return (
          <div
            key={server.id}
            className={cn(
              'absolute flex cursor-pointer select-none flex-col items-center justify-center rounded-lg border-2 bg-card transition-all',
              isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50',
              dragging === server.id && 'cursor-grabbing',
            )}
            style={{
              left: position.x - NODE_SIZE / 2,
              top: position.y - NODE_SIZE / 2,
              width: NODE_SIZE,
              height: NODE_SIZE,
            }}
            onMouseDown={(event) => handleMouseDown(event, server)}
          >
            <div
              className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-card"
              style={{ backgroundColor: statusColor }}
            />

            <div
              className="absolute -left-1 -top-1 rounded px-1 text-[10px] font-medium"
              style={{ backgroundColor: `${typeColor}30`, color: typeColor }}
            >
              {getServerRoleShortLabel(server)}
            </div>

            <span className="max-w-full truncate px-1 text-xs font-medium">{server.icao_code}</span>
            <span className="max-w-full truncate px-1 text-[10px] text-muted-foreground">{server.city || server.name}</span>
          </div>
        )
      })}

      <div className="absolute bottom-4 left-4 text-xs text-muted-foreground">
        <p>Drag to move nodes | Click one node, then another, to create a tunnel | Shift+Click for quick select</p>
      </div>

      <div className="absolute bottom-4 right-4 flex gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-status-online" />
          <span>Healthy</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-status-warning" />
          <span>Working</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-status-offline" />
          <span>Fault</span>
        </div>
      </div>
    </div>
  )
}
