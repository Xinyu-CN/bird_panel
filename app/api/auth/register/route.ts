import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth/password'
import { requireUserManager, toSafeUser } from '@/lib/auth/session'
import type { User, UserRole } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const userCount = await db.getUserCount()
    const isBootstrap = userCount === 0

    let creatorId: number | null = null
    if (!isBootstrap) {
      const authResult = await requireUserManager(request)
      if ('response' in authResult) {
        return authResult.response
      }
      creatorId = authResult.user.id
    }

    const body = await request.json() as {
      username?: string
      display_name?: string
      password?: string
      role?: UserRole
      can_manage_users?: boolean
    }

    const username = body.username?.trim().toLowerCase()
    const password = body.password?.trim()

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 },
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 },
      )
    }

    const existingUser = await db.getUserByUsername(username)
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'Username already exists' },
        { status: 409 },
      )
    }

    const role = isBootstrap ? 'admin' : body.role === 'admin' ? 'admin' : 'member'
    const canManageUsers = isBootstrap || role === 'admin' || Boolean(body.can_manage_users)

    const newUser: Omit<User, 'id' | 'last_login_at' | 'created_at' | 'updated_at'> = {
      username,
      display_name: body.display_name?.trim() || null,
      password_hash: hashPassword(password),
      role,
      can_manage_users: canManageUsers,
      created_by: creatorId,
    }

    const userId = await db.createUser(newUser)
    const createdUser = await db.getUser(userId)

    return NextResponse.json(
      { success: true, data: createdUser ? toSafeUser(createdUser) : null, bootstrap: isBootstrap },
      { status: 201 },
    )
  } catch (error) {
    console.error('Register user failed:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to register user' },
      { status: 500 },
    )
  }
}
