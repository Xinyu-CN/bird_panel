import 'server-only'

import type { ConnectConfig } from 'ssh2'
import { db } from '@/lib/db'
import type { Server } from '@/types'
import { SSHConnection } from './ssh'

function normalizePrivateKey(privateKey: string) {
  return privateKey.endsWith('\n') ? privateKey : `${privateKey}\n`
}

export async function getServerSSHConfig(server: Server): Promise<ConnectConfig> {
  if (!server.ssh_key_id) {
    throw new Error('未配置 SSH 密钥')
  }

  const sshKey = await db.getSSHKey(server.ssh_key_id)
  if (!sshKey) {
    throw new Error('SSH 密钥不存在或已被删除')
  }

  return {
    host: server.ssh_host,
    port: server.ssh_port,
    username: server.ssh_user,
    privateKey: normalizePrivateKey(sshKey.private_key),
    readyTimeout: 10000,
    keepaliveInterval: 10000,
    keepaliveCountMax: 3,
  }
}

export async function createServerSSHConnection(server: Server) {
  return new SSHConnection(await getServerSSHConfig(server))
}
