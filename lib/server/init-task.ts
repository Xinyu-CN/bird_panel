import 'server-only'

import { db } from '@/lib/db'
import type {
  InitLogLevel,
  InitTaskMode,
  InitTaskStatus,
  Server,
  ServerInitializationLogEntry,
  ServerInitializationTask,
} from '@/types'
import { initializeServer, type InitializeServerContext } from '@/lib/server/initializer'

interface TaskStoreEntry extends ServerInitializationTask {}

declare global {
  var __bgpInitTaskStore: Map<number, TaskStoreEntry> | undefined
}

function getTaskStore() {
  if (!globalThis.__bgpInitTaskStore) {
    globalThis.__bgpInitTaskStore = new Map<number, TaskStoreEntry>()
  }

  return globalThis.__bgpInitTaskStore
}

function now() {
  return Date.now()
}

function createIdleTask(serverId: number): TaskStoreEntry {
  return {
    server_id: serverId,
    status: 'idle',
    mode: 'auto',
    started_at: null,
    finished_at: null,
    allow_manual: false,
    message: null,
    error: null,
    logs: [],
  }
}

function cloneTask(task: TaskStoreEntry): ServerInitializationTask {
  return JSON.parse(JSON.stringify(task)) as ServerInitializationTask
}

function setTask(task: TaskStoreEntry) {
  getTaskStore().set(task.server_id, task)
  return task
}

function getMutableTask(serverId: number): TaskStoreEntry {
  const task = getTaskStore().get(serverId) || createIdleTask(serverId)
  return setTask(task)
}

function getModeLabel(mode: InitTaskMode) {
  return mode === 'manual' ? '\u624b\u52a8' : '\u81ea\u52a8'
}

export function getInitializationTask(serverId: number): ServerInitializationTask {
  return cloneTask(getMutableTask(serverId))
}

export function resetInitializationTask(serverId: number) {
  setTask(createIdleTask(serverId))
}

export function appendInitializationLog(serverId: number, level: InitLogLevel, message: string) {
  const normalizedMessage = message.replace(/\r/g, '')
  if (!normalizedMessage.trim()) {
    return
  }

  const task = getMutableTask(serverId)
  const entry: ServerInitializationLogEntry = {
    id: `${now()}-${task.logs.length + 1}`,
    timestamp: now(),
    level,
    message: normalizedMessage,
  }

  task.logs.push(entry)
  setTask(task)
}

function setTaskStatus(serverId: number, status: InitTaskStatus, updates: Partial<TaskStoreEntry> = {}) {
  const task = getMutableTask(serverId)
  task.status = status
  Object.assign(task, updates)
  setTask(task)
}

function createLogger(server: Server): InitializeServerContext['logger'] {
  return {
    log: (level, message) => appendInitializationLog(server.id, level, message),
    system: (message) => appendInitializationLog(server.id, 'system', message),
    command: (message) => appendInitializationLog(server.id, 'command', message),
    stdout: (message) => appendInitializationLog(server.id, 'stdout', message),
    stderr: (message) => appendInitializationLog(server.id, 'stderr', message),
    error: (message) => appendInitializationLog(server.id, 'error', message),
  }
}

async function runInitializationTask(server: Server, mode: InitTaskMode) {
  const logger = createLogger(server)

  try {
    await db.updateServer(server.id, { status: 'initializing', is_initialized: false })
    logger.system(`\u5f00\u59cb${getModeLabel(mode)}\u521d\u59cb\u5316\uff1a${server.name}`)

    const result = await initializeServer(server, { mode, logger })

    const nextStatus = result.nextStatus || 'online'
    await db.updateServer(server.id, { status: nextStatus, is_initialized: true })

    logger.system(result.message || '\u521d\u59cb\u5316\u5df2\u5b8c\u6210\u3002')
    setTaskStatus(server.id, 'success', {
      finished_at: now(),
      allow_manual: false,
      message: result.message,
      error: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '\u521d\u59cb\u5316\u5931\u8d25'

    await db.updateServer(server.id, { status: 'error', is_initialized: false })
    logger.error(message)
    setTaskStatus(server.id, 'error', {
      finished_at: now(),
      allow_manual: true,
      message: null,
      error: message,
    })
  }
}

export async function startInitializationTask(server: Server, mode: InitTaskMode = 'auto'): Promise<ServerInitializationTask> {
  const currentTask = getMutableTask(server.id)
  if (currentTask.status === 'running') {
    return cloneTask(currentTask)
  }

  const nextTask: TaskStoreEntry = {
    server_id: server.id,
    status: 'running',
    mode,
    started_at: now(),
    finished_at: null,
    allow_manual: false,
    message: null,
    error: null,
    logs: currentTask.status === 'error' && mode === 'manual' ? [...currentTask.logs] : [],
  }

  setTask(nextTask)
  appendInitializationLog(
    server.id,
    'system',
    mode === 'manual'
      ? '\u68c0\u6d4b\u5230\u5931\u8d25\uff0c\u5df2\u8bf7\u6c42\u624b\u52a8\u521d\u59cb\u5316\u3002'
      : '\u5df2\u52a0\u5165\u81ea\u52a8\u521d\u59cb\u5316\u4efb\u52a1\u961f\u5217\u3002',
  )

  void runInitializationTask(server, mode)

  return getInitializationTask(server.id)
}
