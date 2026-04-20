import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { db } from '@/lib/db'

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
    const sessionId = Number.parseInt(id, 10)
    const session = await db.getBGPSession(sessionId)

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'BGP session not found' },
        { status: 404 },
      )
    }

    const deleted = await db.deleteBGPSession(sessionId)
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete BGP session' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting BGP session:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete BGP session' },
      { status: 500 },
    )
  }
}
