import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { db } from '@/lib/db'
import type {
  BGPSession,
  SessionAddressFamily,
  SessionTransportMode,
  SessionType,
} from '@/types'

const SESSION_TYPES: SessionType[] = ['ibgp', 'rr', 'upstream', 'downstream', 'peer', 'customer']
const TRANSPORT_MODES: SessionTransportMode[] = ['ix', 'internal', 'tunnel']
const ADDRESS_FAMILIES: SessionAddressFamily[] = ['ipv4', 'ipv6', 'dual']

interface CreateSessionBody {
  server_id?: number
  peer_server_id?: number | null
  server_ixp_membership_id?: number | null
  tunnel_id?: number | null
  ix_id?: number | null
  ix_name?: string | null
  session_type?: SessionType
  transport_mode?: SessionTransportMode
  address_family?: SessionAddressFamily
  peer_asn?: number
  peer_name?: string | null
  local_ipv4?: string | null
  local_ipv6?: string | null
  peer_ipv4?: string | null
  peer_ipv6?: string | null
  multihop?: number | boolean
  password?: string | null
  import_filter?: string | null
  export_filter?: string | null
  description?: string | null
  source?: string | null
}

function isValidSessionType(value: unknown): value is SessionType {
  return typeof value === 'string' && SESSION_TYPES.includes(value as SessionType)
}

function isValidTransportMode(value: unknown): value is SessionTransportMode {
  return typeof value === 'string' && TRANSPORT_MODES.includes(value as SessionTransportMode)
}

function isValidAddressFamily(value: unknown): value is SessionAddressFamily {
  return typeof value === 'string' && ADDRESS_FAMILIES.includes(value as SessionAddressFamily)
}

function trimOrNull(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const { searchParams } = new URL(request.url)
    const serverIdParam = searchParams.get('server_id')
    const serverId = serverIdParam ? Number.parseInt(serverIdParam, 10) : undefined

    if (serverIdParam && (!Number.isInteger(serverId) || (serverId as number) <= 0)) {
      return NextResponse.json(
        { success: false, error: 'Invalid server id' },
        { status: 400 },
      )
    }

    const sessions = await db.getBGPSessionsWithRelations(serverId)
    return NextResponse.json({ success: true, data: sessions })
  } catch (error) {
    console.error('Error loading BGP sessions:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load BGP sessions' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const body = await request.json() as CreateSessionBody
    const serverId = Number(body.server_id)

    if (!Number.isInteger(serverId) || serverId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid server id' },
        { status: 400 },
      )
    }

    const sessionType = isValidSessionType(body.session_type) ? body.session_type : null
    const transportMode = isValidTransportMode(body.transport_mode) ? body.transport_mode : null
    const addressFamily = isValidAddressFamily(body.address_family) ? body.address_family : 'dual'

    if (!sessionType || !transportMode) {
      return NextResponse.json(
        { success: false, error: 'Session type and transport mode are required' },
        { status: 400 },
      )
    }

    const server = await db.getServer(serverId)
    if (!server) {
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 },
      )
    }

    const requestedPeerServerId = body.peer_server_id ? Number(body.peer_server_id) : null
    const requestedTunnelId = body.tunnel_id ? Number(body.tunnel_id) : null
    const requestedMembershipId = body.server_ixp_membership_id ? Number(body.server_ixp_membership_id) : null

    const peerServer = requestedPeerServerId ? await db.getServer(requestedPeerServerId) : null
    if (requestedPeerServerId && !peerServer) {
      return NextResponse.json(
        { success: false, error: 'Peer server not found' },
        { status: 404 },
      )
    }

    const membership = requestedMembershipId ? await db.getServerIxpMembership(requestedMembershipId) : null
    if (requestedMembershipId && (!membership || membership.server_id !== serverId)) {
      return NextResponse.json(
        { success: false, error: 'Selected IX membership is invalid' },
        { status: 400 },
      )
    }

    let tunnel = requestedTunnelId ? await db.getTunnel(requestedTunnelId) : null
    if (requestedTunnelId && !tunnel) {
      return NextResponse.json(
        { success: false, error: 'Tunnel not found' },
        { status: 404 },
      )
    }

    let peerServerId = peerServer?.id || null
    let ixId = body.ix_id ? Number(body.ix_id) : null
    let ixName = trimOrNull(body.ix_name)
    let localIpv4 = trimOrNull(body.local_ipv4)
    let localIpv6 = trimOrNull(body.local_ipv6)
    let peerIpv4 = trimOrNull(body.peer_ipv4)
    let peerIpv6 = trimOrNull(body.peer_ipv6)
    let peerAsn = Number(body.peer_asn)
    let peerName = trimOrNull(body.peer_name)
    let source = trimOrNull(body.source)

    if (transportMode === 'ix') {
      if (!membership) {
        return NextResponse.json(
          { success: false, error: 'Select one of the server IX memberships first' },
          { status: 400 },
        )
      }

      ixId = membership.ix_id
      ixName = membership.ix_name
      localIpv4 = localIpv4 || membership.local_ipaddr4
      localIpv6 = localIpv6 || membership.local_ipaddr6
      source = source || 'peeringdb'

      if ((!peerIpv4 && !peerIpv6) || !Number.isInteger(peerAsn) || peerAsn <= 0) {
        return NextResponse.json(
          { success: false, error: 'IX sessions require peer ASN and at least one peer address' },
          { status: 400 },
        )
      }
    }

    if (transportMode === 'tunnel') {
      if (!tunnel) {
        return NextResponse.json(
          { success: false, error: 'Select a tunnel for tunnel-based sessions' },
          { status: 400 },
        )
      }

      const serverIsA = tunnel.server_a_id === serverId
      const serverIsB = tunnel.server_b_id === serverId

      if (!serverIsA && !serverIsB) {
        return NextResponse.json(
          { success: false, error: 'This tunnel does not belong to the selected server' },
          { status: 400 },
        )
      }

      const oppositeServerId = serverIsA ? tunnel.server_b_id : tunnel.server_a_id
      if (peerServerId && peerServerId !== oppositeServerId) {
        return NextResponse.json(
          { success: false, error: 'Selected peer server does not match the chosen tunnel' },
          { status: 400 },
        )
      }

      const oppositeServer = peerServerId ? peerServer : await db.getServer(oppositeServerId)

      peerServerId = oppositeServer?.id || null
      localIpv4 = localIpv4 || (serverIsA ? tunnel.tunnel_ipv4_a : tunnel.tunnel_ipv4_b)
      localIpv6 = localIpv6 || (serverIsA ? tunnel.tunnel_ipv6_a : tunnel.tunnel_ipv6_b)
      peerIpv4 = peerIpv4 || (serverIsA ? tunnel.tunnel_ipv4_b : tunnel.tunnel_ipv4_a)
      peerIpv6 = peerIpv6 || (serverIsA ? tunnel.tunnel_ipv6_b : tunnel.tunnel_ipv6_a)
      peerName = peerName || oppositeServer?.name || null
      if (sessionType === 'ibgp') {
        peerAsn = oppositeServer?.local_asn || server.local_asn
      } else if (!Number.isInteger(peerAsn) || peerAsn <= 0) {
        peerAsn = oppositeServer?.local_asn || Number(body.peer_asn)
      }
    }

    if (transportMode === 'internal') {
      if (sessionType === 'ibgp') {
        peerAsn = peerServer?.local_asn || server.local_asn
      }

      if ((!peerIpv4 && !peerIpv6) || (!localIpv4 && !localIpv6)) {
        return NextResponse.json(
          { success: false, error: 'Internal sessions require local and peer addresses' },
          { status: 400 },
        )
      }
    }

    if (peerServer && !peerName) {
      peerName = peerServer.name
    }

    if ((addressFamily === 'ipv4' || addressFamily === 'dual') && (!localIpv4 || !peerIpv4)) {
      return NextResponse.json(
        { success: false, error: 'IPv4 or dual-stack sessions require both local and peer IPv4 addresses' },
        { status: 400 },
      )
    }

    if ((addressFamily === 'ipv6' || addressFamily === 'dual') && (!localIpv6 || !peerIpv6)) {
      return NextResponse.json(
        { success: false, error: 'IPv6 or dual-stack sessions require both local and peer IPv6 addresses' },
        { status: 400 },
      )
    }

    if (!Number.isInteger(peerAsn) || peerAsn <= 0) {
      return NextResponse.json(
        { success: false, error: 'Peer ASN is required' },
        { status: 400 },
      )
    }

    const multihop = typeof body.multihop === 'boolean'
      ? Number(body.multihop)
      : Number.isFinite(Number(body.multihop))
        ? Number(body.multihop)
        : 0

    const sessionId = await db.createBGPSession({
      server_id: serverId,
      peer_server_id: peerServerId,
      server_ixp_membership_id: transportMode === 'ix' ? requestedMembershipId : null,
      tunnel_id: transportMode === 'tunnel' ? requestedTunnelId : null,
      ix_id: transportMode === 'ix' ? ixId : null,
      ix_name: transportMode === 'ix' ? ixName : null,
      session_type: sessionType,
      transport_mode: transportMode,
      address_family: addressFamily,
      peer_asn: peerAsn,
      peer_name: peerName,
      local_ipv4: localIpv4,
      local_ipv6: localIpv6,
      peer_ipv4: peerIpv4,
      peer_ipv6: peerIpv6,
      multihop,
      password: trimOrNull(body.password),
      import_filter: trimOrNull(body.import_filter),
      export_filter: trimOrNull(body.export_filter),
      description: trimOrNull(body.description),
      source,
    } satisfies Omit<BGPSession, 'id' | 'status' | 'prefixes_received' | 'prefixes_sent' | 'last_state_change' | 'created_at' | 'updated_at'>)

    return NextResponse.json(
      { success: true, data: await db.getBGPSession(sessionId) },
      { status: 201 },
    )
  } catch (error) {
    console.error('Error creating BGP session:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create BGP session' },
      { status: 500 },
    )
  }
}
