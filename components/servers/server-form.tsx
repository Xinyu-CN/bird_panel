'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { REGION_CODES, type AirportOption, type ServerFormData, type ServerType, type SSHKey } from '@/types'

interface ServerFormProps {
  mode: 'create' | 'edit'
  initialData?: {
    name: string
    type: ServerType
    is_core: boolean
    is_initialized: boolean
    icao_code: string
    latitude: number
    longitude: number
    city: string
    country_code: string
    region_code: string
    ssh_host: string
    ssh_port: number
    ssh_user: string
    ssh_key_id?: number | null
  }
  serverId?: number
}

interface FormState {
  name: string
  type: ServerType
  is_core: boolean
  icao_code: string
  latitude: string
  longitude: string
  city: string
  country_code: string
  region_code: string
  ssh_host: string
  ssh_port: string
  ssh_user: string
  ssh_key_id: string
  sync_existing_config: boolean
}

function buildInitialFormState(initialData?: ServerFormProps['initialData']): FormState {
  return {
    name: initialData?.name || '',
    type: initialData?.type || 'node',
    is_core: initialData?.is_core || false,
    sync_existing_config: initialData?.is_initialized || false,
    icao_code: initialData?.icao_code || '',
    latitude: initialData?.latitude?.toString() || '',
    longitude: initialData?.longitude?.toString() || '',
    city: initialData?.city || '',
    country_code: initialData?.country_code || '',
    region_code: initialData?.region_code || '',
    ssh_host: initialData?.ssh_host || '',
    ssh_port: initialData?.ssh_port?.toString() || '',
    ssh_user: initialData?.ssh_user || '',
    ssh_key_id: initialData?.ssh_key_id ? String(initialData.ssh_key_id) : '',
  }
}

export function ServerForm({ mode, initialData, serverId }: ServerFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [airportLoading, setAirportLoading] = useState(false)
  const [keysLoading, setKeysLoading] = useState(true)
  const [airportQuery, setAirportQuery] = useState(initialData?.icao_code || '')
  const [airportResults, setAirportResults] = useState<AirportOption[]>([])
  const [sshKeys, setSSHKeys] = useState<SSHKey[]>([])
  const [formData, setFormData] = useState<FormState>(() => buildInitialFormState(initialData))

  useEffect(() => {
    const fetchSSHKeys = async () => {
      try {
        setKeysLoading(true)
        const response = await fetch('/api/ssh-keys')
        const result = await response.json()
        if (result.success) {
          setSSHKeys(result.data)
        }
      } catch (error) {
        console.error('Failed to load SSH keys:', error)
      } finally {
        setKeysLoading(false)
      }
    }

    void fetchSSHKeys()
  }, [])

  useEffect(() => {
    const keyword = airportQuery.trim()
    if (keyword.length < 2) {
      setAirportResults([])
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setAirportLoading(true)
        const response = await fetch(`/api/airports?q=${encodeURIComponent(keyword)}&limit=12`, {
          signal: controller.signal,
        })
        const result = await response.json()
        if (result.success) {
          setAirportResults(result.data)
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Failed to search airports:', error)
        }
      } finally {
        setAirportLoading(false)
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [airportQuery])

  const canSelectAirport = useMemo(() => airportQuery.trim().length >= 2, [airportQuery])

  const updateFormData = (updates: Partial<FormState>) => {
    setFormData((current) => ({ ...current, ...updates }))
  }

  const handleAirportSelect = (airport: AirportOption) => {
    setFormData((current) => ({
      ...current,
      icao_code: airport.icao,
      latitude: airport.latitude.toString(),
      longitude: airport.longitude.toString(),
      city: airport.region_name,
    }))
    setAirportQuery(`${airport.icao} ${airport.airport}`)
    setAirportResults([])
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)

    try {
      if (mode === 'edit' && initialData?.is_initialized && !formData.sync_existing_config) {
        const confirmed = confirm('将节点改回“未初始化”前，请先手动删除远端 /etc/bird 下的相关配置。确认继续吗？')
        if (!confirmed) {
          return
        }
      }

      const latitude = Number(formData.latitude)
      const longitude = Number(formData.longitude)
      const sshPort = Number(formData.ssh_port)
      const sshKeyId = formData.ssh_key_id ? Number(formData.ssh_key_id) : null

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        alert('请填写有效的经纬度。')
        return
      }

      if (!Number.isInteger(sshPort) || sshPort <= 0) {
        alert('请填写有效的 SSH 端口。')
        return
      }

      if (sshKeyId !== null && (!Number.isInteger(sshKeyId) || sshKeyId <= 0)) {
        alert('请选择有效的 SSH 密钥。')
        return
      }

      if (!formData.region_code || !formData.country_code) {
        alert('请同时填写区域码和国家码。')
        return
      }

      const payload: ServerFormData = {
        name: formData.name.trim(),
        type: formData.type,
        is_core: formData.type === 'node' ? formData.is_core : false,
        icao_code: formData.icao_code.trim().toUpperCase(),
        latitude,
        longitude,
        city: formData.city.trim(),
        country_code: formData.country_code.trim(),
        region_code: formData.region_code,
        ssh_host: formData.ssh_host.trim(),
        ssh_port: sshPort,
        ssh_user: formData.ssh_user.trim(),
        ssh_key_id: sshKeyId,
      }

      const url = mode === 'create' ? '/api/servers' : `/api/servers/${serverId}`
      const method = mode === 'create' ? 'POST' : 'PATCH'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (result.success) {
        const savedServerId = result.data?.id || serverId

        if (savedServerId && formData.sync_existing_config) {
          const syncResponse = await fetch(`/api/servers/${savedServerId}/initialization-state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'import_remote' }),
          })
          const syncResult = await syncResponse.json()

          if (!syncResult.success) {
            alert(syncResult.error || '节点已保存，但读取 /etc/bird/vars.conf 失败。')
            router.push(`/servers/${savedServerId}`)
            router.refresh()
            return
          }
        } else if (mode === 'edit' && savedServerId && initialData?.is_initialized && !formData.sync_existing_config) {
          const resetResponse = await fetch(`/api/servers/${savedServerId}/initialization-state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'mark_uninitialized' }),
          })
          const resetResult = await resetResponse.json()
          if (!resetResult.success) {
            alert(resetResult.error || '节点已保存，但重置初始化状态失败。')
            router.push(`/servers/${savedServerId}`)
            router.refresh()
            return
          }
        }

        router.push('/servers')
        router.refresh()
      } else {
        alert(result.error || '保存失败。')
      }
    } catch (error) {
      console.error('Failed to save server:', error)
      alert('请求失败。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>基础信息</CardTitle>
          <CardDescription>节点分为 RR 和普通节点两类，Core 仅作为普通节点的附加角色标记。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">节点名称</Label>
              <Input id="name" value={formData.name} onChange={(event) => updateFormData({ name: event.target.value })} placeholder="例如：Beijing-01" required />
            </div>
            <div className="space-y-3 rounded-xl border border-dashed p-4">
              <div className="flex items-start gap-3">
                <Checkbox id="is_rr" checked={formData.type === 'rr'} onCheckedChange={(checked) => updateFormData({ type: checked === true ? 'rr' : 'node', is_core: checked === true ? false : formData.is_core })} />
                <div className="space-y-1">
                  <Label htmlFor="is_rr">作为 RR</Label>
                  <p className="text-sm text-muted-foreground">勾选后按 RR 节点流程初始化。</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id="is_core" checked={formData.type === 'node' && formData.is_core} disabled={formData.type === 'rr'} onCheckedChange={(checked) => formData.type === 'node' && updateFormData({ is_core: checked === true })} />
                <div className="space-y-1">
                  <Label htmlFor="is_core">标记为 Core 节点</Label>
                  <p className="text-sm text-muted-foreground">仅对普通节点生效；不勾选则视为边缘节点。</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id="sync_existing_config" checked={formData.sync_existing_config} onCheckedChange={(checked) => updateFormData({ sync_existing_config: checked === true })} />
                <div className="space-y-1">
                  <Label htmlFor="sync_existing_config">该节点已初始化</Label>
                  <p className="text-sm text-muted-foreground">保存后将读取远端 /etc/bird/vars.conf，并同步为“已初始化”状态。</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="airport_search">ICAO 搜索（来自 `data/iata-icao.csv`）</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="airport_search" value={airportQuery} onChange={(event) => setAirportQuery(event.target.value)} placeholder="按 ICAO / IATA / 机场 / 地区搜索" className="pl-9" />
            </div>
            <div className="rounded-lg border bg-card">
              {!canSelectAirport ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">至少输入 2 个字符后再搜索机场列表。</p>
              ) : airportLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在搜索机场...</div>
              ) : airportResults.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">没有找到匹配的 ICAO 结果。</p>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  {airportResults.map((airport) => (
                    <button key={`${airport.icao}-${airport.iata}`} type="button" className="flex w-full flex-col gap-1 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50" onClick={() => handleAirportSelect(airport)}>
                      <div className="flex items-center justify-between gap-3"><span className="font-medium">{airport.icao} {airport.iata ? `/ ${airport.iata}` : ''}</span><span className="text-xs text-muted-foreground">{airport.country_code}</span></div>
                      <span className="text-sm text-muted-foreground">{airport.airport}</span>
                      <span className="text-xs text-muted-foreground">{airport.region_name}, {airport.latitude}, {airport.longitude}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="icao_code">ICAO 代码</Label><Input id="icao_code" value={formData.icao_code} onChange={(event) => updateFormData({ icao_code: event.target.value.toUpperCase() })} placeholder="ZBAA" maxLength={4} required /></div>
            <div className="space-y-2"><Label htmlFor="city">城市 / 备注</Label><Input id="city" value={formData.city} onChange={(event) => updateFormData({ city: event.target.value })} placeholder="例如：Beijing" /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>地理位置</CardTitle><CardDescription>经纬度可从机场库带入，区域码和国家码仍需手动确认。</CardDescription></CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="region_code">区域码</Label><Select value={formData.region_code} onValueChange={(value) => updateFormData({ region_code: value })}><SelectTrigger><SelectValue placeholder="选择区域码" /></SelectTrigger><SelectContent>{REGION_CODES.map((region) => <SelectItem key={region.code} value={region.code}>{region.code} - {region.name} ({region.description})</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="country_code">国家码</Label><Input id="country_code" value={formData.country_code} onChange={(event) => updateFormData({ country_code: event.target.value })} placeholder="例如：156" required /></div>
          <div className="space-y-2"><Label htmlFor="latitude">纬度</Label><Input id="latitude" type="number" step="0.0001" value={formData.latitude} onChange={(event) => updateFormData({ latitude: event.target.value })} placeholder="39.9042" required /></div>
          <div className="space-y-2"><Label htmlFor="longitude">经度</Label><Input id="longitude" type="number" step="0.0001" value={formData.longitude} onChange={(event) => updateFormData({ longitude: event.target.value })} placeholder="116.4074" required /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>SSH 信息</CardTitle><CardDescription>初始化流程和 SSH 控制台都会使用这些参数连接目标主机。</CardDescription></CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="ssh_host">SSH 主机</Label><Input id="ssh_host" value={formData.ssh_host} onChange={(event) => updateFormData({ ssh_host: event.target.value })} placeholder="192.0.2.10 或 node.example.com" required /></div>
          <div className="space-y-2"><Label htmlFor="ssh_port">SSH 端口</Label><Input id="ssh_port" type="number" value={formData.ssh_port} onChange={(event) => updateFormData({ ssh_port: event.target.value })} placeholder="22" required /></div>
          <div className="space-y-2"><Label htmlFor="ssh_user">SSH 用户</Label><Input id="ssh_user" value={formData.ssh_user} onChange={(event) => updateFormData({ ssh_user: event.target.value })} placeholder="root" required /></div>
          <div className="space-y-2">
            <Label htmlFor="ssh_key_id">SSH 密钥</Label>
            <Select value={formData.ssh_key_id || 'none'} onValueChange={(value) => updateFormData({ ssh_key_id: value === 'none' ? '' : value })}>
              <SelectTrigger id="ssh_key_id">
                <SelectValue placeholder={keysLoading ? '正在加载 SSH 密钥...' : '选择 SSH 密钥'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不使用 SSH 密钥</SelectItem>
                {sshKeys.map((key) => (
                  <SelectItem key={key.id} value={String(key.id)}>{key.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {sshKeys.length === 0 ? '当前还没有可用 SSH 密钥，请先在系统设置中创建。' : '选择用于初始化和 SSH 控制台的密钥。'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>取消</Button>
        <Button type="submit" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{mode === 'create' ? '创建节点' : '保存修改'}</Button>
      </div>
    </form>
  )
}
