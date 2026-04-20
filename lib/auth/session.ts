import { createHmac } from 'crypto'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { SafeUser, User } from '@/types'

export const SESSION_COOKIE_NAME = 'bgp_panel_session'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

interface SessionPayload {
  sub: number
  exp: number
}

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET || 'bgp-panel-dev-secret-change-me'
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf-8').toString('base64url')
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf-8')
}

function signPayload(encodedPayload: string) {
  return createHmac('sha256', getSessionSecret()).update(encodedPayload).digest('base64url')
}

export function createSessionToken(user: Pick<User, 'id'>) {
  const payload: SessionPayload = {
    sub: user.id,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }
  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  const signature = signPayload(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export function verifySessionToken(token: string | undefined) {
  if (!token) {
    return null
  }

  const [encodedPayload, signature] = token.split('.')

  if (!encodedPayload || !signature) {
    return null
  }

  if (signPayload(encodedPayload) !== signature) {
    return null
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

export function toSafeUser(user: User): SafeUser {
  const { password_hash: _passwordHash, ...safeUser } = user
  return safeUser
}

export async function getCurrentUserFromToken(token: string | undefined) {
  const payload = verifySessionToken(token)
  if (!payload) {
    return null
  }

  const user = await db.getUser(payload.sub)
  return user ? toSafeUser(user) : null
}

export async function getCurrentUserFromRequest(request: NextRequest) {
  return getCurrentUserFromToken(request.cookies.get(SESSION_COOKIE_NAME)?.value)
}

export async function getCurrentUserFromCookies() {
  const cookieStore = await cookies()
  return getCurrentUserFromToken(cookieStore.get(SESSION_COOKIE_NAME)?.value)
}

export function applySessionCookie(response: NextResponse, user: Pick<User, 'id'>) {
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  })
}

export async function requireApiUser(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request)

  if (!user) {
    return {
      response: NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 },
      ),
    }
  }

  return { user }
}

export async function requireUserManager(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult
  }

  if (!authResult.user.can_manage_users) {
    return {
      response: NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 },
      ),
    }
  }

  return authResult
}
