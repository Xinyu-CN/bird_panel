import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { getInitializationTask, startInitializationTask } from '@/lib/server/init-task'
import type { InitTaskMode } from '@/types'

function parseTaskMode(value: unknown): InitTaskMode {
  return value === 'manual' ? 'manual' : 'auto'
}

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
    const serverId = Number.parseInt(id, 10)

    if (Number.isNaN(serverId)) {
      return NextResponse.json({ success: false, error: '\u65e0\u6548\u7684\u670d\u52a1\u5668 ID' }, { status: 400 })
    }

    const server = await db.getServer(serverId)
    if (!server) {
      return NextResponse.json({ success: false, error: '\u670d\u52a1\u5668\u4e0d\u5b58\u5728' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        task: getInitializationTask(serverId),
        server,
      },
    })
  } catch (error) {
    console.error('Error fetching initialization task:', error)
    return NextResponse.json({ success: false, error: '\u83b7\u53d6\u521d\u59cb\u5316\u4efb\u52a1\u5931\u8d25' }, { status: 500 })
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
    const serverId = Number.parseInt(id, 10)

    if (Number.isNaN(serverId)) {
      return NextResponse.json({ success: false, error: '\u65e0\u6548\u7684\u670d\u52a1\u5668 ID' }, { status: 400 })
    }

    const server = await db.getServer(serverId)
    if (!server) {
      return NextResponse.json({ success: false, error: '\u670d\u52a1\u5668\u4e0d\u5b58\u5728' }, { status: 404 })
    }

    let body: { mode?: InitTaskMode } = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const mode = parseTaskMode(body.mode)
    const currentTask = getInitializationTask(serverId)

    if (mode === 'manual' && currentTask.status !== 'error') {
      return NextResponse.json(
        { success: false, error: '\u4ec5\u5728\u521d\u59cb\u5316\u5931\u8d25\u540e\u624d\u5141\u8bb8\u624b\u52a8\u521d\u59cb\u5316\u3002' },
        { status: 400 },
      )
    }

    const task = await startInitializationTask(server, mode)

    return NextResponse.json({
      success: true,
      data: {
        task,
        server: await db.getServer(serverId),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '\u521d\u59cb\u5316\u670d\u52a1\u5668\u5931\u8d25'
    console.error('Error initializing server:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
