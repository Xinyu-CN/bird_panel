import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const [servers, tunnels, alerts, trafficSeries, topRoutes] = await Promise.all([
      db.getServers(),
      db.getTunnels(),
      db.getAlerts(100, true),
      db.getTrafficSeries(24),
      db.getTopRoutes(5),
    ])

    const stats = {
      servers: {
        total: servers.length,
        online: servers.filter((server) => server.status === 'online').length,
        offline: servers.filter((server) => server.status === 'offline').length,
        pending: servers.filter((server) => server.status === 'pending').length,
        error: servers.filter((server) => server.status === 'error').length,
        byType: {
          rr: servers.filter((server) => server.type === 'rr').length,
          node: servers.filter((server) => server.type === 'node').length,
          core: servers.filter((server) => server.type === 'node' && server.is_core).length,
          edge: servers.filter((server) => server.type === 'node' && !server.is_core).length,
        },
      },
      tunnels: {
        total: tunnels.length,
        up: tunnels.filter((tunnel) => tunnel.status === 'up').length,
        down: tunnels.filter((tunnel) => tunnel.status === 'down').length,
        pending: tunnels.filter((tunnel) => tunnel.status === 'pending' || tunnel.status === 'configuring').length,
        error: tunnels.filter((tunnel) => tunnel.status === 'error').length,
        byType: {
          wireguard: tunnels.filter((tunnel) => tunnel.tunnel_type === 'wireguard').length,
          vxlan: tunnels.filter((tunnel) => tunnel.tunnel_type === 'vxlan').length,
          gre: tunnels.filter((tunnel) => tunnel.tunnel_type === 'gre').length,
          direct: tunnels.filter((tunnel) => tunnel.tunnel_type === 'direct').length,
        },
      },
      alerts: {
        total: alerts.length,
        critical: alerts.filter((alert) => alert.severity === 'critical').length,
        error: alerts.filter((alert) => alert.severity === 'error').length,
        warning: alerts.filter((alert) => alert.severity === 'warning').length,
        info: alerts.filter((alert) => alert.severity === 'info').length,
      },
      trafficSeries,
      topRoutes,
    }

    return NextResponse.json({ success: true, data: stats })
  } catch (error) {
    console.error('Failed to get stats:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 },
    )
  }
}
