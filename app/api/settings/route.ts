import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth/session'
import { getSystemSettings } from '@/lib/system-settings'

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    return NextResponse.json({ success: true, data: await getSystemSettings() })
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settings' },
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
    const body = await request.json() as Record<string, string>
    
    // Update each setting
    for (const [key, value] of Object.entries(body)) {
      await db.setSetting(key, value)
    }
    
    return NextResponse.json({ success: true, data: await getSystemSettings() })
  } catch (error) {
    console.error('Error updating settings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update settings' },
      { status: 500 }
    )
  }
}
