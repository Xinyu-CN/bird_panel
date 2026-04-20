import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const keys = await db.getSSHKeys()
    // Don't expose private keys in listing
    const safeKeys = keys.map(k => ({
      id: k.id,
      name: k.name,
      public_key: k.public_key,
      created_at: k.created_at,
    }))
    return NextResponse.json({ success: true, data: safeKeys })
  } catch (error) {
    console.error('Failed to get SSH keys:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch SSH keys' },
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
    const { name, private_key, public_key } = body

    if (!name || !private_key) {
      return NextResponse.json(
        { success: false, error: 'Name and private key are required' },
        { status: 400 }
      )
    }

    const id = await db.createSSHKey({
      name,
      private_key,
      public_key: public_key || null,
    })

    return NextResponse.json({ success: true, data: { id } })
  } catch (error) {
    console.error('Failed to create SSH key:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create SSH key' },
      { status: 500 }
    )
  }
}
