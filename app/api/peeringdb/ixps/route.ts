import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { searchPeeringDBIXPs } from '@/lib/peeringdb'

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const limit = Number.parseInt(searchParams.get('limit') || '20', 10)

    if (query.trim().length < 2) {
      return NextResponse.json({ success: true, data: [] })
    }

    const ixps = await searchPeeringDBIXPs(query, limit)
    return NextResponse.json({ success: true, data: ixps })
  } catch (error) {
    console.error('Error searching PeeringDB IXPs:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to search PeeringDB IXPs' },
      { status: 500 },
    )
  }
}
