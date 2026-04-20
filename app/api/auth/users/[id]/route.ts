import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth/password'
import { requireUserManager, toSafeUser } from '@/lib/auth/session'
import type { UserRole } from '@/types'

function canManageCount(users: Awaited<ReturnType<typeof db.getUsers>>) {
  return users.filter((user) => user.can_manage_users).length
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireUserManager(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const { id } = await params
    const userId = Number(id)
    const targetUser = await db.getUser(userId)

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 },
      )
    }

    const body = await request.json() as {
      password?: string
      display_name?: string
      role?: UserRole
      can_manage_users?: boolean
    }

    const updates: Record<string, unknown> = {}

    if (typeof body.display_name === 'string') {
      updates.display_name = body.display_name.trim() || null
    }

    if (typeof body.password === 'string') {
      const password = body.password.trim()
      if (password.length < 8) {
        return NextResponse.json(
          { success: false, error: 'Password must be at least 8 characters' },
          { status: 400 },
        )
      }
      updates.password_hash = hashPassword(password)
    }

    if (body.role === 'admin' || body.role === 'member') {
      updates.role = body.role
    }

    if (typeof body.can_manage_users === 'boolean') {
      updates.can_manage_users = body.can_manage_users
    }

    const nextCanManage = updates.role === 'admin'
      ? true
      : typeof updates.can_manage_users === 'boolean'
        ? updates.can_manage_users
        : targetUser.can_manage_users

    if (updates.role === 'admin') {
      updates.can_manage_users = true
    }

    if (targetUser.can_manage_users && !nextCanManage) {
      const users = await db.getUsers()
      if (canManageCount(users) <= 1) {
        return NextResponse.json(
          { success: false, error: 'At least one user with registration permission must remain' },
          { status: 400 },
        )
      }
    }

    const updated = await db.updateUser(userId, updates)
    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'No changes were applied' },
        { status: 400 },
      )
    }

    const user = await db.getUser(userId)
    return NextResponse.json({ success: true, data: user ? toSafeUser(user) : null })
  } catch (error) {
    console.error('Update user failed:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update user' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireUserManager(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const { id } = await params
    const userId = Number(id)

    if (userId === authResult.user.id) {
      return NextResponse.json(
        { success: false, error: 'You cannot delete the currently logged in user' },
        { status: 400 },
      )
    }

    const targetUser = await db.getUser(userId)
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 },
      )
    }

    if (targetUser.can_manage_users) {
      const users = await db.getUsers()
      if (canManageCount(users) <= 1) {
        return NextResponse.json(
          { success: false, error: 'At least one user with registration permission must remain' },
          { status: 400 },
        )
      }
    }

    const deleted = await db.deleteUser(userId)
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete user' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete user failed:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete user' },
      { status: 500 },
    )
  }
}
