import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { applySessionCookie, toSafeUser } from '@/lib/auth/session'

export async function POST(request: NextRequest) {
  try {
    if (await db.getUserCount() === 0) {
      return NextResponse.json(
        { success: false, error: 'Database is empty. Create the first admin account before logging in.' },
        { status: 400 },
      )
    }

    const body = await request.json() as { username?: string; password?: string }
    const username = body.username?.trim().toLowerCase()
    const password = body.password?.trim()

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 },
      )
    }

    const user = await db.getUserByUsername(username)

    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json(
        { success: false, error: 'Invalid username or password' },
        { status: 401 },
      )
    }

    await db.updateUser(user.id, { last_login_at: Math.floor(Date.now() / 1000) })

    const response = NextResponse.json({ success: true, data: toSafeUser(user) })
    applySessionCookie(response, user)
    return response
  } catch (error) {
    console.error('Login failed:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to login' },
      { status: 500 },
    )
  }
}
