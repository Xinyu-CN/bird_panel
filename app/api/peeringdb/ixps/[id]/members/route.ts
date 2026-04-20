import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { listPeeringDBIXPMembers } from '@/lib/peeringdb'

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
    const ixId = Number.parseInt(id, 10)

    if (!Number.isInteger(ixId) || ixId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid IX id' },
        { status: 400 },
      )
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const limit = Number.parseInt(searchParams.get('limit') || '200', 10)

    const peers = await listPeeringDBIXPMembers(ixId, { query, limit })
    return NextResponse.json({ success: true, data: peers })
  } catch (error) {
    console.error('Error loading PeeringDB IX members:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load PeeringDB IX members' },
      { status: 500 },
    )
  }
}
