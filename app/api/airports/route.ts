import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { searchAirports } from '@/lib/airports'

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '12', 10)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 50)
      : 12

    return NextResponse.json({
      success: true,
      data: searchAirports(query, limit),
    })
  } catch (error) {
    console.error('Error searching airports:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to search airports' },
      { status: 500 },
    )
  }
}
