import type { Server } from '@/types'
import { getServerRole } from '@/lib/server/roles'

/**
 * IPv6 address allocation utilities for the network fabric
 */

/**
 * Parse IPv6 prefix into components
 */
export function parseIPv6Prefix(prefix: string): {
  base: string
  length: number
} {
  const [base, lengthStr] = prefix.split('/')
  return {
    base: base.replace(/::$/, ''),
    length: Number.parseInt(lengthStr, 10) || 48,
  }
}

/**
 * 从骨干 /44 和 regionIndex 生成该地区 /48 前缀
 * backbone44: 形如 2002:xxxx:xxx0::/44
 * regionIndex: 0~15
 * 返回 2002:xxxx:xxxb::/48
 */
export function getRegionIPv6Prefix(backbone44: string, regionIndex: number): string {
  const [base, prefixLen] = backbone44.split('/')
  if (Number(prefixLen) !== 44) throw new Error('backbone44 必须为 /44 前缀')
  // 取前 3 段 16 进制，最后一段低 4 位为 regionIndex
  const parts = base.replace('::', '').split(':')
  while (parts.length < 4) parts.push('0')
  // 取第 3 段，低 4 位替换为 regionIndex
  let third = parseInt(parts[2] || '0', 16)
  third = (third & 0xfff0) | (regionIndex & 0xf)
  parts[2] = third.toString(16)
  // /48 前缀
  return `${parts[0]}:${parts[1]}:${parts[2]}:0::/48`
}

/**
 * Generate IPv6 address for a server based on region /48 prefix and node ID
 * regionPrefix: 形如 2001:db8:xxxx::/48
 * 返回格式: {regionPrefix}:{node_id}::1
 */
export function allocateServerIPv6(
  backbone44: string,
  regionIndex: number,
  nodeId: number,
): string {
  const regionPrefix = getRegionIPv6Prefix(backbone44, regionIndex)
  const { base } = parseIPv6Prefix(regionPrefix)
  const nodeHex = nodeId.toString(16).padStart(2, '0')
  return `${base}:${nodeHex}::1`
}

/**
 * Generate tunnel link-local IPv6 addresses
 * Uses fe80::{server_a_id}:{server_b_id}::{1|2} format for simplicity
 */
export function allocateTunnelIPv6(
  serverAId: number,
  serverBId: number,
): { ipv6_a: string; ipv6_b: string } {
  const aHex = serverAId.toString(16).padStart(4, '0')
  const bHex = serverBId.toString(16).padStart(4, '0')

  return {
    ipv6_a: `fe80::${aHex}:${bHex}:0:1`,
    ipv6_b: `fe80::${aHex}:${bHex}:0:2`,
  }
}

/**
 * Generate tunnel /127 IPv6 addresses from backbone prefix
 */
export function allocateTunnelIPv6FromPrefix(
  backbonePrefix: string,
  tunnelId: number,
): { ipv6_a: string; ipv6_b: string } {
  const { base } = parseIPv6Prefix(backbonePrefix)
  const tunnelHex = tunnelId.toString(16).padStart(4, '0')

  return {
    ipv6_a: `${base}:ffff:${tunnelHex}::0`,
    ipv6_b: `${base}:ffff:${tunnelHex}::1`,
  }
}

/**
 * Generate router ID from IPv4 or create a unique one
 */
export function generateRouterId(server: Server): string {
  if (server.ipv4_address) {
    return server.ipv4_address
  }

  const region = Number.parseInt(server.region_code, 10) || 0
  const country = Number.parseInt(server.country_code, 10) || 0
  const node = server.node_id
  const id = server.id || 0

  return `${region}.${country}.${node}.${id}`
}

/**
 * Validate IPv6 address format
 */
export function isValidIPv6(address: string): boolean {
  const ipv6Pattern = /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,3}:){1,4}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,2}:){1,5}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(?:ffff(?::0{1,4})?:)?(?:(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])|(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9]))$/
  return ipv6Pattern.test(address)
}

/**
 * Validate IPv4 address format
 */
export function isValidIPv4(address: string): boolean {
  const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
  return ipv4Pattern.test(address)
}

/**
 * Calculate next available node ID for a region
 */
export async function getNextNodeId(
  existingServers: Server[],
  regionCode: string,
): Promise<number> {
  const regionServers = existingServers.filter((server) => server.region_code === regionCode)
  if (regionServers.length === 0) {
    return 1
  }

  const maxNodeId = Math.max(...regionServers.map((server) => server.node_id))
  return maxNodeId + 1
}

/**
 * Generate hostname for server
 * Format: {icao}-{id}.{role}.{zone}
 */
export function generateHostname(
  icaoCode: string,
  nodeId: number,
  serverType: Server['type'],
  dnsZone: string,
  isCore = false,
): string {
  const typeSubdomain = getServerRole({ type: serverType, is_core: isCore })
  return `${icaoCode.toLowerCase()}-${nodeId.toString().padStart(2, '0')}.${typeSubdomain}.${dnsZone}`
}
