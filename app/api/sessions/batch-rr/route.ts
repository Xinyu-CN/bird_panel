import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { buildRrSessionPairs } from '@/lib/bgp/automation'

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const [servers, existingSessions] = await Promise.all([
      db.getServers(),
      db.getBGPSessions(),
    ])

    const plans = buildRrSessionPairs(servers, existingSessions)
    const createdIds: number[] = []

    for (const plan of plans) {
      createdIds.push(await db.createBGPSession(plan))
    }

    return NextResponse.json({
      success: true,
      data: {
        created: createdIds.length,
        session_ids: createdIds,
      },
    })
  } catch (error) {
    console.error('Failed to batch create RR sessions:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to batch create RR sessions' },
      { status: 500 },
    )
  }
}
