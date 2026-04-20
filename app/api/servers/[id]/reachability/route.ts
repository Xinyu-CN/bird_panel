import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { pingBackboneTargets } from '@/lib/server/reachability'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const { id } = await params
    const serverId = Number.parseInt(id, 10)
    const sourceServer = await db.getServer(serverId)

    if (!sourceServer) {
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 },
      )
    }

    const allServers = await db.getServers()
    const targets = allServers.filter((server) => server.id !== sourceServer.id && Boolean(server.ipv6_address))
    const results = await pingBackboneTargets(sourceServer, targets)
    const tunnels = await db.getTunnels()

    for (const result of results) {
      const relatedTunnel = tunnels.find((tunnel) =>
        (tunnel.server_a_id === sourceServer.id && tunnel.server_b_id === result.target_server_id) ||
        (tunnel.server_b_id === sourceServer.id && tunnel.server_a_id === result.target_server_id),
      )

      if (relatedTunnel) {
        await db.updateTunnel(relatedTunnel.id, {
          latency_ms: result.avg_latency_ms === null ? null : Math.round(result.avg_latency_ms),
          last_check_at: Math.floor(result.tested_at / 1000),
          status: result.success ? 'up' : 'down',
        })
      }
    }

    return NextResponse.json({ success: true, data: results })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to test backbone reachability'
    console.error('Error testing backbone reachability:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
