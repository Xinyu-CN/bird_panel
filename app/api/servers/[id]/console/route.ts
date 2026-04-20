import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/session'
import { db } from '@/lib/db'
import {
  closeServerConsoleSession,
  getServerConsoleState,
  interruptServerConsoleCommand,
  startServerConsoleCommand,
} from '@/lib/server/console-session'

function normalizeCommand(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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
      return NextResponse.json({ success: false, error: '无效的服务器 ID' }, { status: 400 })
    }

    const server = await db.getServer(serverId)
    if (!server) {
      return NextResponse.json({ success: false, error: '服务器不存在' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: getServerConsoleState(authResult.user.id, serverId),
    })
  } catch (error) {
    console.error('Error fetching console state:', error)
    return NextResponse.json({ success: false, error: '获取 SSH 控制台状态失败' }, { status: 500 })
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
      return NextResponse.json({ success: false, error: '无效的服务器 ID' }, { status: 400 })
    }

    const server = await db.getServer(serverId)
    if (!server) {
      return NextResponse.json({ success: false, error: '服务器不存在' }, { status: 404 })
    }

    if (server.status === 'initializing') {
      return NextResponse.json(
        { success: false, error: '当前服务器正在初始化，请等待初始化完成' },
        { status: 400 },
      )
    }

    let body: { command?: string } = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const command = normalizeCommand(body.command)
    if (!command) {
      return NextResponse.json({ success: false, error: '命令不能为空' }, { status: 400 })
    }

    const state = await startServerConsoleCommand(authResult.user.id, server, command)
    return NextResponse.json({ success: true, data: state })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SSH 命令执行失败'
    console.error('Error executing SSH command:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(
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
      return NextResponse.json({ success: false, error: '无效的服务器 ID' }, { status: 400 })
    }

    const interrupted = interruptServerConsoleCommand(authResult.user.id, serverId)
    if (!interrupted) {
      return NextResponse.json({ success: false, error: '当前没有可中断的 SSH 命令' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: getServerConsoleState(authResult.user.id, serverId),
    })
  } catch (error) {
    console.error('Error interrupting SSH command:', error)
    return NextResponse.json({ success: false, error: '中断 SSH 命令失败' }, { status: 500 })
  }
}

export async function DELETE(
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
      return NextResponse.json({ success: false, error: '无效的服务器 ID' }, { status: 400 })
    }

    closeServerConsoleSession(authResult.user.id, serverId)
    return NextResponse.json({
      success: true,
      data: getServerConsoleState(authResult.user.id, serverId),
    })
  } catch (error) {
    console.error('Error closing SSH console session:', error)
    return NextResponse.json({ success: false, error: '重置 SSH 会话失败' }, { status: 500 })
  }
}
