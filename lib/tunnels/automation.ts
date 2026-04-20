import 'server-only'

import { generateKeyPairSync } from 'node:crypto'
import { db } from '@/lib/db'
import type { Server, Tunnel, TunnelWithServers } from '@/types'
import { createServerSSHConnection } from '@/lib/server/ssh-access'
import { recommendOspfCost } from './shared'

const GENERATED_BIRD_DIR = '/etc/bird/generated'
const GENERATED_WIREGUARD_DIR = '/etc/wireguard'

type TunnelSide = 'a' | 'b'

interface WireGuardKeyPair {
  privateKey: string
  publicKey: string
}

export interface TunnelAutomationPreview {
  supported: boolean
  deployable: boolean
  interfaceName: string
  recommendedOspfCost: number
  localFiles: {
    side: TunnelSide
    serverId: number
    serverName: string
    wireguardConfig: string | null
    birdConfig: string | null
    deployScript: string | null
  }[]
}

function base64UrlToBase64(value: string) {
  return value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
}

export function generateWireGuardKeyPair(): WireGuardKeyPair {
  const pair = generateKeyPairSync('x25519')
  const privateKey = pair.privateKey.export({ format: 'jwk' }) as { d: string }
  const publicKey = pair.publicKey.export({ format: 'jwk' }) as { x: string }

  return {
    privateKey: base64UrlToBase64(privateKey.d),
    publicKey: base64UrlToBase64(publicKey.x),
  }
}

export function buildTunnelInterfaceName(tunnel: Tunnel, serverA: Server, serverB: Server) {
  const left = serverA.icao_code.toLowerCase()
  const right = serverB.icao_code.toLowerCase()
  return `bgp${tunnel.id}_${left}_${right}`.slice(0, 15)
}

function buildWireGuardConfig(tunnel: Tunnel, serverA: Server, serverB: Server, side: TunnelSide, privateKey: string) {
  const isA = side === 'a'
  const localServer = isA ? serverA : serverB
  const remoteServer = isA ? serverB : serverA
  const localIPv4 = isA ? tunnel.tunnel_ipv4_a : tunnel.tunnel_ipv4_b
  const localIPv6 = isA ? tunnel.tunnel_ipv6_a : tunnel.tunnel_ipv6_b
  const remoteIPv4 = isA ? tunnel.tunnel_ipv4_b : tunnel.tunnel_ipv4_a
  const remoteIPv6 = isA ? tunnel.tunnel_ipv6_b : tunnel.tunnel_ipv6_a
  const remotePublicKey = isA ? tunnel.wg_public_key_b : tunnel.wg_public_key_a

  const addressLines = [
    localIPv4 ? `Address = ${localIPv4}/31` : null,
    localIPv6 ? `Address = ${localIPv6}/127` : null,
  ].filter(Boolean) as string[]

  const allowedIps = [
    remoteIPv4 ? `${remoteIPv4}/32` : null,
    remoteIPv6 ? `${remoteIPv6}/128` : null,
  ].filter(Boolean).join(', ')

  return [
    '[Interface]',
    `# ${localServer.name} <-> ${remoteServer.name}`,
    `PrivateKey = ${privateKey}`,
    `ListenPort = ${tunnel.wg_port}`,
    ...addressLines,
    '',
    '[Peer]',
    `PublicKey = ${remotePublicKey}`,
    `Endpoint = ${remoteServer.ssh_host}:${tunnel.wg_port}`,
    `AllowedIPs = ${allowedIps || '::/0'}`,
    'PersistentKeepalive = 25',
  ].join('\n')
}

function buildBirdOspfSnippet(tunnel: Tunnel, serverA: Server, serverB: Server) {
  if (!tunnel.ospf_enabled) {
    return null
  }

  const interfaceName = buildTunnelInterfaceName(tunnel, serverA, serverB)
  const cost = tunnel.ospf_cost || recommendOspfCost(tunnel.bandwidth_mbps)
  const lines = [
    `protocol ospf v3 bgp_panel_tunnel_${tunnel.id}_v6 {`,
    '  ipv6 { import all; export all; };',
    '  area 0 {',
    `    interface "${interfaceName}" {`,
    `      type ${tunnel.ospf_type || 'ptp'};`,
    `      cost ${cost};`,
    '      hello 5;',
    '      dead count 4;',
    tunnel.ospf_password ? '      authentication cryptographic;' : null,
    tunnel.ospf_password ? `      password "${tunnel.ospf_password}";` : null,
    '    };',
    '  };',
    '}',
  ].filter(Boolean) as string[]

  if (tunnel.ospf_mode === 'dual' || tunnel.ospf_mode === 'v4') {
    lines.push(
      '',
      `protocol ospf v2 bgp_panel_tunnel_${tunnel.id}_v4 {`,
      '  ipv4 { import all; export all; };',
      '  area 0 {',
      `    interface "${interfaceName}" {`,
      `      type ${tunnel.ospf_type || 'ptp'};`,
      `      cost ${cost};`,
      '      hello 5;',
      '      dead count 4;',
      ...(tunnel.ospf_password ? ['      authentication cryptographic;', `      password "${tunnel.ospf_password}";`] : []),
      '    };',
      '  };',
      '}',
    )
  }

  return lines.join('\n')
}

function buildWireGuardDeployScript(tunnel: Tunnel, serverA: Server, serverB: Server) {
  const interfaceName = buildTunnelInterfaceName(tunnel, serverA, serverB)
  const ospfCost = tunnel.ospf_cost || recommendOspfCost(tunnel.bandwidth_mbps)

  return [
    '#!/bin/sh',
    'set -eu',
    `IFACE="${interfaceName}"`,
    `WG_CONF="${GENERATED_WIREGUARD_DIR}/${interfaceName}.conf"`,
    '',
    'ip link del "$IFACE" 2>/dev/null || true',
    'ip link add dev "$IFACE" type wireguard',
    'wg setconf "$IFACE" "$WG_CONF"',
    'ip link set mtu 1420 dev "$IFACE"',
    'ip link set up dev "$IFACE"',
    '',
    `echo "Applied tunnel ${tunnel.id} with OSPF cost ${ospfCost}"`,
  ].join('\n')
}

async function buildPreviewWithSecrets(
  tunnel: Tunnel,
  serverA: Server,
  serverB: Server,
  secrets: { wg_private_key_a: string | null; wg_private_key_b: string | null } | null,
): Promise<TunnelAutomationPreview> {
  const supported = tunnel.tunnel_type === 'wireguard'
  const deployable = supported && Boolean(serverA.ssh_key_id && serverB.ssh_key_id && secrets?.wg_private_key_a && secrets?.wg_private_key_b)
  const interfaceName = buildTunnelInterfaceName(tunnel, serverA, serverB)
  const birdConfig = buildBirdOspfSnippet(tunnel, serverA, serverB)

  return {
    supported,
    deployable,
    interfaceName,
    recommendedOspfCost: recommendOspfCost(tunnel.bandwidth_mbps),
    localFiles: [
      {
        side: 'a',
        serverId: serverA.id,
        serverName: serverA.name,
        wireguardConfig: supported && secrets?.wg_private_key_a ? buildWireGuardConfig(tunnel, serverA, serverB, 'a', secrets.wg_private_key_a) : null,
        birdConfig,
        deployScript: supported ? buildWireGuardDeployScript(tunnel, serverA, serverB) : null,
      },
      {
        side: 'b',
        serverId: serverB.id,
        serverName: serverB.name,
        wireguardConfig: supported && secrets?.wg_private_key_b ? buildWireGuardConfig(tunnel, serverA, serverB, 'b', secrets.wg_private_key_b) : null,
        birdConfig,
        deployScript: supported ? buildWireGuardDeployScript(tunnel, serverA, serverB) : null,
      },
    ],
  }
}

export async function ensureTunnelWireGuardKeys(tunnelId: number) {
  const tunnel = await db.getTunnel(tunnelId)
  if (!tunnel || tunnel.tunnel_type !== 'wireguard') {
    return null
  }

  const existingSecrets = await db.getTunnelWireGuardSecrets(tunnelId)
  if (tunnel.wg_public_key_a && tunnel.wg_public_key_b && existingSecrets?.wg_private_key_a && existingSecrets?.wg_private_key_b) {
    return {
      publicKeyA: tunnel.wg_public_key_a,
      publicKeyB: tunnel.wg_public_key_b,
      privateKeyA: existingSecrets.wg_private_key_a,
      privateKeyB: existingSecrets.wg_private_key_b,
    }
  }

  const keyPairA = generateWireGuardKeyPair()
  const keyPairB = generateWireGuardKeyPair()

  await db.updateTunnel(tunnelId, {
    wg_public_key_a: keyPairA.publicKey,
    wg_public_key_b: keyPairB.publicKey,
    ospf_cost: tunnel.ospf_cost || recommendOspfCost(tunnel.bandwidth_mbps),
  })
  await db.setTunnelWireGuardSecrets(tunnelId, {
    wg_private_key_a: keyPairA.privateKey,
    wg_private_key_b: keyPairB.privateKey,
  })

  return {
    publicKeyA: keyPairA.publicKey,
    publicKeyB: keyPairB.publicKey,
    privateKeyA: keyPairA.privateKey,
    privateKeyB: keyPairB.privateKey,
  }
}

export async function getTunnelAutomationPreview(tunnelId: number): Promise<TunnelAutomationPreview> {
  const tunnel = await db.getTunnel(tunnelId)
  if (!tunnel) {
    throw new Error('Tunnel not found')
  }

  const serverA = await db.getServer(tunnel.server_a_id)
  const serverB = await db.getServer(tunnel.server_b_id)
  if (!serverA || !serverB) {
    throw new Error('Tunnel endpoints are missing')
  }

  if (tunnel.tunnel_type === 'wireguard') {
    await ensureTunnelWireGuardKeys(tunnel.id)
  }

  return buildPreviewWithSecrets(tunnel, serverA, serverB, await db.getTunnelWireGuardSecrets(tunnel.id))
}

function buildWriteFileCommand(remotePath: string, content: string, mode: string) {
  return [
    `cat <<'__BGP_PANEL_EOF__' > ${remotePath}`,
    content,
    '__BGP_PANEL_EOF__',
    `chmod ${mode} ${remotePath}`,
  ].join('\n')
}

async function deployWireGuardSide(tunnel: Tunnel, serverA: Server, serverB: Server, side: TunnelSide, privateKey: string) {
  const localServer = side === 'a' ? serverA : serverB
  const ssh = await createServerSSHConnection(localServer)
  const interfaceName = buildTunnelInterfaceName(tunnel, serverA, serverB)
  const wireguardPath = `${GENERATED_WIREGUARD_DIR}/${interfaceName}.conf`
  const birdPath = `${GENERATED_BIRD_DIR}/bgp-panel-tunnel-${tunnel.id}.conf`
  const wgConfig = buildWireGuardConfig(tunnel, serverA, serverB, side, privateKey)
  const birdConfig = buildBirdOspfSnippet(tunnel, serverA, serverB)
  const deployScript = buildWireGuardDeployScript(tunnel, serverA, serverB)
  const remoteScriptPath = `/tmp/bgp-panel-tunnel-${tunnel.id}-${side}.sh`

  try {
    await ssh.exec(`mkdir -p ${GENERATED_WIREGUARD_DIR} ${GENERATED_BIRD_DIR}`)
    await ssh.exec(buildWriteFileCommand(wireguardPath, wgConfig, '600'))

    if (birdConfig) {
      await ssh.exec(buildWriteFileCommand(birdPath, birdConfig, '644'))
      await ssh.exec(`grep -q 'include "${GENERATED_BIRD_DIR}/*.conf";' /etc/bird/bird.conf || printf '\ninclude "${GENERATED_BIRD_DIR}/*.conf";\n' >> /etc/bird/bird.conf`)
    }

    await ssh.exec(buildWriteFileCommand(remoteScriptPath, deployScript, '700'))
    await ssh.exec(remoteScriptPath)
    if (birdConfig) {
      await ssh.exec('command -v birdc >/dev/null 2>&1 && birdc configure || true')
    }
  } finally {
    ssh.close()
  }
}

export async function deployTunnelAutomation(tunnelId: number) {
  const tunnel = await db.getTunnel(tunnelId)
  if (!tunnel) {
    throw new Error('Tunnel not found')
  }

  if (tunnel.tunnel_type !== 'wireguard') {
    throw new Error('当前仅支持对 WireGuard 隧道执行自动下发')
  }

  const serverA = await db.getServer(tunnel.server_a_id)
  const serverB = await db.getServer(tunnel.server_b_id)
  if (!serverA || !serverB) {
    throw new Error('Tunnel endpoints are missing')
  }

  const keys = await ensureTunnelWireGuardKeys(tunnel.id)
  if (!keys) {
    throw new Error('无法生成 WireGuard 密钥')
  }

  await db.updateTunnel(tunnel.id, {
    ospf_cost: tunnel.ospf_cost || recommendOspfCost(tunnel.bandwidth_mbps),
    status: 'configuring',
  })

  try {
    await deployWireGuardSide(tunnel, serverA, serverB, 'a', keys.privateKeyA)
    await deployWireGuardSide(tunnel, serverA, serverB, 'b', keys.privateKeyB)
    await db.updateTunnel(tunnel.id, {
      status: 'up',
      last_check_at: Math.floor(Date.now() / 1000),
    })
  } catch (error) {
    await db.updateTunnel(tunnel.id, {
      status: 'error',
      last_check_at: Math.floor(Date.now() / 1000),
    })
    throw error
  }

  return getTunnelAutomationPreview(tunnel.id)
}

export async function hydrateTunnelAutomation(tunnel: TunnelWithServers) {
  return buildPreviewWithSecrets(tunnel, tunnel.server_a, tunnel.server_b, await db.getTunnelWireGuardSecrets(tunnel.id))
}
