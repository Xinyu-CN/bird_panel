import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth/session'

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
    const keyId = Number.parseInt(id, 10)

    if (!Number.isInteger(keyId) || keyId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid SSH key id' },
        { status: 400 },
      )
    }

    const deleted = await db.deleteSSHKey(keyId)
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'SSH key not found' },
        { status: 404 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete SSH key:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete SSH key' },
      { status: 500 },
    )
  }
}
