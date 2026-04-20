import type { BGPSession, Server, SessionTransportMode, SessionType } from '@/types'

export interface SessionConfigPreviewInput {
  localServer: Server
  peerServer?: Server | null
  sessionType: SessionType
  transportMode: SessionTransportMode
  addressFamily: BGPSession['address_family']
  peerAsn: number
  peerName?: string | null
  localIpv4?: string | null
  localIpv6?: string | null
  peerIpv4?: string | null
  peerIpv6?: string | null
  multihop?: number
  password?: string | null
  importFilter?: string | null
  exportFilter?: string | null
  description?: string | null
}

function buildProtocolName(localServer: Server, peerName: string, transportMode: SessionTransportMode) {
  const safePeer = peerName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'peer'
  return `${transportMode}_${localServer.icao_code.toLowerCase()}_${safePeer}`.slice(0, 48)
}

export function recommendSessionType(params: {
  localServer: Server
  peerServer?: Server | null
  peerAsn?: number | null
  transportMode: SessionTransportMode
}): SessionType {
  const { localServer, peerServer, peerAsn, transportMode } = params

  if (transportMode === 'ix') {
    return peerAsn && peerAsn === localServer.local_asn ? 'ibgp' : 'peer'
  }

  if (peerServer) {
    if (localServer.type === 'rr' && peerServer.type !== 'rr') {
      return 'rr'
    }

    if (localServer.local_asn === peerServer.local_asn) {
      return 'ibgp'
    }
  }

  if (peerAsn && peerAsn === localServer.local_asn) {
    return 'ibgp'
  }

  return transportMode === 'tunnel' ? 'ibgp' : 'peer'
}

export function generateSessionConfigSnippet(input: SessionConfigPreviewInput) {
  const peerName = input.peerName || input.peerServer?.name || `AS${input.peerAsn}`
  const protocolName = buildProtocolName(input.localServer, peerName, input.transportMode)
  const lines = [
    `protocol bgp ${protocolName} {`,
    `  local as ${input.localServer.local_asn};`,
    `  neighbor ${input.addressFamily === 'ipv4' ? input.peerIpv4 || '0.0.0.0' : input.peerIpv6 || '::'} as ${input.peerAsn};`,
    `  description "${input.description || `${input.transportMode.toUpperCase()} ${peerName}`}";`,
  ]

  if (input.sessionType === 'rr') {
    lines.push('  rr client;')
  }

  if (input.multihop && input.multihop > 1) {
    lines.push(`  multihop ${input.multihop};`)
  }

  if (input.password) {
    lines.push(`  password "${input.password}";`)
  }

  if (input.addressFamily === 'dual' || input.addressFamily === 'ipv6') {
    lines.push('  ipv6 { import all; export all; };')
  }

  if (input.addressFamily === 'dual' || input.addressFamily === 'ipv4') {
    lines.push('  ipv4 { import all; export all; };')
  }

  if (input.localIpv4 || input.localIpv6) {
    lines.push(`  source address ${input.addressFamily === 'ipv4' ? input.localIpv4 || '0.0.0.0' : input.localIpv6 || '::'};`)
  }

  if (input.importFilter) {
    lines.push(`  import filter {`, `    ${input.importFilter}`, '  };')
  }

  if (input.exportFilter) {
    lines.push(`  export filter {`, `    ${input.exportFilter}`, '  };')
  }

  lines.push('}')
  return lines.join('\n')
}

export function buildRrSessionPairs(servers: Server[], existingSessions: BGPSession[]) {
  const rrServers = servers.filter((server) => server.type === 'rr')
  const nodeServers = servers.filter((server) => server.type !== 'rr')
  const existingKeys = new Set(
    existingSessions.map((session) => `${session.server_id}:${session.peer_server_id || 0}:${session.session_type}:${session.transport_mode}`),
  )

  const plans: Array<Omit<BGPSession, 'id' | 'status' | 'prefixes_received' | 'prefixes_sent' | 'last_state_change' | 'created_at' | 'updated_at'>> = []

  for (const rr of rrServers) {
    for (const node of nodeServers) {
      const rrSideKey = `${rr.id}:${node.id}:rr:internal`
      if (!existingKeys.has(rrSideKey)) {
        plans.push({
          server_id: rr.id,
          peer_server_id: node.id,
          server_ixp_membership_id: null,
          tunnel_id: null,
          ix_id: null,
          ix_name: null,
          session_type: 'rr',
          transport_mode: 'internal',
          address_family: 'ipv6',
          peer_asn: node.local_asn,
          peer_name: node.name,
          local_ipv4: null,
          local_ipv6: rr.ipv6_address,
          peer_ipv4: null,
          peer_ipv6: node.ipv6_address,
          multihop: 0,
          password: null,
          import_filter: null,
          export_filter: null,
          description: `RR client session to ${node.name}`,
          source: 'batch-rr',
        })
      }

      const nodeSideKey = `${node.id}:${rr.id}:ibgp:internal`
      if (!existingKeys.has(nodeSideKey)) {
        plans.push({
          server_id: node.id,
          peer_server_id: rr.id,
          server_ixp_membership_id: null,
          tunnel_id: null,
          ix_id: null,
          ix_name: null,
          session_type: 'ibgp',
          transport_mode: 'internal',
          address_family: 'ipv6',
          peer_asn: rr.local_asn,
          peer_name: rr.name,
          local_ipv4: null,
          local_ipv6: node.ipv6_address,
          peer_ipv4: null,
          peer_ipv6: rr.ipv6_address,
          multihop: 0,
          password: null,
          import_filter: null,
          export_filter: null,
          description: `iBGP session to RR ${rr.name}`,
          source: 'batch-rr',
        })
      }
    }
  }

  for (let index = 0; index < rrServers.length; index += 1) {
    for (let peerIndex = index + 1; peerIndex < rrServers.length; peerIndex += 1) {
      const left = rrServers[index]
      const right = rrServers[peerIndex]
      const leftKey = `${left.id}:${right.id}:ibgp:internal`
      const rightKey = `${right.id}:${left.id}:ibgp:internal`

      if (!existingKeys.has(leftKey)) {
        plans.push({
          server_id: left.id,
          peer_server_id: right.id,
          server_ixp_membership_id: null,
          tunnel_id: null,
          ix_id: null,
          ix_name: null,
          session_type: 'ibgp',
          transport_mode: 'internal',
          address_family: 'ipv6',
          peer_asn: right.local_asn,
          peer_name: right.name,
          local_ipv4: null,
          local_ipv6: left.ipv6_address,
          peer_ipv4: null,
          peer_ipv6: right.ipv6_address,
          multihop: 0,
          password: null,
          import_filter: null,
          export_filter: null,
          description: `RR mesh with ${right.name}`,
          source: 'batch-rr',
        })
      }

      if (!existingKeys.has(rightKey)) {
        plans.push({
          server_id: right.id,
          peer_server_id: left.id,
          server_ixp_membership_id: null,
          tunnel_id: null,
          ix_id: null,
          ix_name: null,
          session_type: 'ibgp',
          transport_mode: 'internal',
          address_family: 'ipv6',
          peer_asn: left.local_asn,
          peer_name: left.name,
          local_ipv4: null,
          local_ipv6: right.ipv6_address,
          peer_ipv4: null,
          peer_ipv6: left.ipv6_address,
          multihop: 0,
          password: null,
          import_filter: null,
          export_filter: null,
          description: `RR mesh with ${left.name}`,
          source: 'batch-rr',
        })
      }
    }
  }

  return plans
}
