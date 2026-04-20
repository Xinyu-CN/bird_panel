import 'server-only'

import { db } from '@/lib/db'
import { generateHostname } from '@/lib/network/ip-allocator'
import type { Server } from '@/types'
import { createServerSSHConnection } from './ssh-access'

export interface ParsedBirdVarsConf {
  localAsn: number | null
  localIPv4: string | null
  localIPv6: string | null
  backboneV6Prefix: string | null
  regionCode: string | null
  countryCode: string | null
  nodeId: number | null
  routerId: string | null
  raw: string
}

function extractDefine(content: string, key: string) {
  const pattern = new RegExp(`define\\s+${key}\\s*=\\s*(.+?);`, 'i')
  const match = content.match(pattern)
  return match?.[1]?.trim() || null
}

function extractRouterId(content: string) {
  const match = content.match(/router id\s+(.+?);/i)
  return match?.[1]?.trim() || null
}

export function parseBirdVarsConf(content: string): ParsedBirdVarsConf {
  const localAsn = extractDefine(content, 'LOCAL_ASN')
  const nodeId = extractDefine(content, 'MY_NODE')

  return {
    localAsn: localAsn ? Number.parseInt(localAsn, 10) : null,
    localIPv4: extractDefine(content, 'LOCAL_V4_kernel'),
    localIPv6: extractDefine(content, 'LOCAL_V6_kernel'),
    backboneV6Prefix: extractDefine(content, 'BB_V6_Prefix'),
    regionCode: extractDefine(content, 'MY_REGION'),
    countryCode: extractDefine(content, 'MY_COUNTRY'),
    nodeId: nodeId ? Number.parseInt(nodeId, 10) : null,
    routerId: extractRouterId(content),
    raw: content,
  }
}

export async function readRemoteBirdVarsConf(server: Server) {
  const ssh = await createServerSSHConnection(server)

  try {
    const result = await ssh.exec('cat /etc/bird/vars.conf', {})
    if (result.exitCode !== 0) {
      throw new Error(result.stderr?.trim() || '无法读取 /etc/bird/vars.conf')
    }

    const raw = result.stdout?.trim()
    if (!raw) {
      throw new Error('/etc/bird/vars.conf 为空')
    }

    return parseBirdVarsConf(raw)
  } finally {
    ssh.close()
  }
}

export async function importServerVarsFromRemote(server: Server) {
  const parsed = await readRemoteBirdVarsConf(server)

  const updates: Partial<Server> = {
    local_asn: parsed.localAsn ?? server.local_asn,
    ipv4_address: parsed.localIPv4,
    ipv6_address: parsed.localIPv6 || server.ipv6_address,
    ipv6_prefix: parsed.backboneV6Prefix || server.ipv6_prefix,
    region_code: parsed.regionCode || server.region_code,
    country_code: parsed.countryCode || server.country_code,
    node_id: parsed.nodeId ?? server.node_id,
    router_id: parsed.routerId || server.router_id,
    is_initialized: true,
    status: 'online',
  }

  const dnsZone = await db.getSetting('dns_zone')
  if (dnsZone) {
    updates.hostname = generateHostname(
      server.icao_code,
      updates.node_id || server.node_id,
      server.type,
      dnsZone,
      server.type === 'rr' ? false : server.is_core,
    )
  }

  await db.updateServer(server.id, updates)
  return {
    parsed,
    server: await db.getServer(server.id),
  }
}
