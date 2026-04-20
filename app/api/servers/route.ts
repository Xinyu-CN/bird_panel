import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { allocateServerIPv6, generateHostname, generateRouterId } from '@/lib/network/ip-allocator'
import type { Server, ServerFormData } from '@/types'

function isValidServerType(type: unknown): type is Server['type'] {
  return type === 'rr' || type === 'node'
}

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const { searchParams } = new URL(request.url)
    const rawType = searchParams.get('type')
    const type = isValidServerType(rawType) ? rawType : null

    const servers = type
      ? await db.getServers(type)
      : await db.getServers()

    return NextResponse.json({ success: true, data: servers })
  } catch (error) {
    console.error('Error fetching servers:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch servers' },
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
    const body = await request.json() as ServerFormData

    const backbonePrefix = await db.getSetting('backbone_v6_prefix')
    const dnsZone = await db.getSetting('dns_zone')
    const localAsnSetting = await db.getSetting('local_asn')

    if (!backbonePrefix || !dnsZone || !localAsnSetting) {
      return NextResponse.json(
        { success: false, error: 'Please configure local_asn, backbone_v6_prefix, and dns_zone before creating servers' },
        { status: 400 },
      )
    }

    const serverType = isValidServerType(body.type) ? body.type : null
    const normalizedIcao = body.icao_code?.trim().toUpperCase()
    const normalizedName = body.name?.trim()
    const latitude = Number(body.latitude)
    const longitude = Number(body.longitude)
    const sshPort = Number(body.ssh_port)
    const localAsn = Number.parseInt(localAsnSetting, 10)

    if (!serverType) {
      return NextResponse.json(
        { success: false, error: 'Server type must be rr or node' },
        { status: 400 },
      )
    }

    if (!normalizedName || !normalizedIcao || normalizedIcao.length !== 4) {
      return NextResponse.json(
        { success: false, error: 'Name and ICAO code are required' },
        { status: 400 },
      )
    }

    if (!body.region_code || !body.country_code) {
      return NextResponse.json(
        { success: false, error: 'Region code and country code are required' },
        { status: 400 },
      )
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { success: false, error: 'Latitude and longitude must be valid numbers' },
        { status: 400 },
      )
    }

    if (!body.ssh_host || !body.ssh_user || !Number.isInteger(sshPort) || sshPort <= 0) {
      return NextResponse.json(
        { success: false, error: 'SSH host, port, and user are required' },
        { status: 400 },
      )
    }

    if (Number.isNaN(localAsn)) {
      return NextResponse.json(
        { success: false, error: 'local_asn must be a valid integer' },
        { status: 400 },
      )
    }

    const isCore = serverType === 'node' ? Boolean(body.is_core) : false
    const existingServers = await db.getServers()
    const regionServers = existingServers.filter((server) => server.region_code === body.region_code)
    const requestedNodeId = body.node_id ? Number(body.node_id) : 0
    const nextNodeId = requestedNodeId > 0
      ? requestedNodeId
      : regionServers.length > 0
        ? Math.max(...regionServers.map((server) => server.node_id)) + 1
        : 1
    const regionIndex = Number.parseInt(body.region_code.trim(), 10) % 16
    const ipv6Address = allocateServerIPv6(backbonePrefix, regionIndex, nextNodeId)
    const hostname = generateHostname(normalizedIcao, nextNodeId, serverType, dnsZone, isCore)

    const serverData: Omit<Server, 'id' | 'status' | 'last_seen_at' | 'created_at' | 'updated_at'> = {
      name: normalizedName,
      type: serverType,
      is_core: isCore,
      is_initialized: false,
      icao_code: normalizedIcao,
      node_id: nextNodeId,
      hostname,
      latitude,
      longitude,
      city: body.city?.trim() || null,
      country_code: body.country_code.trim(),
      region_code: body.region_code.trim(),
      local_asn: localAsn,
      ipv4_address: null,
      ipv6_address: ipv6Address,
      ipv6_prefix: backbonePrefix,
      router_id: null,
      ssh_host: body.ssh_host.trim(),
      ssh_port: sshPort,
      ssh_user: body.ssh_user.trim(),
      ssh_key_id: body.ssh_key_id || null,
    }

    const serverId = await db.createServer(serverData)

    const server = await db.getServer(serverId)
    if (server) {
      const routerId = generateRouterId(server)
      await db.updateServer(serverId, { router_id: routerId })
    }

    return NextResponse.json(
      { success: true, data: await db.getServer(serverId) },
      { status: 201 },
    )
  } catch (error) {
    console.error('Error creating server:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create server' },
      { status: 500 },
    )
  }
}
