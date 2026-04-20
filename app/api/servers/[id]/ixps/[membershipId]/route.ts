import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { db } from '@/lib/db'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; membershipId: string }> },
) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const { id, membershipId } = await params
    const serverId = Number.parseInt(id, 10)
    const recordId = Number.parseInt(membershipId, 10)

    const server = await db.getServer(serverId)
    const membership = await db.getServerIxpMembership(recordId)

    if (!server || !membership || membership.server_id !== serverId) {
      return NextResponse.json(
        { success: false, error: 'IX membership not found' },
        { status: 404 },
      )
    }

    const deleted = await db.deleteServerIxpMembership(recordId)
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete IX membership' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting server IX membership:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete IX membership' },
      { status: 500 },
    )
  }
}
