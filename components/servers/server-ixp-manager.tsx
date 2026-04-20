'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { PeeringDBIXP, Server, ServerIXPMembership } from '@/types'

interface ServerIxpManagerProps {
  server: Server
  memberships: ServerIXPMembership[]
  onChange: () => Promise<void> | void
}

type MembershipFormState = {
  ix_id: string
  ix_name: string
  ix_name_long: string
  ix_country: string
  ix_city: string
  ix_region_continent: string
  local_ipaddr4: string
  local_ipaddr6: string
  speed: string
  is_rs_peer: boolean
  notes: string
}

function createInitialState(): MembershipFormState {
  return {
    ix_id: '',
    ix_name: '',
    ix_name_long: '',
    ix_country: '',
    ix_city: '',
    ix_region_continent: '',
    local_ipaddr4: '',
    local_ipaddr6: '',
    speed: '',
    is_rs_peer: false,
    notes: '',
  }
}

export function ServerIxpManager({ server, memberships, onChange }: ServerIxpManagerProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PeeringDBIXP[]>([])
  const [formData, setFormData] = useState<MembershipFormState>(() => createInitialState())

  const membershipKeys = useMemo(() => new Set(memberships.map((membership) => membership.ix_id)), [memberships])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setFormData(createInitialState())
      return
    }

    const keyword = query.trim()
    if (keyword.length < 2) {
      setResults([])
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setSearchLoading(true)
        const response = await fetch(`/api/peeringdb/ixps?q=${encodeURIComponent(keyword)}&limit=12`, {
          signal: controller.signal,
        })
        const result = await response.json()
        if (result.success) {
          setResults(result.data)
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Failed to search IXPs:', error)
        }
      } finally {
        setSearchLoading(false)
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [open, query])

  const applyIxp = (ixp: PeeringDBIXP) => {
    setFormData((current) => ({
      ...current,
      ix_id: String(ixp.id),
      ix_name: ixp.name,
      ix_name_long: ixp.name_long || '',
      ix_country: ixp.country || '',
      ix_city: ixp.city || '',
      ix_region_continent: ixp.region_continent || '',
    }))
    setQuery(ixp.name)
    setResults([])
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`/api/servers/${server.id}/ixps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ix_id: Number(formData.ix_id),
          ix_name: formData.ix_name,
          ix_name_long: formData.ix_name_long,
          ix_country: formData.ix_country,
          ix_city: formData.ix_city,
          ix_region_continent: formData.ix_region_continent,
          local_ipaddr4: formData.local_ipaddr4,
          local_ipaddr6: formData.local_ipaddr6,
          speed: formData.speed ? Number(formData.speed) : null,
          is_rs_peer: formData.is_rs_peer,
          notes: formData.notes,
        }),
      })
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to create IX membership')
      }

      await onChange()
      setOpen(false)
    } catch (error) {
      console.error('Failed to create IX membership:', error)
      alert(error instanceof Error ? error.message : 'Failed to create IX membership')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (membershipId: number) => {
    if (!confirm('Delete this IX membership from the node?')) {
      return
    }

    try {
      const response = await fetch(`/api/servers/${server.id}/ixps/${membershipId}`, { method: 'DELETE' })
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete IX membership')
      }

      await onChange()
    } catch (error) {
      console.error('Failed to delete IX membership:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete IX membership')
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">IXP Memberships</CardTitle>
            <CardDescription>
              Add PeeringDB-backed IX information to this node before creating IX sessions.
            </CardDescription>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add IXP
          </Button>
        </CardHeader>
        <CardContent>
          {memberships.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              This node has no IXP memberships yet.
            </p>
          ) : (
            <div className="space-y-3">
              {memberships.map((membership) => (
                <div key={membership.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{membership.ix_name}</p>
                        <Badge variant="outline">IX {membership.ix_id}</Badge>
                        {membership.is_rs_peer && <Badge variant="secondary">RS Peer</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {[membership.ix_city, membership.ix_country, membership.ix_region_continent].filter(Boolean).join(' · ') || 'No location metadata'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Local side: {membership.local_ipaddr4 || '-'} / {membership.local_ipaddr6 || '-'}
                      </p>
                      {membership.speed && (
                        <p className="text-xs text-muted-foreground">Port speed: {membership.speed} Mbps</p>
                      )}
                      {membership.notes && (
                        <p className="text-xs text-muted-foreground">{membership.notes}</p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => void handleDelete(membership.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add IXP Membership</DialogTitle>
            <DialogDescription>
              Search PeeringDB, choose an exchange, then store this node&apos;s local peering addresses.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-3">
              <Label htmlFor="ixp-search">Search PeeringDB IXP</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="ixp-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by IXP name, city, or operator"
                  className="pl-9"
                />
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border">
                {query.trim().length < 2 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">Type at least two characters to search PeeringDB.</p>
                ) : searchLoading ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching IXPs...
                  </div>
                ) : results.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">No IXP matches found.</p>
                ) : (
                  results.map((ixp) => {
                    const alreadyAdded = membershipKeys.has(ixp.id)
                    return (
                      <button
                        key={ixp.id}
                        type="button"
                        className="flex w-full flex-col gap-1 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => applyIxp(ixp)}
                        disabled={alreadyAdded}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{ixp.name}</span>
                          {alreadyAdded && <Badge variant="outline">Added</Badge>}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {[ixp.city, ixp.country, ixp.region_continent].filter(Boolean).join(' · ') || 'No location metadata'}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ix_name">IX Name</Label>
                <Input
                  id="ix_name"
                  value={formData.ix_name}
                  onChange={(event) => setFormData((current) => ({ ...current, ix_name: event.target.value }))}
                  placeholder="Exchange name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ix_id">IX ID</Label>
                <Input
                  id="ix_id"
                  type="number"
                  value={formData.ix_id}
                  onChange={(event) => setFormData((current) => ({ ...current, ix_id: event.target.value }))}
                  placeholder="PeeringDB IX id"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="local_ipaddr4">Local IPv4</Label>
                <Input
                  id="local_ipaddr4"
                  value={formData.local_ipaddr4}
                  onChange={(event) => setFormData((current) => ({ ...current, local_ipaddr4: event.target.value }))}
                  placeholder="198.51.100.2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="local_ipaddr6">Local IPv6</Label>
                <Input
                  id="local_ipaddr6"
                  value={formData.local_ipaddr6}
                  onChange={(event) => setFormData((current) => ({ ...current, local_ipaddr6: event.target.value }))}
                  placeholder="2001:db8::2"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="speed">Port Speed (Mbps)</Label>
                <Input
                  id="speed"
                  type="number"
                  min={0}
                  value={formData.speed}
                  onChange={(event) => setFormData((current) => ({ ...current, speed: event.target.value }))}
                  placeholder="10000"
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Route Server Peer</p>
                  <p className="text-xs text-muted-foreground">Mark this if the node peers with the IX route server.</p>
                </div>
                <Switch
                  checked={formData.is_rs_peer}
                  onCheckedChange={(checked) => setFormData((current) => ({ ...current, is_rs_peer: checked }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(event) => setFormData((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Cabinet, patch panel, VLAN, or ops notes"
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Membership
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
