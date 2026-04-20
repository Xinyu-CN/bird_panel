'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { recommendOspfCost } from '@/lib/tunnels/shared'
import type { OSPFMode, OSPFType, Server, TunnelType, WireGuardMode } from '@/types'

interface TunnelFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverA: Server | null
  serverB: Server | null
  onSubmit: (data: TunnelFormData) => Promise<void>
}

export interface TunnelFormData {
  name?: string
  server_a_id: number
  server_b_id: number
  tunnel_type: TunnelType
  bandwidth_mbps?: number
  wg_mode?: WireGuardMode
  wg_port?: number
  ospf_enabled: boolean
  ospf_mode?: OSPFMode
  ospf_type?: OSPFType
  ospf_password?: string
  ospf_cost?: number
  auto_deploy?: boolean
}

export function TunnelForm({ open, onOpenChange, serverA, serverB, onSubmit }: TunnelFormProps) {
  const [loading, setLoading] = useState(false)
  const [autoCost, setAutoCost] = useState(true)
  const [formData, setFormData] = useState<Partial<TunnelFormData>>({
    name: '',
    tunnel_type: 'wireguard',
    bandwidth_mbps: 10000,
    wg_mode: 'both',
    wg_port: 51820,
    ospf_enabled: true,
    ospf_mode: 'v6',
    ospf_type: 'ptp',
    ospf_cost: recommendOspfCost(10000),
    auto_deploy: true,
  })

  useEffect(() => {
    if (!open) {
      setAutoCost(true)
      setFormData({
        name: '',
        tunnel_type: 'wireguard',
        bandwidth_mbps: 10000,
        wg_mode: 'both',
        wg_port: 51820,
        ospf_enabled: true,
        ospf_mode: 'v6',
        ospf_type: 'ptp',
        ospf_cost: recommendOspfCost(10000),
        auto_deploy: true,
      })
    }
  }, [open])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!serverA || !serverB) {
      return
    }

    setLoading(true)
    try {
      await onSubmit({
        name: formData.name?.trim() || undefined,
        server_a_id: serverA.id,
        server_b_id: serverB.id,
        tunnel_type: formData.tunnel_type as TunnelType,
        bandwidth_mbps: formData.bandwidth_mbps ? Number(formData.bandwidth_mbps) : undefined,
        wg_mode: formData.tunnel_type === 'wireguard' ? formData.wg_mode : undefined,
        wg_port: formData.tunnel_type === 'wireguard' ? Number(formData.wg_port || 51820) : undefined,
        ospf_enabled: formData.ospf_enabled ?? true,
        ospf_mode: formData.ospf_enabled ? formData.ospf_mode : undefined,
        ospf_type: formData.ospf_enabled ? formData.ospf_type : undefined,
        ospf_password: formData.ospf_enabled ? formData.ospf_password?.trim() || undefined : undefined,
        ospf_cost: formData.ospf_enabled ? Number(formData.ospf_cost || recommendOspfCost(formData.bandwidth_mbps || null)) : undefined,
        auto_deploy: formData.auto_deploy ?? false,
      })
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  if (!serverA || !serverB) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Tunnel</DialogTitle>
          <DialogDescription>
            Build underlay connectivity between {serverA.name} and {serverB.name}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tunnel_name">Name</Label>
              <Input
                id="tunnel_name"
                value={formData.name || ''}
                onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                placeholder={`${serverA.icao_code}-${serverB.icao_code}`}
              />
            </div>

            <div className="space-y-2">
              <Label>Tunnel Type</Label>
              <Select
                value={formData.tunnel_type}
                onValueChange={(value: TunnelType) => setFormData((current) => ({
                  ...current,
                  tunnel_type: value,
                  ospf_type: value === 'direct' ? 'broadcast' : current.ospf_type || 'ptp',
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wireguard">WireGuard</SelectItem>
                  <SelectItem value="vxlan">VXLAN</SelectItem>
                  <SelectItem value="gre">GRE</SelectItem>
                  <SelectItem value="direct">Direct / Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bandwidth_mbps">Bandwidth (Mbps)</Label>
            <Input
              id="bandwidth_mbps"
              type="number"
              min={1}
              value={formData.bandwidth_mbps || 10000}
              onChange={(event) => {
                const bandwidthMbps = Number(event.target.value || 10000)
                setFormData((current) => ({
                  ...current,
                  bandwidth_mbps: bandwidthMbps,
                  ospf_cost: autoCost ? recommendOspfCost(bandwidthMbps) : current.ospf_cost,
                }))
              }}
              placeholder="10000"
            />
            <p className="text-xs text-muted-foreground">
              Recommended OSPF cost: {recommendOspfCost(formData.bandwidth_mbps || null)}
            </p>
          </div>

          {formData.tunnel_type === 'wireguard' && (
            <div className="space-y-4 rounded-xl border p-4">
              <h4 className="text-sm font-medium">WireGuard Settings</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Encryption Mode</Label>
                  <Select
                    value={formData.wg_mode}
                    onValueChange={(value: WireGuardMode) => setFormData((current) => ({ ...current, wg_mode: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">Both Ends</SelectItem>
                      <SelectItem value="a_only">{serverA.name} Only</SelectItem>
                      <SelectItem value="b_only">{serverB.name} Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wg_port">UDP Port</Label>
                  <Input
                    id="wg_port"
                    type="number"
                    value={formData.wg_port || 51820}
                    onChange={(event) => setFormData((current) => ({ ...current, wg_port: Number(event.target.value || 51820) }))}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label>Enable OSPF</Label>
                <p className="text-xs text-muted-foreground">
                  Tunnel and internal links can carry OSPF, which is useful for iBGP over RR transport.
                </p>
              </div>
              <Switch
                checked={formData.ospf_enabled}
                onCheckedChange={(checked) => setFormData((current) => ({ ...current, ospf_enabled: checked }))}
              />
            </div>

            {formData.ospf_enabled && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>OSPF AFI</Label>
                  <Select
                    value={formData.ospf_mode}
                    onValueChange={(value: OSPFMode) => setFormData((current) => ({ ...current, ospf_mode: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="v6">IPv6</SelectItem>
                      <SelectItem value="v4">IPv4</SelectItem>
                      <SelectItem value="dual">Dual Stack</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>OSPF Network Type</Label>
                  <Select
                    value={formData.ospf_type}
                    onValueChange={(value: OSPFType) => setFormData((current) => ({ ...current, ospf_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ptp">Point-to-Point</SelectItem>
                      <SelectItem value="broadcast">Broadcast</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ospf_cost">OSPF Cost</Label>
                  <Input
                    id="ospf_cost"
                    type="number"
                    value={formData.ospf_cost || recommendOspfCost(formData.bandwidth_mbps || null)}
                    onChange={(event) => {
                      setAutoCost(false)
                      setFormData((current) => ({ ...current, ospf_cost: Number(event.target.value || recommendOspfCost(current.bandwidth_mbps || null)) }))
                    }}
                  />
                  <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <span className="text-xs text-muted-foreground">Link OSPF cost to bandwidth</span>
                    <Switch
                      checked={autoCost}
                      onCheckedChange={(checked) => {
                        setAutoCost(checked)
                        if (checked) {
                          setFormData((current) => ({
                            ...current,
                            ospf_cost: recommendOspfCost(current.bandwidth_mbps || null),
                          }))
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ospf_password">OSPF Password</Label>
                  <Input
                    id="ospf_password"
                    value={formData.ospf_password || ''}
                    onChange={(event) => setFormData((current) => ({ ...current, ospf_password: event.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label>Auto Deploy</Label>
                <p className="text-xs text-muted-foreground">
                  For WireGuard tunnels, the panel can generate keys, push configs to both nodes, and reload BIRD.
                </p>
              </div>
              <Switch
                checked={formData.auto_deploy ?? false}
                onCheckedChange={(checked) => setFormData((current) => ({ ...current, auto_deploy: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Tunnel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
