import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { generateHostname } from '@/lib/network/ip-allocator'
import type { Server } from '@/types'

const SERVER_STATUSES: Server['status'][] = ['pending', 'initializing', 'online', 'offline', 'error']

function isValidServerType(type: unknown): type is Server['type'] {
  return type === 'rr' || type === 'node'
}

function isValidServerStatus(status: unknown): status is Server['status'] {
  return typeof status === 'string' && SERVER_STATUSES.includes(status as Server['status'])
}

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
    const server = await db.getServer(Number.parseInt(id, 10))

    if (!server) {
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 },
      )
    }

    return NextResponse.json({ success: true, data: server })
  } catch (error) {
    console.error('Error fetching server:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch server' },
      { status: 500 },
    )
  }
}

export async function PATCH(
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
    const body = await request.json() as Partial<Server>

    const server = await db.getServer(serverId)
    if (!server) {
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 },
      )
    }

    const updates: Partial<Server> = {}

    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) {
        return NextResponse.json(
          { success: false, error: 'Name cannot be empty' },
          { status: 400 },
        )
      }

      updates.name = name
    }

    if (body.type !== undefined) {
      if (!isValidServerType(body.type)) {
        return NextResponse.json(
          { success: false, error: 'Server type must be rr or node' },
          { status: 400 },
        )
      }

      updates.type = body.type
    }

    const nextType = updates.type || server.type

    if (body.is_core !== undefined || body.type !== undefined) {
      updates.is_core = nextType === 'rr' ? false : Boolean(body.is_core ?? server.is_core)
    }

    if (body.is_initialized !== undefined) {
      updates.is_initialized = Boolean(body.is_initialized)
    }

    if (body.icao_code !== undefined) {
      const icaoCode = body.icao_code.trim().toUpperCase()
      if (!icaoCode || icaoCode.length != 4) {
        return NextResponse.json(
          { success: false, error: 'ICAO code must be 4 characters' },
          { status: 400 },
        )
      }

      updates.icao_code = icaoCode
    }

    if (body.node_id !== undefined) {
      const nodeId = Number(body.node_id)
      if (!Number.isInteger(nodeId) || nodeId <= 0) {
        return NextResponse.json(
          { success: false, error: 'Node ID must be a positive integer' },
          { status: 400 },
        )
      }

      updates.node_id = nodeId
    }

    if (body.latitude !== undefined) {
      const latitude = Number(body.latitude)
      if (!Number.isFinite(latitude)) {
        return NextResponse.json(
          { success: false, error: 'Latitude must be a valid number' },
          { status: 400 },
        )
      }

      updates.latitude = latitude
    }

    if (body.longitude !== undefined) {
      const longitude = Number(body.longitude)
      if (!Number.isFinite(longitude)) {
        return NextResponse.json(
          { success: false, error: 'Longitude must be a valid number' },
          { status: 400 },
        )
      }

      updates.longitude = longitude
    }

    if (body.city !== undefined) {
      updates.city = body.city?.trim() || null
    }

    if (body.country_code !== undefined) {
      const countryCode = body.country_code.trim()
      if (!countryCode) {
        return NextResponse.json(
          { success: false, error: 'Country code cannot be empty' },
          { status: 400 },
        )
      }

      updates.country_code = countryCode
    }

    if (body.region_code !== undefined) {
      const regionCode = body.region_code.trim()
      if (!regionCode) {
        return NextResponse.json(
          { success: false, error: 'Region code cannot be empty' },
          { status: 400 },
        )
      }

      updates.region_code = regionCode
    }

    if (body.ssh_host !== undefined) {
      const sshHost = body.ssh_host.trim()
      if (!sshHost) {
        return NextResponse.json(
          { success: false, error: 'SSH host cannot be empty' },
          { status: 400 },
        )
      }

      updates.ssh_host = sshHost
    }

    if (body.ssh_port !== undefined) {
      const sshPort = Number(body.ssh_port)
      if (!Number.isInteger(sshPort) || sshPort <= 0) {
        return NextResponse.json(
          { success: false, error: 'SSH port must be a positive integer' },
          { status: 400 },
        )
      }

      updates.ssh_port = sshPort
    }

    if (body.ssh_user !== undefined) {
      const sshUser = body.ssh_user.trim()
      if (!sshUser) {
        return NextResponse.json(
          { success: false, error: 'SSH user cannot be empty' },
          { status: 400 },
        )
      }

      updates.ssh_user = sshUser
    }

    if (body.ssh_key_id !== undefined) {
      updates.ssh_key_id = body.ssh_key_id
    }

    if (body.status !== undefined) {
      if (!isValidServerStatus(body.status)) {
        return NextResponse.json(
          { success: false, error: 'Invalid server status' },
          { status: 400 },
        )
      }

      updates.status = body.status
    }

    const hostnameNeedsRefresh =
      body.type !== undefined ||
      body.is_core !== undefined ||
      body.icao_code !== undefined ||
      body.node_id !== undefined

    if (hostnameNeedsRefresh) {
      const dnsZone = await db.getSetting('dns_zone')
      if (dnsZone) {
        updates.hostname = generateHostname(
          updates.icao_code || server.icao_code,
          updates.node_id || server.node_id,
          nextType,
          dnsZone,
          nextType === 'rr' ? false : (updates.is_core ?? server.is_core),
        )
      }
    }

    const updated = await db.updateServer(serverId, updates)
    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Failed to update server' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, data: await db.getServer(serverId) })
  } catch (error) {
    console.error('Error updating server:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update server' },
      { status: 500 },
    )
  }
}

export async function DELETE(
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
    const server = await db.getServer(serverId)

    if (!server) {
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 },
      )
    }

    const deleted = await db.deleteServer(serverId)

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete server' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting server:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete server' },
      { status: 500 },
    )
  }
}
