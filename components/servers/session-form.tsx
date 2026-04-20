'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { generateSessionConfigSnippet, recommendSessionType } from '@/lib/bgp/automation'
import type {
  PeeringDBIXPPeer,
  Server,
  ServerIXPMembership,
  SessionAddressFamily,
  SessionTransportMode,
  SessionType,
  TunnelWithServers,
} from '@/types'

interface SessionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server: Server | null
  servers: Server[]
  tunnels: TunnelWithServers[]
  memberships: ServerIXPMembership[]
  onCreated: () => Promise<void> | void
}

type SessionFormState = {
  session_type: SessionType
  transport_mode: SessionTransportMode
  address_family: SessionAddressFamily
  peer_server_id: string
  server_ixp_membership_id: string
  tunnel_id: string
  peer_name: string
  peer_asn: string
  local_ipv4: string
  local_ipv6: string
  peer_ipv4: string
  peer_ipv6: string
  multihop: string
  password: string
  import_filter: string
  export_filter: string
  description: string
  source: string
}

const SESSION_TYPE_OPTIONS: Array<{ value: SessionType; label: string }> = [
  { value: 'ibgp', label: 'iBGP' },
  { value: 'rr', label: 'RR Client' },
  { value: 'peer', label: 'Peer' },
  { value: 'upstream', label: 'Upstream' },
  { value: 'downstream', label: 'Downstream' },
  { value: 'customer', label: 'Customer' },
]

const TRANSPORT_OPTIONS: Array<{ value: SessionTransportMode; label: string; hint: string }> = [
  { value: 'ix', label: 'IX', hint: 'Use local IXP membership and pick peer data from PeeringDB.' },
  { value: 'internal', label: 'Internal', hint: 'Manual underlay / LAN / fabric addressing.' },
  { value: 'tunnel', label: 'Tunnel', hint: 'Build the BGP session over an existing tunnel.' },
]

const ADDRESS_FAMILY_OPTIONS: Array<{ value: SessionAddressFamily; label: string }> = [
  { value: 'dual', label: 'Dual Stack' },
  { value: 'ipv6', label: 'IPv6 Only' },
  { value: 'ipv4', label: 'IPv4 Only' },
]

function createInitialState(): SessionFormState {
  return {
    session_type: 'ibgp',
    transport_mode: 'internal',
    address_family: 'dual',
    peer_server_id: '',
    server_ixp_membership_id: '',
    tunnel_id: '',
    peer_name: '',
    peer_asn: '',
    local_ipv4: '',
    local_ipv6: '',
    peer_ipv4: '',
    peer_ipv6: '',
    multihop: '0',
    password: '',
    import_filter: '',
    export_filter: '',
    description: '',
    source: '',
  }
}

export function SessionForm({
  open,
  onOpenChange,
  server,
  servers,
  tunnels,
  memberships,
  onCreated,
}: SessionFormProps) {
  const [formData, setFormData] = useState<SessionFormState>(() => createInitialState())
  const [loading, setLoading] = useState(false)
  const [peerSearch, setPeerSearch] = useState('')
  const [peerLoading, setPeerLoading] = useState(false)
  const [ixPeers, setIxPeers] = useState<PeeringDBIXPPeer[]>([])

  useEffect(() => {
    if (!open) {
      setFormData(createInitialState())
      setPeerSearch('')
      setIxPeers([])
    }
  }, [open])

  const attachedTunnels = useMemo(() => {
    if (!server) {
      return []
    }

    return tunnels.filter((tunnel) => tunnel.server_a_id === server.id || tunnel.server_b_id === server.id)
  }, [server, tunnels])

  const peerServers = useMemo(() => {
    if (!server) {
      return []
    }

    return servers.filter((candidate) => candidate.id !== server.id)
  }, [server, servers])

  const selectedMembership = useMemo(() => {
    const id = Number(formData.server_ixp_membership_id)
    return memberships.find((membership) => membership.id === id) || null
  }, [formData.server_ixp_membership_id, memberships])

  const selectedTunnel = useMemo(() => {
    const id = Number(formData.tunnel_id)
    return attachedTunnels.find((tunnel) => tunnel.id === id) || null
  }, [attachedTunnels, formData.tunnel_id])

  const selectedPeerServer = useMemo(() => {
    const id = Number(formData.peer_server_id)
    return peerServers.find((candidate) => candidate.id === id) || null
  }, [formData.peer_server_id, peerServers])

  const recommendedType = useMemo(() => {
    if (!server) {
      return null
    }

    const peerAsn = formData.peer_asn ? Number(formData.peer_asn) : null
    return recommendSessionType({
      localServer: server,
      peerServer: selectedPeerServer,
      peerAsn,
      transportMode: formData.transport_mode,
    })
  }, [formData.peer_asn, formData.transport_mode, selectedPeerServer, server])

  const configPreview = useMemo(() => {
    if (!server || !formData.peer_asn) {
      return ''
    }

    const peerAsn = Number(formData.peer_asn)
    if (!Number.isFinite(peerAsn) || peerAsn <= 0) {
      return ''
    }

    return generateSessionConfigSnippet({
      localServer: server,
      peerServer: selectedPeerServer,
      sessionType: formData.session_type,
      transportMode: formData.transport_mode,
      addressFamily: formData.address_family,
      peerAsn,
      peerName: formData.peer_name,
      localIpv4: formData.local_ipv4,
      localIpv6: formData.local_ipv6,
      peerIpv4: formData.peer_ipv4,
      peerIpv6: formData.peer_ipv6,
      multihop: Number(formData.multihop || '0'),
      password: formData.password,
      importFilter: formData.import_filter,
      exportFilter: formData.export_filter,
      description: formData.description,
    })
  }, [formData, selectedPeerServer, server])

  useEffect(() => {
    if (!open || formData.transport_mode !== 'ix' || !selectedMembership) {
      setIxPeers([])
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setPeerLoading(true)
        const searchParams = new URLSearchParams({
          q: peerSearch,
          limit: '100',
        })
        const response = await fetch(`/api/peeringdb/ixps/${selectedMembership.ix_id}/members?${searchParams.toString()}`, {
          signal: controller.signal,
        })
        const result = await response.json()
        if (result.success) {
          setIxPeers(result.data)
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Failed to load IX peers:', error)
        }
      } finally {
        setPeerLoading(false)
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [formData.transport_mode, open, peerSearch, selectedMembership])

  useEffect(() => {
    if (formData.transport_mode === 'ix' && selectedMembership) {
      setFormData((current) => ({
        ...current,
        local_ipv4: current.local_ipv4 || selectedMembership.local_ipaddr4 || '',
        local_ipv6: current.local_ipv6 || selectedMembership.local_ipaddr6 || '',
        source: current.source || 'peeringdb',
      }))
    }
  }, [formData.transport_mode, selectedMembership])

  useEffect(() => {
    if (formData.transport_mode !== 'tunnel' || !selectedTunnel || !server) {
      return
    }

    const isServerA = selectedTunnel.server_a_id === server.id
    const peer = isServerA ? selectedTunnel.server_b : selectedTunnel.server_a

    setFormData((current) => ({
      ...current,
      peer_server_id: String(peer.id),
      peer_name: current.peer_name || peer.name,
      peer_asn: current.session_type === 'ibgp' ? String(peer.local_asn) : (current.peer_asn || String(peer.local_asn)),
      local_ipv4: current.local_ipv4 || (isServerA ? selectedTunnel.tunnel_ipv4_a || '' : selectedTunnel.tunnel_ipv4_b || ''),
      local_ipv6: current.local_ipv6 || (isServerA ? selectedTunnel.tunnel_ipv6_a || '' : selectedTunnel.tunnel_ipv6_b || ''),
      peer_ipv4: current.peer_ipv4 || (isServerA ? selectedTunnel.tunnel_ipv4_b || '' : selectedTunnel.tunnel_ipv4_a || ''),
      peer_ipv6: current.peer_ipv6 || (isServerA ? selectedTunnel.tunnel_ipv6_b || '' : selectedTunnel.tunnel_ipv6_a || ''),
    }))
  }, [formData.session_type, formData.transport_mode, selectedTunnel, server])

  useEffect(() => {
    if (!selectedPeerServer || !server) {
      return
    }

    if (formData.session_type === 'ibgp' || formData.session_type === 'rr') {
      setFormData((current) => ({
        ...current,
        peer_name: current.peer_name || selectedPeerServer.name,
        peer_asn: String(selectedPeerServer.local_asn),
      }))
    }
  }, [formData.session_type, selectedPeerServer, server])

  const applyIxPeer = (peer: PeeringDBIXPPeer) => {
    setFormData((current) => ({
      ...current,
      peer_name: peer.peer_name,
      peer_asn: String(peer.asn),
      peer_ipv4: peer.ipaddr4 || '',
      peer_ipv6: peer.ipaddr6 || '',
    }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!server) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: server.id,
          peer_server_id: formData.peer_server_id ? Number(formData.peer_server_id) : null,
          server_ixp_membership_id: formData.server_ixp_membership_id ? Number(formData.server_ixp_membership_id) : null,
          tunnel_id: formData.tunnel_id ? Number(formData.tunnel_id) : null,
          session_type: formData.session_type,
          transport_mode: formData.transport_mode,
          address_family: formData.address_family,
          peer_name: formData.peer_name,
          peer_asn: Number(formData.peer_asn),
          local_ipv4: formData.local_ipv4,
          local_ipv6: formData.local_ipv6,
          peer_ipv4: formData.peer_ipv4,
          peer_ipv6: formData.peer_ipv6,
          multihop: Number(formData.multihop || '0'),
          password: formData.password,
          import_filter: formData.import_filter,
          export_filter: formData.export_filter,
          description: formData.description,
          source: formData.source,
        }),
      })
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to create session')
      }

      await onCreated()
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to create session:', error)
      alert(error instanceof Error ? error.message : 'Failed to create session')
    } finally {
      setLoading(false)
    }
  }

  const transportHint = TRANSPORT_OPTIONS.find((option) => option.value === formData.transport_mode)?.hint

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create BGP Session</DialogTitle>
          <DialogDescription>
            Build IX, internal, or tunnel-based sessions for {server?.name || 'this node'}.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Session Type</Label>
              <Select
                value={formData.session_type}
                onValueChange={(value: SessionType) => setFormData((current) => ({ ...current, session_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {recommendedType && recommendedType !== formData.session_type && (
                <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Recommended: {SESSION_TYPE_OPTIONS.find((item) => item.value === recommendedType)?.label || recommendedType}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => setFormData((current) => ({ ...current, session_type: recommendedType }))}
                  >
                    Apply
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Transport</Label>
              <Select
                value={formData.transport_mode}
                onValueChange={(value: SessionTransportMode) => {
                  setFormData((current) => ({
                    ...current,
                    transport_mode: value,
                    server_ixp_membership_id: value === 'ix' ? current.server_ixp_membership_id : '',
                    tunnel_id: value === 'tunnel' ? current.tunnel_id : '',
                  }))
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSPORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{transportHint}</p>
            </div>

            <div className="space-y-2">
              <Label>Address Family</Label>
              <Select
                value={formData.address_family}
                onValueChange={(value: SessionAddressFamily) => setFormData((current) => ({ ...current, address_family: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADDRESS_FAMILY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {formData.transport_mode === 'ix' && (
            <div className="space-y-4 rounded-xl border p-4">
              <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                <div className="space-y-2">
                  <Label>Local IX Membership</Label>
                  <Select
                    value={formData.server_ixp_membership_id}
                    onValueChange={(value) => setFormData((current) => ({ ...current, server_ixp_membership_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={memberships.length === 0 ? 'No local IXP membership' : 'Choose local IXP'} />
                    </SelectTrigger>
                    <SelectContent>
                      {memberships.map((membership) => (
                        <SelectItem key={membership.id} value={String(membership.id)}>
                          {membership.ix_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedMembership && (
                    <p className="text-xs text-muted-foreground">
                      Local side: {selectedMembership.local_ipaddr4 || '-'} / {selectedMembership.local_ipaddr6 || '-'}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ix-peer-search">Find Remote Peer</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="ix-peer-search"
                      value={peerSearch}
                      onChange={(event) => setPeerSearch(event.target.value)}
                      placeholder={selectedMembership ? 'Search ASN / name / address' : 'Select local IXP membership first'}
                      className="pl-9"
                      disabled={!selectedMembership}
                    />
                  </div>
                  <div className="max-h-56 overflow-auto rounded-lg border">
                    {!selectedMembership ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">Add this node to an IXP first, then choose the local membership here.</p>
                    ) : peerLoading ? (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading peers from PeeringDB...
                      </div>
                    ) : ixPeers.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No peer records matched the current query.</p>
                    ) : (
                      ixPeers.map((peer) => (
                        <button
                          key={peer.id}
                          type="button"
                          className="flex w-full flex-col gap-1 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"
                          onClick={() => applyIxPeer(peer)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">{peer.peer_name}</span>
                            <span className="text-xs text-muted-foreground">AS{peer.asn}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {peer.ipaddr4 || '-'} / {peer.ipaddr6 || '-'}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {formData.transport_mode === 'tunnel' && (
            <div className="space-y-4 rounded-xl border p-4">
              <div className="space-y-2">
                <Label>Tunnel</Label>
                <Select
                  value={formData.tunnel_id}
                  onValueChange={(value) => setFormData((current) => ({ ...current, tunnel_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={attachedTunnels.length === 0 ? 'No tunnel available' : 'Choose tunnel'} />
                  </SelectTrigger>
                  <SelectContent>
                    {attachedTunnels.map((tunnel) => {
                      const peer = tunnel.server_a_id === server?.id ? tunnel.server_b : tunnel.server_a
                      return (
                        <SelectItem key={tunnel.id} value={String(tunnel.id)}>
                          {peer.name} · {tunnel.tunnel_type}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                {selectedTunnel && (
                  <p className="text-xs text-muted-foreground">
                    Reuse {selectedTunnel.tunnel_type} underlay and its addresses; iBGP over OSPF/overlay is supported.
                  </p>
                )}
              </div>
            </div>
          )}

          {(formData.transport_mode === 'internal' || formData.transport_mode === 'tunnel') && (
            <div className="space-y-4 rounded-xl border p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Peer Server (optional/manual assist)</Label>
                  <Select
                    value={formData.peer_server_id || 'none'}
                    onValueChange={(value) => setFormData((current) => ({ ...current, peer_server_id: value === 'none' ? '' : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose peer server" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Manual / External peer</SelectItem>
                      {peerServers.map((candidate) => (
                        <SelectItem key={candidate.id} value={String(candidate.id)}>
                          {candidate.name} · AS{candidate.local_asn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="peer_name">Peer Name</Label>
                  <Input
                    id="peer_name"
                    value={formData.peer_name}
                    onChange={(event) => setFormData((current) => ({ ...current, peer_name: event.target.value }))}
                    placeholder="Remote router / node / ASN description"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="peer_asn">Peer ASN</Label>
              <Input
                id="peer_asn"
                type="number"
                value={formData.peer_asn}
                onChange={(event) => setFormData((current) => ({ ...current, peer_asn: event.target.value }))}
                placeholder="65001"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="multihop">Multihop</Label>
              <Input
                id="multihop"
                type="number"
                min={0}
                value={formData.multihop}
                onChange={(event) => setFormData((current) => ({ ...current, multihop: event.target.value }))}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="local_ipv4">Local IPv4</Label>
              <Input
                id="local_ipv4"
                value={formData.local_ipv4}
                onChange={(event) => setFormData((current) => ({ ...current, local_ipv4: event.target.value }))}
                placeholder="192.0.2.1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="peer_ipv4">Peer IPv4</Label>
              <Input
                id="peer_ipv4"
                value={formData.peer_ipv4}
                onChange={(event) => setFormData((current) => ({ ...current, peer_ipv4: event.target.value }))}
                placeholder="192.0.2.2"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="local_ipv6">Local IPv6</Label>
              <Input
                id="local_ipv6"
                value={formData.local_ipv6}
                onChange={(event) => setFormData((current) => ({ ...current, local_ipv6: event.target.value }))}
                placeholder="2001:db8::1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="peer_ipv6">Peer IPv6</Label>
              <Input
                id="peer_ipv6"
                value={formData.peer_ipv6}
                onChange={(event) => setFormData((current) => ({ ...current, peer_ipv6: event.target.value }))}
                placeholder="2001:db8::2"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="password">BGP Password</Label>
              <Input
                id="password"
                value={formData.password}
                onChange={(event) => setFormData((current) => ({ ...current, password: event.target.value }))}
                placeholder="Optional MD5 password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Input
                id="source"
                value={formData.source}
                onChange={(event) => setFormData((current) => ({ ...current, source: event.target.value }))}
                placeholder="manual / peeringdb / imported"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="import_filter">Import Filter</Label>
              <Textarea
                id="import_filter"
                value={formData.import_filter}
                onChange={(event) => setFormData((current) => ({ ...current, import_filter: event.target.value }))}
                placeholder="Optional BIRD import policy notes"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="export_filter">Export Filter</Label>
              <Textarea
                id="export_filter"
                value={formData.export_filter}
                onChange={(event) => setFormData((current) => ({ ...current, export_filter: event.target.value }))}
                placeholder="Optional BIRD export policy notes"
                rows={4}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
              placeholder="Operator note for this session"
              rows={3}
            />
          </div>

          {configPreview && (
            <div className="space-y-2 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Generated BIRD Snippet</Label>
                  <p className="text-xs text-muted-foreground">
                    This preview updates from the selected tunnel, IX membership, and peer information.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(configPreview)}>
                  Copy
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{configPreview}</pre>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
