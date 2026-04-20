import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { deployTunnelAutomation, getTunnelAutomationPreview } from '@/lib/tunnels/automation'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const { id } = await params
    const tunnelId = Number.parseInt(id, 10)
    if (!Number.isInteger(tunnelId) || tunnelId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid tunnel id' }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: await getTunnelAutomationPreview(tunnelId) })
  } catch (error) {
    console.error('Failed to load tunnel automation preview:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load tunnel automation preview' },
      { status: 500 },
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiUser(request)
  if ('response' in authResult) {
    return authResult.response
  }

  try {
    const { id } = await params
    const tunnelId = Number.parseInt(id, 10)
    if (!Number.isInteger(tunnelId) || tunnelId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid tunnel id' }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: await deployTunnelAutomation(tunnelId) })
  } catch (error) {
    console.error('Failed to deploy tunnel automation:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to deploy tunnel automation' },
      { status: 500 },
    )
  }
}
