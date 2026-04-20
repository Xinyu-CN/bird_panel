import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const [users, servers, tunnels, databasePath] = await Promise.all([
      db.getUserCount(),
      db.getServerCount(),
      db.getTunnelCount(),
      db.getDatabasePath(),
    ])

    return NextResponse.json({
      success: true,
      initialized: true,
      data: {
        users,
        servers,
        tunnels,
        databasePath,
      },
    })
  } catch (error) {
    console.error('Failed to inspect database:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to inspect database' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  return NextResponse.json(
    { success: false, error: 'Mock initialization has been removed. Please create real data through the panel APIs.' },
    { status: 410 },
  )
}
