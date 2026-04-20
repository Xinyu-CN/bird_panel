'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { GlobeMethods } from 'react-globe.gl'
import { getServerRoleLabel } from '@/lib/server/roles'
import type {
  Server,
  ServerStatus,
  TunnelStatus,
  TunnelType,
  TunnelWithServers,
} from '@/types'

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false })

const MIN_GLOBE_HEIGHT = 360

interface NetworkGlobeProps {
  servers: Server[]
  tunnels: TunnelWithServers[]
  onSelectServer?: (server: Server) => void
}

interface PointData {
  id: number
  name: string
  lat: number
  lng: number
  status: ServerStatus
  city?: string
  roleLabel: string
  size: number
  color: string
}

interface ArcData {
  startLat: number
  startLng: number
  endLat: number
  endLng: number
  color: string
  status: TunnelStatus
  latency?: number
  type: TunnelType
  bandwidth?: number
}

interface GlobeViewport {
  width: number
  height: number
}

export function NetworkGlobe({ servers, tunnels, onSelectServer }: NetworkGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeEl = useRef<GlobeMethods | undefined>(undefined)
  const [mounted, setMounted] = useState(false)
  const [globeReady, setGlobeReady] = useState(false)
  const [viewport, setViewport] = useState<GlobeViewport>({ width: 0, height: 0 })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const node = containerRef.current
    if (!node) {
      return
    }

    const updateViewport = () => {
      const bounds = node.getBoundingClientRect()
      const nextViewport = {
        width: Math.max(0, Math.floor(bounds.width)),
        height: Math.max(MIN_GLOBE_HEIGHT, Math.floor(bounds.height)),
      }

      setViewport((currentViewport) => {
        if (
          currentViewport.width === nextViewport.width &&
          currentViewport.height === nextViewport.height
        ) {
          return currentViewport
        }

        return nextViewport
      })
    }

    updateViewport()

    const resizeObserver = new ResizeObserver(updateViewport)
    resizeObserver.observe(node)

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (!globeReady || !globeEl.current) {
      return
    }

    const globe = globeEl.current
    const controls = globe.controls?.()

    if (controls) {
      controls.autoRotate = true
      controls.autoRotateSpeed = 0.45
    }

    globe.pointOfView?.({ lat: 24, lng: 18, altitude: 2.05 }, 0)
  }, [globeReady])

  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'online':
      case 'up':
        return '#4ade80'
      case 'offline':
      case 'down':
      case 'error':
        return '#f87171'
      case 'initializing':
      case 'configuring':
        return '#fbbf24'
      default:
        return '#60a5fa'
    }
  }, [])

  const getPointSize = useCallback((server: Server) => {
    if (server.type === 'rr') {
      return 1.15
    }

    return server.is_core ? 0.9 : 0.65
  }, [])

  const pointsData = useMemo<PointData[]>(
    () =>
      servers.map((server) => ({
        id: server.id,
        name: server.name,
        lat: server.latitude,
        lng: server.longitude,
        status: server.status,
        city: server.city || undefined,
        roleLabel: getServerRoleLabel(server),
        size: getPointSize(server),
        color: getStatusColor(server.status),
      })),
    [getPointSize, getStatusColor, servers],
  )

  const serverMap = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers])

  const arcsData = useMemo<ArcData[]>(
    () =>
      tunnels.reduce<ArcData[]>((accumulator, tunnel) => {
        const serverA = serverMap.get(tunnel.server_a_id)
        const serverB = serverMap.get(tunnel.server_b_id)

        if (!serverA || !serverB) {
          return accumulator
        }

        accumulator.push({
          startLat: serverA.latitude,
          startLng: serverA.longitude,
          endLat: serverB.latitude,
          endLng: serverB.longitude,
          color: getStatusColor(tunnel.status),
          status: tunnel.status,
          latency: tunnel.latency_ms ?? undefined,
          type: tunnel.tunnel_type,
          bandwidth: tunnel.bandwidth_mbps ?? undefined,
        })

        return accumulator
      }, []),
    [getStatusColor, serverMap, tunnels],
  )

  const handlePointClick = useCallback(
    (point: object) => {
      const selectedPoint = point as PointData
      const server = serverMap.get(selectedPoint.id)

      if (server && onSelectServer) {
        onSelectServer(server)
      }
    },
    [onSelectServer, serverMap],
  )

  const isGlobeVisible = mounted && viewport.width > 0 && viewport.height > 0

  return (
    <div ref={containerRef} className="relative h-full min-h-[360px] w-full overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.24),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/8 via-transparent to-transparent" />

      {!isGlobeVisible && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-slate-300 backdrop-blur">
            Loading 3D globe...
          </div>
        </div>
      )}

      {isGlobeVisible && (
        <Globe
          ref={globeEl}
          width={viewport.width}
          height={viewport.height}
          onGlobeReady={() => setGlobeReady(true)}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          backgroundColor="rgba(0,0,0,0)"
          pointsData={pointsData}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointRadius="size"
          pointAltitude={0.02}
          pointLabel={(data: object) => {
            const point = data as PointData

            return `
              <div style="background: rgba(2, 6, 23, 0.92); padding: 8px 12px; border-radius: 8px; font-size: 12px; border: 1px solid rgba(148, 163, 184, 0.2);">
                <div style="font-weight: 600; color: white;">${point.name}</div>
                <div style="color: #94a3b8;">${point.city || point.roleLabel}</div>
                <div style="color: ${point.color}; text-transform: capitalize;">${point.status}</div>
              </div>
            `
          }}
          onPointClick={handlePointClick}
          arcsData={arcsData}
          arcStartLat="startLat"
          arcStartLng="startLng"
          arcEndLat="endLat"
          arcEndLng="endLng"
          arcColor="color"
          arcDashLength={0.4}
          arcDashGap={0.18}
          arcDashAnimateTime={1400}
          arcStroke={0.55}
          arcAltitudeAutoScale={0.28}
          arcLabel={(data: object) => {
            const arc = data as ArcData

            return `
              <div style="background: rgba(2, 6, 23, 0.92); padding: 8px 12px; border-radius: 8px; font-size: 12px; border: 1px solid rgba(148, 163, 184, 0.2);">
                <div style="font-weight: 600; color: white; text-transform: capitalize;">${arc.type}</div>
                <div style="color: ${arc.color}; text-transform: capitalize;">${arc.status}</div>
                ${arc.bandwidth ? `<div style="color: #94a3b8;">${arc.bandwidth} Mbps</div>` : ''}
                ${arc.latency ? `<div style="color: #94a3b8;">${arc.latency} ms</div>` : ''}
              </div>
            `
          }}
          atmosphereColor="#60a5fa"
          atmosphereAltitude={0.16}
          enablePointerInteraction
        />
      )}

      <div className="absolute left-3 top-3 z-10 rounded-xl border border-white/10 bg-slate-950/72 p-3 text-xs text-slate-200 shadow-lg backdrop-blur-md">
        <div className="mb-2 font-medium text-white">Node Legend</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-chart-4" />
            <span>RR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-chart-1" />
            <span>Core Node</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-chart-2" />
            <span>Node</span>
          </div>
        </div>
        <div className="mb-2 mt-3 font-medium text-white">Status</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-status-online" />
            <span>Online</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-status-warning" />
            <span>Initializing</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-status-offline" />
            <span>Fault</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 right-3 z-10 rounded-full border border-white/10 bg-slate-950/65 px-3 py-1.5 text-[11px] text-slate-300 shadow-lg backdrop-blur">
        Drag to rotate, click a node to inspect it.
      </div>
    </div>
  )
}
