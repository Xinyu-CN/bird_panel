import 'server-only'

import type { InitLogLevel, InitTaskMode, Server } from '@/types'
import { createServerSSHConnection } from './ssh-access'
import type { SSHConnection } from './ssh'

export interface ServerInitializationResult {
  message: string
  nextStatus?: Server['status']
}

export interface InitializeServerLogger {
  log: (level: InitLogLevel, message: string) => void
  system: (message: string) => void
  command: (message: string) => void
  stdout: (message: string) => void
  stderr: (message: string) => void
  error: (message: string) => void
}

export interface InitializeServerContext {
  mode: InitTaskMode
  logger: InitializeServerLogger
}

function createNoopLogger(): InitializeServerLogger {
  const noop = () => undefined
  return {
    log: noop,
    system: noop,
    command: noop,
    stdout: noop,
    stderr: noop,
    error: noop,
  }
}

function getModeLabel(mode: InitTaskMode) {
  return mode === 'manual' ? '手动' : '自动'
}

async function runLoggedCommand(ssh: SSHConnection, command: string, logger: InitializeServerLogger) {
  logger.command(`$ ${command}`)

  const result = await ssh.exec(command, {
    pty: true,
    onStdout: (chunk) => logger.stdout(chunk),
    onStderr: (chunk) => logger.stderr(chunk),
  })

  if (result.exitCode !== null && result.exitCode !== 0) {
    throw new Error(`命令执行失败，退出码 ${result.exitCode}：${command}`)
  }

  return result
}

async function runInitializationSequence(
  server: Server,
  commands: string[],
  successMessage: string,
  context: InitializeServerContext,
): Promise<ServerInitializationResult> {
  const { logger, mode } = context
  logger.system(`开始${getModeLabel(mode)}初始化：${server.name}`)
  logger.system(`正在连接 SSH：${server.ssh_user}@${server.ssh_host}:${server.ssh_port}`)

  const ssh = await createServerSSHConnection(server)

  try {
    logger.system('SSH 连接已建立')

    for (const command of commands) {
      await runLoggedCommand(ssh, command, logger)
    }

    return {
      message: successMessage,
      nextStatus: 'online',
    }
  } finally {
    ssh.close()
    logger.system('SSH 连接已关闭')
  }
}

export async function initializeRRServer(
  server: Server,
  context: InitializeServerContext = { mode: 'auto', logger: createNoopLogger() },
): Promise<ServerInitializationResult> {
  return await runInitializationSequence(
    server,
    [
      'echo "RR initialization step 1"',
      'echo "RR initialization step 2"',
    ],
    'RR 初始化完成',
    context,
  )
}

export async function initializeNodeServer(
  server: Server,
  context: InitializeServerContext = { mode: 'auto', logger: createNoopLogger() },
): Promise<ServerInitializationResult> {
  return await runInitializationSequence(
    server,
    [
      'echo "Node initialization step 1"',
      'echo "Node initialization step 2"',
    ],
    '节点初始化完成',
    context,
  )
}

export async function initializeServer(
  server: Server,
  context: InitializeServerContext = { mode: 'auto', logger: createNoopLogger() },
): Promise<ServerInitializationResult> {
  return server.type === 'rr'
    ? initializeRRServer(server, context)
    : initializeNodeServer(server, context)
}
