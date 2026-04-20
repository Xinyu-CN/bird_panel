import 'server-only'

import type { PeeringDBIXP, PeeringDBIXPPeer } from '@/types'

const PEERINGDB_API_BASE = 'https://www.peeringdb.com/api'

interface PeeringDBResponse<T> {
  data: T[]
}

interface RawPeeringDBIXP {
  id: number
  name: string
  name_long?: string | null
  country?: string | null
  city?: string | null
  region_continent?: string | null
  proto_unicast?: boolean
  proto_ipv6?: boolean
  website?: string | null
}

interface RawPeeringDBNetIXLan {
  id: number
  net_id?: number | null
  ix_id: number
  asn: number
  name?: string | null
  ipaddr4?: string | null
  ipaddr6?: string | null
  speed?: number | null
  is_rs_peer?: boolean
  operational?: boolean
}

interface RawPeeringDBNetwork {
  id: number
  asn: number
  name?: string | null
  aka?: string | null
  name_long?: string | null
}

async function peeringDbFetch<T>(path: string) {
  const response = await fetch(`${PEERINGDB_API_BASE}${path}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'bgp-panel/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`PeeringDB request failed with status ${response.status}`)
  }

  return response.json() as Promise<PeeringDBResponse<T>>
}

function mapIXP(item: RawPeeringDBIXP): PeeringDBIXP {
  return {
    id: item.id,
    name: item.name,
    name_long: item.name_long || null,
    country: item.country || null,
    city: item.city || null,
    region_continent: item.region_continent || null,
    proto_unicast: item.proto_unicast,
    proto_ipv6: item.proto_ipv6,
    website: item.website || null,
  }
}

function buildNetworkName(network: RawPeeringDBNetwork | undefined, fallback: string) {
  if (!network) {
    return fallback
  }

  return network.name || network.aka || network.name_long || fallback
}

export async function searchPeeringDBIXPs(query: string, limit = 20): Promise<PeeringDBIXP[]> {
  const keyword = query.trim()
  if (keyword.length < 2) {
    return []
  }

  const params = new URLSearchParams({
    name__contains: keyword,
    limit: String(Math.min(Math.max(limit, 1), 50)),
    fields: 'id,name,name_long,country,city,region_continent,proto_unicast,proto_ipv6,website',
  })

  const response = await peeringDbFetch<RawPeeringDBIXP>(`/ix?${params.toString()}`)
  return response.data.map(mapIXP)
}

export async function listPeeringDBIXPMembers(
  ixId: number,
  options?: {
    limit?: number
    query?: string
  },
): Promise<PeeringDBIXPPeer[]> {
  const params = new URLSearchParams({
    ix_id: String(ixId),
    limit: String(Math.min(Math.max(options?.limit || 200, 1), 500)),
    fields: 'id,net_id,ix_id,asn,name,ipaddr4,ipaddr6,speed,is_rs_peer,operational',
  })

  const response = await peeringDbFetch<RawPeeringDBNetIXLan>(`/netixlan?${params.toString()}`)
  const networkIds = [...new Set(response.data.map((item) => item.net_id).filter((value): value is number => Number.isInteger(value)))]

  const networks = new Map<number, RawPeeringDBNetwork>()
  const chunkSize = 50
  for (let index = 0; index < networkIds.length; index += chunkSize) {
    const chunk = networkIds.slice(index, index + chunkSize)
    const networkResponse = await peeringDbFetch<RawPeeringDBNetwork>(
      `/net?id__in=${chunk.join(',')}&fields=id,asn,name,aka,name_long`,
    )

    for (const network of networkResponse.data) {
      networks.set(network.id, network)
    }
  }

  const keyword = options?.query?.trim().toLowerCase()

  return response.data
    .map((item) => {
      const network = item.net_id ? networks.get(item.net_id) : undefined
      const peerName = buildNetworkName(network, item.name || `AS${item.asn}`)

      return {
        id: item.id,
        net_id: item.net_id || null,
        ix_id: item.ix_id,
        asn: item.asn,
        name: item.name || '',
        peer_name: peerName,
        peer_name_long: network?.name_long || null,
        peer_aka: network?.aka || null,
        ipaddr4: item.ipaddr4 || null,
        ipaddr6: item.ipaddr6 || null,
        speed: item.speed ?? null,
        is_rs_peer: Boolean(item.is_rs_peer),
        operational: item.operational !== false,
      } satisfies PeeringDBIXPPeer
    })
    .filter((item) => {
      if (!keyword) {
        return true
      }

      return [
        item.peer_name,
        item.peer_name_long,
        item.peer_aka,
        item.name,
        `as${item.asn}`,
        String(item.asn),
        item.ipaddr4,
        item.ipaddr6,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(keyword))
    })
    .sort((left, right) => left.asn - right.asn)
}
