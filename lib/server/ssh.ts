import { Client, type ClientChannel, type ConnectConfig } from 'ssh2'

export interface SSHExecResult {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: string | null
}

export interface SSHExecOptions {
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
  pty?: boolean
}

export interface SSHSessionRunOptions {
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}

function normalizeSSHError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error)

  if (/All configured authentication methods failed/i.test(message)) {
    return new Error('SSH 连接失败：认证失败，请检查用户名或密钥')
  }

  if (/ECONNREFUSED|Connection refused/i.test(message)) {
    return new Error('SSH 连接失败：目标主机拒绝连接')
  }

  if (/ETIMEDOUT|Timed out/i.test(message)) {
    return new Error('SSH 连接失败：连接超时')
  }

  if (/ENOTFOUND|getaddrinfo/i.test(message)) {
    return new Error('SSH 连接失败：无法解析主机名')
  }

  if (/ECONNRESET|Connection reset/i.test(message)) {
    return new Error('SSH 连接失败：连接被重置')
  }

  if (/No response from server/i.test(message)) {
    return new Error('SSH 连接失败：服务器未响应')
  }

  return new Error(`${fallback}：${message}`)
}

export class SSHCommandHandle {
  readonly completion: Promise<SSHExecResult>

  private readonly resolveCompletion: (result: SSHExecResult) => void
  private readonly rejectCompletion: (error: Error) => void
  private stdout = ''
  private stderr = ''
  private exitCode: number | null = null
  private signal: string | null = null
  private finished = false
  private interrupted = false

  constructor(
    private readonly channel: ClientChannel,
    private readonly options: SSHExecOptions = {},
  ) {
    let resolveCompletion!: (result: SSHExecResult) => void
    let rejectCompletion!: (error: Error) => void

    this.completion = new Promise<SSHExecResult>((resolve, reject) => {
      resolveCompletion = resolve
      rejectCompletion = reject
    })

    this.resolveCompletion = resolveCompletion
    this.rejectCompletion = rejectCompletion

    channel.on('data', (data: Buffer) => {
      const chunk = data.toString()
      this.stdout += chunk
      this.options.onStdout?.(chunk)
    })

    channel.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString()
      this.stderr += chunk
      this.options.onStderr?.(chunk)
    })

    channel.on('exit', (code?: number | null, signal?: string) => {
      this.exitCode = typeof code === 'number' ? code : null
      this.signal = typeof signal === 'string' ? signal : null
    })

    channel.on('close', () => {
      if (this.finished) {
        return
      }

      if (this.interrupted) {
        this.finishWithError(new Error('命令已中断'))
        return
      }

      this.finishWithSuccess()
    })

    channel.on('error', (error: unknown) => {
      if (this.finished) {
        return
      }

      if (this.interrupted) {
        this.finishWithError(new Error('命令已中断'))
        return
      }

      this.finishWithError(normalizeSSHError(error, 'SSH 命令执行失败'))
    })
  }

  interrupt() {
    if (this.finished) {
      return
    }

    this.interrupted = true

    try {
      this.channel.signal('INT')
    } catch {}

    try {
      this.channel.close()
    } catch {}
  }

  close() {
    if (this.finished) {
      return
    }

    try {
      this.channel.close()
    } catch {}
  }

  private finishWithSuccess() {
    if (this.finished) {
      return
    }

    this.finished = true
    this.resolveCompletion({
      stdout: this.stdout,
      stderr: this.stderr,
      exitCode: this.exitCode,
      signal: this.signal,
    })
  }

  private finishWithError(error: Error) {
    if (this.finished) {
      return
    }

    this.finished = true
    this.rejectCompletion(error)
  }
}

interface PendingShellCommand {
  marker: string
  markerToken: string
  command: string
  stdout: string
  stderr: string
  stdoutTail: string
  displayTail: string
  commandEchoSkipped: boolean
  resolve: (result: SSHExecResult) => void
  reject: (error: Error) => void
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}

function createMarkerState(
  command: string,
  resolve: (result: SSHExecResult) => void,
  reject: (error: Error) => void,
  options: SSHSessionRunOptions = {},
): PendingShellCommand {
  const marker = `__BGP_PANEL_DONE_${Date.now()}_${Math.random().toString(36).slice(2)}__`
  return {
    marker,
    markerToken: `\n${marker}:`,
    command,
    stdout: '',
    stderr: '',
    stdoutTail: '',
    displayTail: '',
    commandEchoSkipped: false,
    resolve,
    reject,
    onStdout: options.onStdout,
    onStderr: options.onStderr,
  }
}

export class SSHInteractiveSession {
  private stream: ClientChannel | null = null
  private readonly ready: Promise<void>
  private queue: Promise<void> = Promise.resolve()
  private pending: PendingShellCommand | null = null
  private closed = false
  private interrupted = false

  constructor(private readonly client: Client, connReady: Promise<void>) {
    this.ready = this.initialize(connReady)
  }

  async waitUntilReady() {
    await this.ready
  }

  async run(command: string, options: SSHSessionRunOptions = {}): Promise<SSHExecResult> {
    const runCommand = async () => {
      if (this.closed) {
        throw new Error('SSH 会话已关闭')
      }

      await this.ready

      if (!this.stream) {
        throw new Error('SSH 通道未建立')
      }

      this.interrupted = false

      return await new Promise<SSHExecResult>((resolve, reject) => {
        this.pending = createMarkerState(command, resolve, reject, options)
        const markerCommand = `printf '\\n${this.pending.marker}:%s\\n' "$?"`
        this.stream?.write(`${command}\n${markerCommand}\n`)
      })
    }

    const resultPromise = this.queue.then(runCommand, runCommand)
    this.queue = resultPromise.then(() => undefined, () => undefined)
    return resultPromise
  }

  interrupt() {
    if (this.closed || !this.stream || !this.pending) {
      return
    }

    this.interrupted = true

    try {
      this.stream.write('\x03')
    } catch {}

    const pending = this.pending
    this.pending = null
    pending.reject(new Error('命令已中断'))
  }

  isClosed() {
    return this.closed
  }

  close() {
    if (this.closed) {
      return
    }

    this.closed = true

    if (this.stream && !this.stream.destroyed) {
      this.stream.end('exit\n')
    }
  }

  private async initialize(connReady: Promise<void>) {
    await connReady

    await new Promise<void>((resolve, reject) => {
      this.client.shell(
        {
          term: 'xterm-256color',
          cols: 120,
          rows: 32,
        },
        (error, stream) => {
          if (error) {
            reject(normalizeSSHError(error, 'SSH 会话建立失败'))
            return
          }

          this.stream = stream
          stream.on('data', (data: Buffer) => this.handleStdout(data.toString()))
          stream.stderr.on('data', (data: Buffer) => this.handleStderr(data.toString()))
          stream.on('close', () => this.handleClose())
          stream.on('error', (error: Error) => this.handleError(error))

          void this.bootstrapShell().then(resolve).catch((bootstrapError) => {
            reject(bootstrapError instanceof Error ? bootstrapError : new Error(String(bootstrapError)))
          })
        },
      )
    })
  }

  private async bootstrapShell() {
    await this.executeInternal(
      "export PS1=''; export PROMPT_COMMAND=''; stty -echo 2>/dev/null; bind 'set enable-bracketed-paste off' 2>/dev/null || true",
    )
  }

  private async executeInternal(command: string): Promise<SSHExecResult> {
    if (!this.stream) {
      throw new Error('SSH 通道未建立')
    }

    return await new Promise<SSHExecResult>((resolve, reject) => {
      this.pending = createMarkerState(command, resolve, reject)
      const markerCommand = `printf '\\n${this.pending.marker}:%s\\n' "$?"`
      this.stream?.write(`${command}\n${markerCommand}\n`)
    })
  }

  private emitStdout(chunk: string) {
    if (!this.pending || !chunk) {
      return
    }

    const visibleChunk = this.consumeVisibleStdout(this.pending, chunk)
    if (!visibleChunk) {
      return
    }

    this.pending.stdout += visibleChunk
    this.pending.onStdout?.(visibleChunk)
  }

  private handleStdout(chunk: string) {
    if (!this.pending) {
      return
    }

    this.pending.stdoutTail += chunk
    const { markerToken } = this.pending

    while (this.pending) {
      const markerIndex = this.pending.stdoutTail.indexOf(markerToken)

      if (markerIndex === -1) {
        const safeLength = Math.max(0, this.pending.stdoutTail.length - markerToken.length - 16)
        if (safeLength <= 0) {
          return
        }

        const safeChunk = this.pending.stdoutTail.slice(0, safeLength)
        this.pending.stdoutTail = this.pending.stdoutTail.slice(safeLength)
        this.emitStdout(safeChunk)
        return
      }

      const beforeMarker = this.pending.stdoutTail.slice(0, markerIndex)
      if (beforeMarker) {
        this.emitStdout(beforeMarker)
      }

      const afterMarker = this.pending.stdoutTail.slice(markerIndex + markerToken.length)
      const exitLineMatch = afterMarker.match(/^([0-9]+)\r?\n/)
      if (!exitLineMatch) {
        this.pending.stdoutTail = `${markerToken}${afterMarker}`
        return
      }

      const exitCode = Number.parseInt(exitLineMatch[1], 10)
      const pending = this.pending
      this.pending = null
      const trailingVisible = this.consumeVisibleStdout(pending, '', true)
      if (trailingVisible) {
        pending.stdout += trailingVisible
        pending.onStdout?.(trailingVisible)
      }
      pending.resolve({
        stdout: pending.stdout,
        stderr: pending.stderr,
        exitCode: Number.isNaN(exitCode) ? null : exitCode,
        signal: null,
      })
      return
    }
  }

  private handleStderr(chunk: string) {
    if (!this.pending) {
      return
    }

    this.pending.stderr += chunk
    this.pending.onStderr?.(chunk)
  }

  private handleError(error: unknown) {
    this.closed = true

    if (!this.pending) {
      return
    }

    const pending = this.pending
    this.pending = null
    pending.reject(this.interrupted ? new Error('命令已中断') : normalizeSSHError(error, 'SSH 会话错误'))
  }

  private handleClose() {
    this.closed = true

    if (!this.pending) {
      return
    }

    const pending = this.pending
    this.pending = null
    pending.reject(this.interrupted ? new Error('命令已中断') : new Error('SSH 会话已关闭'))
  }

  private consumeVisibleStdout(pending: PendingShellCommand, chunk: string, flush = false) {
    pending.displayTail += chunk.replace(/\r/g, '')
    const lines = pending.displayTail.split('\n')
    const trailingLine = lines.pop() ?? ''
    pending.displayTail = flush ? '' : trailingLine

    const visibleLines = lines
      .map((line) => this.sanitizeDisplayLine(pending, line))
      .filter((line) => line.length > 0)

    if (flush) {
      const tailLine = this.sanitizeDisplayLine(pending, trailingLine)
      if (tailLine) {
        visibleLines.push(tailLine)
      }
    }

    return visibleLines.length > 0 ? `${visibleLines.join('\n')}\n` : ''
  }

  private sanitizeDisplayLine(pending: PendingShellCommand, line: string) {
    const cleaned = line.replace(/\x1b\[\?2004[hl]/g, '').trimEnd()

    if (!cleaned) {
      return ''
    }

    if (!pending.commandEchoSkipped && cleaned.trim() === pending.command.trim()) {
      pending.commandEchoSkipped = true
      return ''
    }

    if (cleaned.includes(pending.marker) || cleaned.includes("printf '\\n__BGP_PANEL_DONE_")) {
      return ''
    }

    if (/^[^@\s]+@[^#\s:]+:[^#$]*[#$]\s*$/.test(cleaned)) {
      return ''
    }

    return cleaned
  }
}

export class SSHConnection {
  private readonly client: Client
  private readonly ready: Promise<void>
  private closed = false

  constructor(config: ConnectConfig) {
    this.client = new Client()
    this.ready = new Promise((resolve, reject) => {
      this.client
        .on('ready', () => resolve())
        .on('error', (error) => reject(normalizeSSHError(error, 'SSH 连接失败')))
        .on('close', () => {
          this.closed = true
        })
        .connect(config)
    })
  }

  async startCommand(command: string, options: SSHExecOptions = {}): Promise<SSHCommandHandle> {
    await this.ready

    return await new Promise<SSHCommandHandle>((resolve, reject) => {
      const onExec = (error: Error | undefined, channel: ClientChannel) => {
        if (error) {
          reject(normalizeSSHError(error, 'SSH 命令启动失败'))
          return
        }

        resolve(new SSHCommandHandle(channel, options))
      }

      if (options.pty) {
        this.client.exec(
          command,
          {
            pty: {
              term: 'xterm-256color',
              cols: 120,
              rows: 32,
            },
          },
          onExec,
        )
        return
      }

      this.client.exec(command, onExec)
    })
  }

  async exec(command: string, options: SSHExecOptions = {}): Promise<SSHExecResult> {
    const handle = await this.startCommand(command, options)
    return await handle.completion
  }

  async createInteractiveSession(): Promise<SSHInteractiveSession> {
    const session = new SSHInteractiveSession(this.client, this.ready)
    await session.waitUntilReady()
    return session
  }

  isClosed() {
    return this.closed
  }

  close() {
    if (this.closed) {
      return
    }

    this.closed = true
    this.client.end()
  }
}

export async function sshExec(config: ConnectConfig, command: string, options?: SSHExecOptions) {
  const ssh = new SSHConnection(config)
  try {
    return await ssh.exec(command, options)
  } finally {
    ssh.close()
  }
}
