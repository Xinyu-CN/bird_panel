import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth/session'
import { notifyAlert } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const unresolvedOnly = searchParams.get('unresolved') === 'true'

    const alerts = await db.getAlerts(limit, unresolvedOnly)
    return NextResponse.json({ success: true, data: alerts })
  } catch (error) {
    console.error('Failed to get alerts:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch alerts' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const body = await request.json()
    const { server_id, tunnel_id, session_id, severity, type, message } = body

    if (!severity || !type || !message) {
      return NextResponse.json(
        { success: false, error: 'Severity, type, and message are required' },
        { status: 400 }
      )
    }

    const id = await db.createAlert({
      server_id: server_id || null,
      tunnel_id: tunnel_id || null,
      session_id: session_id || null,
      severity,
      type,
      message,
    })

    await notifyAlert(id)

    return NextResponse.json({ success: true, data: { id } })
  } catch (error) {
    console.error('Failed to create alert:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create alert' },
      { status: 500 }
    )
  }
}
