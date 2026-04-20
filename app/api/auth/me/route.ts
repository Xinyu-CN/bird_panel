import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request)

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    )
  }

  return NextResponse.json({ success: true, data: user })
}
