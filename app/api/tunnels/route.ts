import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth/session'
import { allocateTunnelIPv6 } from '@/lib/network/ip-allocator'
import { deployTunnelAutomation, ensureTunnelWireGuardKeys, recommendOspfCost } from '@/lib/tunnels/automation'
import type { Tunnel } from '@/types'

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const tunnels = await db.getTunnelsWithServers()
    return NextResponse.json({ success: true, data: tunnels })
  } catch (error) {
    console.error('Error fetching tunnels:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tunnels' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const body = await request.json()
    
    // Validate servers exist
    const serverA = await db.getServer(body.server_a_id)
    const serverB = await db.getServer(body.server_b_id)
    
    if (!serverA || !serverB) {
      return NextResponse.json(
        { success: false, error: 'One or both servers not found' },
        { status: 400 }
      )
    }
    
    // Allocate tunnel IPs
    const tunnelIps = allocateTunnelIPv6(body.server_a_id, body.server_b_id)
    
    const ospfCost = body.ospf_enabled === false
      ? 0
      : Number(body.ospf_cost || recommendOspfCost(body.bandwidth_mbps ? Number(body.bandwidth_mbps) : null))

    const tunnelData: Omit<Tunnel, 'id' | 'status' | 'latency_ms' | 'last_check_at' | 'created_at' | 'updated_at'> = {
      name: body.name || `${serverA.icao_code}-${serverB.icao_code}`,
      server_a_id: body.server_a_id,
      server_b_id: body.server_b_id,
      tunnel_type: body.tunnel_type,
      bandwidth_mbps: body.bandwidth_mbps ? Number(body.bandwidth_mbps) : null,
      wg_mode: body.wg_mode || null,
      wg_port: body.wg_port || 51820,
      wg_public_key_a: body.wg_public_key_a || null,
      wg_public_key_b: body.wg_public_key_b || null,
      tunnel_ipv4_a: body.tunnel_ipv4_a || null,
      tunnel_ipv4_b: body.tunnel_ipv4_b || null,
      tunnel_ipv6_a: body.tunnel_ipv6_a || tunnelIps.ipv6_a,
      tunnel_ipv6_b: body.tunnel_ipv6_b || tunnelIps.ipv6_b,
      ospf_enabled: body.ospf_enabled ?? true,
      ospf_mode: body.ospf_mode || 'v6',
      ospf_type: body.ospf_type || (body.tunnel_type === 'direct' ? 'broadcast' : 'ptp'),
      ospf_password: body.ospf_password || null,
      ospf_cost: ospfCost,
    }
    
    const tunnelId = await db.createTunnel(tunnelData)
    let warning: string | null = null

    if (body.tunnel_type === 'wireguard') {
      await ensureTunnelWireGuardKeys(tunnelId)
    }

    if (body.auto_deploy === true && body.tunnel_type === 'wireguard') {
      try {
        await deployTunnelAutomation(tunnelId)
      } catch (error) {
        warning = error instanceof Error ? error.message : 'Tunnel created, but automatic deployment failed'
      }
    }

    const tunnel = await db.getTunnel(tunnelId)
    
    return NextResponse.json({ success: true, data: tunnel, warning }, { status: 201 })
  } catch (error) {
    console.error('Error creating tunnel:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create tunnel' },
      { status: 500 }
    )
  }
}
