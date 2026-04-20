import 'server-only'

import type {
  InitLogLevel,
  Server,
  ServerConsoleState,
  ServerInitializationLogEntry,
} from '@/types'
import { createServerSSHConnection } from './ssh-access'
import type { SSHConnection, SSHInteractiveSession } from './ssh'

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000
const MAX_LOG_ENTRIES = 500

interface ConsoleSessionEntry extends ServerConsoleState {
  key: string
  userId: number
  lastUsedAt: number
  activeConnection: SSHConnection | null
  shellSession: SSHInteractiveSession | null
}

declare global {
  var __bgpConsoleSessionStore: Map<string, ConsoleSessionEntry> | undefined
}

function getStore() {
  if (!globalThis.__bgpConsoleSessionStore) {
    globalThis.__bgpConsoleSessionStore = new Map<string, ConsoleSessionEntry>()
  }

  return globalThis.__bgpConsoleSessionStore
}

function now() {
  return Date.now()
}

function getSessionKey(userId: number, serverId: number) {
  return `${userId}:${serverId}`
}

function createEmptyState(userId: number, serverId: number): ConsoleSessionEntry {
  return {
    key: getSessionKey(userId, serverId),
    userId,
    server_id: serverId,
    connected: false,
    running: false,
    current_command: null,
    updated_at: null,
    logs: [],
    lastUsedAt: now(),
    activeConnection: null,
    shellSession: null,
  }
}

function cloneState(entry: ConsoleSessionEntry | null, serverId: number): ServerConsoleState {
  if (!entry) {
    return {
      server_id: serverId,
      connected: false,
      running: false,
      current_command: null,
      updated_at: null,
      logs: [],
    }
  }

  return JSON.parse(JSON.stringify({
    server_id: entry.server_id,
    connected: entry.connected,
    running: entry.running,
    current_command: entry.current_command,
    updated_at: entry.updated_at,
    logs: entry.logs,
  })) as ServerConsoleState
}

function touch(entry: ConsoleSessionEntry) {
  const timestamp = now()
  entry.updated_at = timestamp
  entry.lastUsedAt = timestamp
}

function appendLog(entry: ConsoleSessionEntry, level: InitLogLevel, message: string) {
  const normalizedMessage = message.replace(/\r/g, '')
  if (normalizedMessage.length === 0) {
    return
  }

  const timestamp = now()
  const logEntry: ServerInitializationLogEntry = {
    id: `${timestamp}-${entry.logs.length + 1}`,
    timestamp,
    level,
    message: normalizedMessage,
  }

  entry.logs.push(logEntry)
  if (entry.logs.length > MAX_LOG_ENTRIES) {
    entry.logs.splice(0, entry.logs.length - MAX_LOG_ENTRIES)
  }

  entry.updated_at = timestamp
  entry.lastUsedAt = timestamp
}

function closeActiveResources(entry: ConsoleSessionEntry) {
  entry.shellSession?.close()
  entry.shellSession = null

  entry.activeConnection?.close()
  entry.activeConnection = null
  entry.connected = false
}

function destroyEntry(entry: ConsoleSessionEntry) {
  closeActiveResources(entry)
  getStore().delete(entry.key)
}

function cleanupExpiredSessions() {
  const current = now()

  for (const entry of getStore().values()) {
    if (entry.running) {
      continue
    }

    if (current - entry.lastUsedAt > SESSION_IDLE_TIMEOUT_MS) {
      destroyEntry(entry)
    }
  }
}

function getOrCreateEntry(userId: number, serverId: number) {
  const key = getSessionKey(userId, serverId)
  const existing = getStore().get(key)
  if (existing) {
    return existing
  }

  const entry = createEmptyState(userId, serverId)
  getStore().set(key, entry)
  return entry
}

async function ensureShellSession(entry: ConsoleSessionEntry, server: Server) {
  if (
    entry.activeConnection &&
    entry.shellSession &&
    !entry.activeConnection.isClosed() &&
    !entry.shellSession.isClosed()
  ) {
    return entry.shellSession
  }

  closeActiveResources(entry)
  appendLog(entry, 'system', `正在连接 SSH：${server.ssh_user}@${server.ssh_host}:${server.ssh_port}`)

  const ssh = await createServerSSHConnection(server)
  try {
    const session = await ssh.createInteractiveSession()
    entry.activeConnection = ssh
    entry.shellSession = session
    entry.connected = true
    appendLog(entry, 'system', 'SSH 连接已建立，可连续执行命令')
    return session
  } catch (error) {
    ssh.close()
    throw error
  }
}

async function finalizeCommand(entry: ConsoleSessionEntry, resultPromise: Promise<{ exitCode: number | null; signal: string | null }>) {
  try {
    const result = await resultPromise

    if (result.signal) {
      appendLog(entry, 'system', `[信号] ${result.signal}`)
    }

    if (result.exitCode !== null) {
      appendLog(
        entry,
        result.exitCode === 0 ? 'system' : 'error',
        `[退出码] ${result.exitCode}`,
      )
    } else {
      appendLog(entry, 'system', '命令执行完成')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SSH 命令执行失败'
    appendLog(entry, message === '命令已中断' ? 'system' : 'error', message)

    if (
      !entry.activeConnection ||
      !entry.shellSession ||
      entry.activeConnection.isClosed() ||
      entry.shellSession.isClosed()
    ) {
      closeActiveResources(entry)
    }
  } finally {
    entry.running = false
    entry.current_command = null
    touch(entry)
  }
}

export function getServerConsoleState(userId: number, serverId: number): ServerConsoleState {
  cleanupExpiredSessions()
  return cloneState(getStore().get(getSessionKey(userId, serverId)) || null, serverId)
}

export async function startServerConsoleCommand(userId: number, server: Server, command: string): Promise<ServerConsoleState> {
  cleanupExpiredSessions()

  const entry = getOrCreateEntry(userId, server.id)
  if (entry.running) {
    throw new Error('已有命令正在执行，请等待当前命令结束')
  }

  entry.running = true
  entry.current_command = command
  touch(entry)
  appendLog(entry, 'command', `$ ${command}`)

  try {
    const session = await ensureShellSession(entry, server)
    const resultPromise = session.run(command, {
      onStdout: (chunk) => appendLog(entry, 'stdout', chunk),
      onStderr: (chunk) => appendLog(entry, 'stderr', chunk),
    })

    void finalizeCommand(entry, resultPromise)
    return cloneState(entry, server.id)
  } catch (error) {
    entry.running = false
    entry.current_command = null
    closeActiveResources(entry)
    touch(entry)

    const message = error instanceof Error ? error.message : 'SSH 命令执行失败'
    appendLog(entry, 'error', message)
    throw new Error(message)
  }
}

export function interruptServerConsoleCommand(userId: number, serverId: number) {
  cleanupExpiredSessions()

  const entry = getStore().get(getSessionKey(userId, serverId))
  if (!entry || !entry.running || !entry.shellSession) {
    return false
  }

  appendLog(entry, 'system', '已发送中断信号 (Ctrl+C)')
  entry.shellSession.interrupt()
  touch(entry)
  return true
}

export function closeServerConsoleSession(userId: number, serverId: number) {
  const entry = getStore().get(getSessionKey(userId, serverId))
  if (!entry) {
    return
  }

  destroyEntry(entry)
}
