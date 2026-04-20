import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { db } from '@/lib/db'

interface CreateServerIxpBody {
  ix_id?: number
  ix_name?: string
  ix_name_long?: string | null
  ix_country?: string | null
  ix_city?: string | null
  ix_region_continent?: string | null
  local_ipaddr4?: string | null
  local_ipaddr6?: string | null
  speed?: number | null
  is_rs_peer?: boolean
  notes?: string | null
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
    const serverId = Number.parseInt(id, 10)
    const server = await db.getServer(serverId)

    if (!server) {
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 },
      )
    }

    const memberships = await db.getServerIxpMemberships(serverId)
    return NextResponse.json({ success: true, data: memberships })
  } catch (error) {
    console.error('Error loading server IX memberships:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load server IX memberships' },
      { status: 500 },
    )
  }
}

export async function POST(
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

    const body = await request.json() as CreateServerIxpBody
    const ixId = Number(body.ix_id)
    const ixName = body.ix_name?.trim()
    const speed = body.speed === null || body.speed === undefined
      ? null
      : Number(body.speed)

    if (!Number.isInteger(ixId) || ixId <= 0 || !ixName) {
      return NextResponse.json(
        { success: false, error: 'IX id and IX name are required' },
        { status: 400 },
      )
    }

    if (speed !== null && (!Number.isInteger(speed) || speed < 0)) {
      return NextResponse.json(
        { success: false, error: 'Speed must be a positive integer' },
        { status: 400 },
      )
    }

    const membershipId = await db.createServerIxpMembership({
      server_id: serverId,
      ix_id: ixId,
      ix_name: ixName,
      ix_name_long: body.ix_name_long?.trim() || null,
      ix_country: body.ix_country?.trim() || null,
      ix_city: body.ix_city?.trim() || null,
      ix_region_continent: body.ix_region_continent?.trim() || null,
      local_asn: server.local_asn,
      local_ipaddr4: body.local_ipaddr4?.trim() || null,
      local_ipaddr6: body.local_ipaddr6?.trim() || null,
      speed,
      is_rs_peer: Boolean(body.is_rs_peer),
      notes: body.notes?.trim() || null,
    })

    return NextResponse.json(
      { success: true, data: await db.getServerIxpMembership(membershipId) },
      { status: 201 },
    )
  } catch (error) {
    console.error('Error creating server IX membership:', error)

    const message = error instanceof Error && error.message.includes('UNIQUE constraint failed')
      ? 'This server already has that IXP membership.'
      : 'Failed to create server IX membership'

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
