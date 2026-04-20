import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { resetInitializationTask } from '@/lib/server/init-task'
import { importServerVarsFromRemote } from '@/lib/server/vars-conf'

interface RequestBody {
  action?: 'import_remote' | 'mark_uninitialized'
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
    const serverId = Number.parseInt(id, 10)
    const server = await db.getServer(serverId)

    if (!server) {
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 },
      )
    }

    const body = await request.json() as RequestBody

    if (body.action === 'import_remote') {
      const result = await importServerVarsFromRemote(server)
      return NextResponse.json({
        success: true,
        data: result,
      })
    }

    if (body.action === 'mark_uninitialized') {
      await db.updateServer(server.id, {
        is_initialized: false,
        status: 'pending',
      })
      resetInitializationTask(server.id)

      return NextResponse.json({
        success: true,
        data: {
          server: await db.getServer(server.id),
        },
      })
    }

    return NextResponse.json(
      { success: false, error: 'Unsupported action' },
      { status: 400 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update initialization state'
    console.error('Error updating initialization state:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
