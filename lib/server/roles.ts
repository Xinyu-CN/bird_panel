import type { Server, ServerType } from '@/types'

export type ServerRole = 'rr' | 'core' | 'edge'

type ServerIdentity = Pick<Server, 'type' | 'is_core'> | { type: ServerType; is_core?: boolean }

export function getServerRole(server: ServerIdentity): ServerRole {
  if (server.type === 'rr') {
    return 'rr'
  }

  return server.is_core ? 'core' : 'edge'
}

export function getServerRoleLabel(server: ServerIdentity): string {
  switch (getServerRole(server)) {
    case 'rr':
      return 'RR 节点'
    case 'core':
      return '核心节点'
    default:
      return '普通节点'
  }
}

export function getServerRoleShortLabel(server: ServerIdentity): string {
  switch (getServerRole(server)) {
    case 'rr':
      return 'RR'
    case 'core':
      return 'CORE'
    default:
      return 'NODE'
  }
}

export function getServerRoleDescription(server: ServerIdentity): string {
  switch (getServerRole(server)) {
    case 'rr':
      return '独立 RR 初始化流程'
    case 'core':
      return '节点初始化流程（带核心标记）'
    default:
      return '标准节点初始化流程'
  }
}
