import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUserManager, toSafeUser } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  const authResult = await requireUserManager(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const users = await db.getUsers()
    return NextResponse.json({ success: true, data: users.map(toSafeUser) })
  } catch (error) {
    console.error('Load users failed:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load users' },
      { status: 500 },
    )
  }
}
