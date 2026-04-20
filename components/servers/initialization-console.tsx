'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Play, RefreshCw, Send, TerminalSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  InitTaskMode,
  InitLogLevel,
  Server,
  ServerConsoleState,
  ServerInitializationLogEntry,
  ServerInitializationTask,
} from '@/types'

interface InitializationConsoleProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server: Server | null
  autoStartToken?: number
  onTaskChange?: () => void | Promise<void>
}

type ConsoleStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error'

const STATUS_STYLE: Record<ServerInitializationTask['status'], string> = {
  idle: 'bg-muted text-muted-foreground',
  running: 'bg-status-warning/20 text-status-warning',
  success: 'bg-status-online/20 text-status-online',
  error: 'bg-destructive/15 text-destructive',
}

const STATUS_LABEL: Record<ServerInitializationTask['status'], string> = {
  idle: '空闲',
  running: '进行中',
  success: '成功',
  error: '失败',
}

const MODE_LABEL: Record<InitTaskMode, string> = {
  auto: '自动',
  manual: '手动',
}

const TEXT = {
  title: '初始化 / SSH 控制台',
  description: '查看初始化日志，并通过 SSH 命令面板执行远程命令。',
  server: '服务器',
  mode: '模式',
  startedAt: '启动于',
  notStarted: '尚未启动',
  terminalTitle: '终端输出',
  loadingOutput: '正在加载终端输出...',
  failedTitle: '初始化失败',
  unknownError: '未知错误',
  refresh: '刷新',
  manualInit: '手动重试',
  commandTitle: 'SSH 命令',
  commandPlaceholder: '例如 uname -a',
  commandHint: '这是连续会话模式：后续命令会复用同一 SSH Shell，上下文会尽量保持。',
  commandButton: '执行',
  commandDisabled: '当前状态不允许执行 SSH 命令。',
  commandUnavailable: 'SSH 控制台不可用',
  interruptButton: '中断 (Ctrl+C)',
  fetchTaskFailed: '获取初始化任务失败',
  fetchConsoleFailed: '获取 SSH 控制台状态失败',
  startTaskFailed: '启动初始化失败',
  startLogError: '启动初始化失败',
  commandLogError: '执行 SSH 命令失败',
  fetchLogError: '加载控制台失败',
  pollLogError: '轮询初始化日志失败',
  fetchConsoleLogError: '轮询 SSH 控制台状态失败',
} as const

function createIdleConsoleState(serverId: number): ServerConsoleState {
  return {
    server_id: serverId,
    connected: false,
    running: false,
    current_command: null,
    updated_at: null,
    logs: [],
  }
}

function formatLogEntry(entry: ServerInitializationLogEntry) {
  const message = entry.message.endsWith('\n') ? entry.message : `${entry.message}\n`

  switch (entry.level as InitLogLevel) {
    case 'system':
      return `[system] ${message}`
    case 'error':
      return `[error] ${message}`
    case 'stderr':
      return `[stderr] ${message}`
    default:
      return message
  }
}

export function InitializationConsole({
  open,
  onOpenChange,
  server,
  autoStartToken = 0,
  onTaskChange,
}: InitializationConsoleProps) {
  const [task, setTask] = useState<ServerInitializationTask | null>(null)
  const [consoleState, setConsoleState] = useState<ServerConsoleState | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [commandLoading, setCommandLoading] = useState(false)
  const [commandInput, setCommandInput] = useState('')
  const [lastAutoStartToken, setLastAutoStartToken] = useState(0)
  const [consoleStatus, setConsoleStatus] = useState<ConsoleStatus>('idle')

  const outputViewportRef = useRef<HTMLDivElement>(null)
  const previousTaskStatus = useRef<ServerInitializationTask['status'] | null>(null)

  const canUseCommandConsole = Boolean(server && server.status !== 'initializing')

  const mergedLogs = useMemo(() => {
    return [
      ...((task?.logs ?? []).map((entry) => ({ ...entry, source: 'task' as const }))),
      ...((consoleState?.logs ?? []).map((entry) => ({ ...entry, source: 'console' as const }))),
    ]
      .sort((left, right) => left.timestamp - right.timestamp)
      .filter((entry, index, list) => list.findIndex((item) => item.source === entry.source && item.id === entry.id) === index)
  }, [consoleState?.logs, task?.logs])

  const terminalOutput = useMemo(() => {
    return mergedLogs.map((entry) => formatLogEntry(entry)).join('')
  }, [mergedLogs])

  const statusHint = useMemo(() => {
    if (!canUseCommandConsole) {
      return TEXT.commandDisabled
    }

    switch (consoleStatus) {
      case 'loading':
        return '正在检查 SSH 状态...'
      case 'running':
        return consoleState?.current_command ? `执行中：${consoleState.current_command}` : 'SSH 命令执行中'
      case 'ready':
        return consoleState?.connected ? 'SSH 连通性正常，可继续执行命令' : 'SSH 面板已就绪，可开始执行命令'
      case 'error':
        return 'SSH 执行失败，请查看终端中的错误输出'
      default:
        return '等待执行 SSH 命令'
    }
  }, [canUseCommandConsole, consoleState?.connected, consoleState?.current_command, consoleStatus])

  const loadTask = useCallback(async () => {
    if (!server) {
      setTask(null)
      return
    }

    const response = await fetch(`/api/servers/${server.id}/initialize`, { cache: 'no-store' })
    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error || TEXT.fetchTaskFailed)
    }

    setTask(result.data.task)
  }, [server])

  const loadConsoleState = useCallback(async () => {
    if (!server) {
      setConsoleState(null)
      return
    }

    const response = await fetch(`/api/servers/${server.id}/console`, { cache: 'no-store' })
    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error || TEXT.fetchConsoleFailed)
    }

    setConsoleState(result.data)
  }, [server])

  const resetConsoleSession = useCallback(async () => {
    if (!server) {
      return
    }

    try {
      const response = await fetch(`/api/servers/${server.id}/console`, { method: 'DELETE' })
      const result = await response.json()
      if (result.success) {
        setConsoleState(result.data)
      }
    } catch (error) {
      console.error('failed to reset console session', error)
    }
  }, [server])

  const triggerTask = useCallback(async (mode: InitTaskMode) => {
    if (!server) {
      return
    }

    setActionLoading(true)
    try {
      const response = await fetch(`/api/servers/${server.id}/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || TEXT.startTaskFailed)
      }

      setTask(result.data.task)
      await onTaskChange?.()
    } finally {
      setActionLoading(false)
    }
  }, [onTaskChange, server])

  const sendInterruptToServer = useCallback(async () => {
    if (!server) {
      return
    }

    try {
      const response = await fetch(`/api/servers/${server.id}/console`, { method: 'PATCH' })
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || '中断 SSH 命令失败')
      }

      setConsoleState(result.data)
      setConsoleStatus('ready')
    } catch (error) {
      setConsoleStatus('error')
      console.error('interrupt failed', error)
    }
  }, [server])

  const executeCommand = useCallback(async () => {
    const command = commandInput.trim()
    if (!server || !command || commandLoading || !canUseCommandConsole) {
      return
    }

    setCommandLoading(true)
    setCommandInput('')
    setConsoleStatus('running')

    try {
      const response = await fetch(`/api/servers/${server.id}/console`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      })
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || TEXT.commandLogError)
      }

      setConsoleState(result.data)
    } catch (error) {
      setConsoleStatus('error')
      console.error(TEXT.commandLogError, error)
    } finally {
      setCommandLoading(false)
    }
  }, [canUseCommandConsole, commandInput, commandLoading, server])

  useEffect(() => {
    if (!open || !server) {
      return
    }

    let cancelled = false
    setLoading(true)
    setConsoleStatus('loading')

    const fetchAll = async () => {
      try {
        await resetConsoleSession()
        await Promise.all([loadTask(), loadConsoleState()])
      } catch (error) {
        if (!cancelled) {
          setConsoleStatus('error')
          console.error(TEXT.fetchLogError, error)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchAll()

    const taskInterval = window.setInterval(() => {
      void loadTask().catch((error) => console.error(TEXT.pollLogError, error))
    }, 1200)

    const consoleInterval = window.setInterval(() => {
      void loadConsoleState().catch((error) => console.error(TEXT.fetchConsoleLogError, error))
    }, 1200)

    return () => {
      cancelled = true
      window.clearInterval(taskInterval)
      window.clearInterval(consoleInterval)
    }
  }, [loadConsoleState, loadTask, open, resetConsoleSession, server])

  useEffect(() => {
    if (!open || !server) {
      return
    }

    if (autoStartToken > lastAutoStartToken) {
      setLastAutoStartToken(autoStartToken)
      void triggerTask('auto').catch((error) => {
        console.error(TEXT.startLogError, error)
      })
    }
  }, [autoStartToken, lastAutoStartToken, open, server, triggerTask])

  useEffect(() => {
    if (!task) {
      return
    }

    const previous = previousTaskStatus.current
    previousTaskStatus.current = task.status

    if (previous === 'running' && task.status !== 'running') {
      void onTaskChange?.()
    }
  }, [onTaskChange, task])

  useEffect(() => {
    if (!open) {
      setCommandInput('')
      setConsoleStatus('idle')
    }
  }, [open])

  useEffect(() => {
    setCommandInput('')
    setTask(null)
    setConsoleState(server ? createIdleConsoleState(server.id) : null)
  }, [server?.id])

  useEffect(() => {
    if (loading) {
      setConsoleStatus('loading')
      return
    }

    if (consoleState?.running) {
      setConsoleStatus('running')
      return
    }

    const lastConsoleLog = consoleState?.logs?.[consoleState.logs.length - 1]
    if (lastConsoleLog?.level === 'error') {
      setConsoleStatus('error')
      return
    }

    if (canUseCommandConsole) {
      setConsoleStatus('ready')
    } else {
      setConsoleStatus('idle')
    }
  }, [canUseCommandConsole, consoleState?.logs, consoleState?.running, loading])

  useEffect(() => {
    const viewport = outputViewportRef.current
    if (!viewport) {
      return
    }

    viewport.scrollTop = viewport.scrollHeight
  }, [terminalOutput])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0" showCloseButton>
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <TerminalSquare className="h-5 w-5" />
                {TEXT.title}
                {server ? ` - ${server.name}` : ''}
              </DialogTitle>
              <DialogDescription>{TEXT.description}</DialogDescription>
            </div>
            <Badge className={cn(task ? STATUS_STYLE[task.status] : STATUS_STYLE.idle)}>
              {task ? STATUS_LABEL[task.status] : STATUS_LABEL.idle}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3 text-sm">
            <div className="space-x-4 font-mono text-muted-foreground">
              <span>{TEXT.server}: {server?.hostname || server?.name || '-'}</span>
              <span>{TEXT.mode}: {task ? MODE_LABEL[task.mode] : MODE_LABEL.auto}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {task?.started_at ? `${TEXT.startedAt} ${new Date(task.started_at).toLocaleString()}` : TEXT.notStarted}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#020817] p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-400">
              <span>{TEXT.terminalTitle}</span>
              <span>{statusHint}</span>
            </div>
            <div
              ref={outputViewportRef}
              className="h-[420px] w-full overflow-auto rounded-lg bg-[#020817] p-4 font-mono text-sm leading-6 text-slate-200"
            >
              {terminalOutput ? (
                <pre className="whitespace-pre-wrap break-all">{terminalOutput}</pre>
              ) : (
                <div className="text-sm text-slate-400">{TEXT.loadingOutput}</div>
              )}
            </div>
          </div>

          {task?.status === 'error' && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <div>
                <div className="font-medium">{TEXT.failedTitle}</div>
                <div className="mt-1 text-destructive/90">{task.error || TEXT.unknownError}</div>
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-background px-4 py-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{TEXT.commandTitle}</div>
                <div className="text-xs text-muted-foreground">{TEXT.commandHint}</div>
              </div>
              {consoleState?.running && (
                <div className="text-xs text-muted-foreground">{consoleState.current_command}</div>
              )}
            </div>

            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault()
                void executeCommand()
              }}
            >
              <Input
                value={commandInput}
                onChange={(event) => setCommandInput(event.target.value)}
                placeholder={canUseCommandConsole ? TEXT.commandPlaceholder : TEXT.commandUnavailable}
                disabled={!canUseCommandConsole || commandLoading || Boolean(consoleState?.running)}
                className="font-mono"
                onKeyDown={async (event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
                    event.preventDefault()
                    await sendInterruptToServer()
                  }
                }}
              />
              <Button
                type="submit"
                disabled={!canUseCommandConsole || commandLoading || Boolean(consoleState?.running) || commandInput.trim().length === 0}
              >
                {commandLoading || consoleState?.running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {TEXT.commandButton}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!canUseCommandConsole || !consoleState?.running}
                onClick={async () => {
                  await sendInterruptToServer()
                }}
              >
                <span>{TEXT.interruptButton}</span>
              </Button>
            </form>

            {!canUseCommandConsole && (
              <p className="mt-2 text-xs text-muted-foreground">{TEXT.commandDisabled}</p>
            )}
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">{statusHint}</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  void loadTask()
                  void loadConsoleState()
                }}
                disabled={loading || actionLoading || !server}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {TEXT.refresh}
              </Button>
              {task?.status === 'error' && (
                <Button onClick={() => void triggerTask('manual')} disabled={actionLoading || !server}>
                  {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  {TEXT.manualInit}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
