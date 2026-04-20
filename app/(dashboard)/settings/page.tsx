'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, GitBranch, Globe, Info, Key, Mail, Plus, Save, Send, Smartphone, Trash2, Webhook } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_SYSTEM_SETTINGS } from '@/lib/system-settings-defaults'
import { REGION_CODES, type SSHKey, type SystemSettings } from '@/types'

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS)
  const [sshKeys, setSSHKeys] = useState<SSHKey[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newKeyDialogOpen, setNewKeyDialogOpen] = useState(false)
  const [newKeyForm, setNewKeyForm] = useState({ name: '', private_key: '', public_key: '' })
  const [copied, setCopied] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsRes, keysRes] = await Promise.all([
        fetch('/api/settings', { cache: 'no-store' }),
        fetch('/api/ssh-keys', { cache: 'no-store' }),
      ])

      const [settingsData, keysData] = await Promise.all([settingsRes.json(), keysRes.json()])

      if (settingsData.success) {
        setSettings({
          ...DEFAULT_SYSTEM_SETTINGS,
          ...settingsData.data,
        })
      }

      if (keysData.success) {
        setSSHKeys(keysData.data)
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to save settings')
      }

      alert('Settings saved.')
    } catch (error) {
      console.error('Failed to save settings:', error)
      alert(error instanceof Error ? error.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleAddSSHKey = async () => {
    if (!newKeyForm.name.trim() || !newKeyForm.private_key.trim()) {
      alert('Please provide a key name and private key.')
      return
    }

    try {
      const response = await fetch('/api/ssh-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyForm.name.trim(),
          private_key: newKeyForm.private_key,
          public_key: newKeyForm.public_key.trim() || null,
        }),
      })
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to add SSH key')
      }

      setNewKeyDialogOpen(false)
      setNewKeyForm({ name: '', private_key: '', public_key: '' })
      await fetchData()
    } catch (error) {
      console.error('Failed to add SSH key:', error)
      alert(error instanceof Error ? error.message : 'Failed to add SSH key')
    }
  }

  const handleDeleteSSHKey = async (id: number) => {
    if (!confirm('Delete this SSH key? Any server bound to it will lose key-based access.')) {
      return
    }

    try {
      const response = await fetch(`/api/ssh-keys/${id}`, { method: 'DELETE' })
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete SSH key')
      }

      await fetchData()
    } catch (error) {
      console.error('Failed to delete SSH key:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete SSH key')
    }
  }

  const updateSetting = (key: keyof SystemSettings, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const toggleSetting = (key: keyof SystemSettings) => {
    updateSetting(key, settings[key] === 'true' ? 'false' : 'true')
  }

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    window.setTimeout(() => setCopied(null), 1800)
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <Header title="System Settings" description="Manage network, Git templates, SSH keys, and alert notifications." />
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="System Settings" description="Manage network, Git templates, SSH keys, and alert notifications." />

      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="network" className="space-y-6">
          <TabsList className="flex flex-wrap justify-start">
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="dns">DNS</TabsTrigger>
            <TabsTrigger value="git">Git</TabsTrigger>
            <TabsTrigger value="notify">Notifications</TabsTrigger>
            <TabsTrigger value="ssh">SSH Keys</TabsTrigger>
            <TabsTrigger value="reference">Reference</TabsTrigger>
          </TabsList>

          <TabsContent value="network" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>BGP / Backbone</CardTitle>
                <CardDescription>These values drive IPv6 allocation, hostname generation, and future config rendering.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel>Local ASN</FieldLabel>
                    <Input value={settings.local_asn} onChange={(event) => updateSetting('local_asn', event.target.value)} placeholder="151673" />
                  </Field>
                  <Field>
                    <FieldLabel>Backbone IPv4 Prefix</FieldLabel>
                    <Input value={settings.backbone_v4_prefix} onChange={(event) => updateSetting('backbone_v4_prefix', event.target.value)} placeholder="192.0.2.0/24" />
                  </Field>
                  <Field>
                    <FieldLabel>Backbone IPv6 Prefix</FieldLabel>
                    <Input value={settings.backbone_v6_prefix} onChange={(event) => updateSetting('backbone_v6_prefix', event.target.value)} placeholder="2a14:7581:3810::/44" />
                  </Field>
                </FieldGroup>

                <div className="mt-6 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
                  <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                    <Info className="h-4 w-4" />
                    Addressing Notes
                  </div>
                  <ul className="space-y-1">
                    <li>- Server IPv6 addresses are allocated from the backbone IPv6 prefix by region and node id.</li>
                    <li>- `router id` is derived from IPv4 when available; otherwise a deterministic fallback is used.</li>
                    <li>- Keep the IPv6 prefix stable after deployment or existing node assignments will drift.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dns" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  DNS / Cloudflare
                </CardTitle>
                <CardDescription>Cloudflare API token is still expected from environment variables; these values describe the zone mapping.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel>DNS Zone</FieldLabel>
                    <Input value={settings.dns_zone} onChange={(event) => updateSetting('dns_zone', event.target.value)} placeholder="net.example.com" />
                    <p className="mt-1 text-xs text-muted-foreground">RR nodes use the `rr` label. Normal nodes use `core` or `edge` based on the core marker.</p>
                  </Field>
                  <Field>
                    <FieldLabel>Cloudflare Zone ID</FieldLabel>
                    <Input value={settings.cloudflare_zone_id} onChange={(event) => updateSetting('cloudflare_zone_id', event.target.value)} placeholder="023e105f4ecef8ad9ca31a8372d0c353" />
                  </Field>
                </FieldGroup>

                <div className="mt-6 rounded-xl bg-muted/50 p-4">
                  <div className="mb-2 text-sm font-medium">Generated Hostname Examples</div>
                  <div className="space-y-1 font-mono text-xs text-muted-foreground">
                    <p>- RR: zsss-01.rr.{settings.dns_zone || '<zone>'}</p>
                    <p>- Core node: zsss-02.core.{settings.dns_zone || '<zone>'}</p>
                    <p>- Standard node: zspd-03.edge.{settings.dns_zone || '<zone>'}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-dashed p-4">
                  <div className="mb-2 text-sm font-medium">Cloudflare API Token</div>
                  <p className="mb-3 text-sm text-muted-foreground">Set `CLOUDFLARE_API_TOKEN` in the runtime environment before enabling DNS automation.</p>
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open Cloudflare Tokens
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="git" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  Config Templates
                </CardTitle>
                <CardDescription>Repository and branch mapping for node and RR configuration templates.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel>Template Repository</FieldLabel>
                    <Input value={settings.git_repo_node} onChange={(event) => updateSetting('git_repo_node', event.target.value)} placeholder="https://github.com/example/network-config" />
                  </Field>
                  <Field>
                    <FieldLabel>Node Branch</FieldLabel>
                    <Input value={settings.git_branch_node} onChange={(event) => updateSetting('git_branch_node', event.target.value)} placeholder="node" />
                  </Field>
                  <Field>
                    <FieldLabel>RR Branch</FieldLabel>
                    <Input value={settings.git_branch_rr} onChange={(event) => updateSetting('git_branch_rr', event.target.value)} placeholder="rr" />
                  </Field>
                </FieldGroup>

                <div className="mt-6 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
                  <div className="mb-2 font-medium text-foreground">Template Flow</div>
                  <ul className="space-y-1">
                    <li>- Node and RR can point to different branches in the same repository.</li>
                    <li>- `vars.conf` is the panel-controlled data layer; repository files should consume those variables.</li>
                    <li>- Keep branch naming stable or initialization will drift between deployments.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notify" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Alert Notifications</CardTitle>
                <CardDescription>Notifications are sent when alerts are created through the panel API.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-xl border p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 font-medium"><Send className="h-4 w-4" />Telegram</div>
                      <p className="text-sm text-muted-foreground">Bot token and chat id are required.</p>
                    </div>
                    <Badge variant={settings.notify_telegram_enabled === 'true' ? 'default' : 'outline'}>
                      {settings.notify_telegram_enabled === 'true' ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>Enabled</FieldLabel>
                      <Button type="button" variant="outline" onClick={() => toggleSetting('notify_telegram_enabled')}>
                        {settings.notify_telegram_enabled === 'true' ? 'Disable' : 'Enable'}
                      </Button>
                    </Field>
                    <Field>
                      <FieldLabel>Bot Token</FieldLabel>
                      <Input value={settings.notify_telegram_bot_token} onChange={(event) => updateSetting('notify_telegram_bot_token', event.target.value)} placeholder="123456:ABCDEF..." />
                    </Field>
                    <Field>
                      <FieldLabel>Chat ID</FieldLabel>
                      <Input value={settings.notify_telegram_chat_id} onChange={(event) => updateSetting('notify_telegram_chat_id', event.target.value)} placeholder="-1001234567890" />
                    </Field>
                  </FieldGroup>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 font-medium"><Mail className="h-4 w-4" />Email</div>
                      <p className="text-sm text-muted-foreground">SMTP settings are used directly from the panel backend.</p>
                    </div>
                    <Badge variant={settings.notify_email_enabled === 'true' ? 'default' : 'outline'}>
                      {settings.notify_email_enabled === 'true' ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>Enabled</FieldLabel>
                      <Button type="button" variant="outline" onClick={() => toggleSetting('notify_email_enabled')}>
                        {settings.notify_email_enabled === 'true' ? 'Disable' : 'Enable'}
                      </Button>
                    </Field>
                    <Field>
                      <FieldLabel>SMTP Host</FieldLabel>
                      <Input value={settings.notify_email_smtp_host} onChange={(event) => updateSetting('notify_email_smtp_host', event.target.value)} placeholder="smtp.example.com" />
                    </Field>
                    <Field>
                      <FieldLabel>SMTP Port</FieldLabel>
                      <Input value={settings.notify_email_smtp_port} onChange={(event) => updateSetting('notify_email_smtp_port', event.target.value)} placeholder="587" />
                    </Field>
                    <Field>
                      <FieldLabel>Secure SMTP</FieldLabel>
                      <Button type="button" variant="outline" onClick={() => toggleSetting('notify_email_smtp_secure')}>
                        {settings.notify_email_smtp_secure === 'true' ? 'true' : 'false'}
                      </Button>
                    </Field>
                    <Field>
                      <FieldLabel>SMTP User</FieldLabel>
                      <Input value={settings.notify_email_smtp_user} onChange={(event) => updateSetting('notify_email_smtp_user', event.target.value)} placeholder="alert@example.com" />
                    </Field>
                    <Field>
                      <FieldLabel>SMTP Password</FieldLabel>
                      <Input type="password" value={settings.notify_email_smtp_pass} onChange={(event) => updateSetting('notify_email_smtp_pass', event.target.value)} placeholder="App password" />
                    </Field>
                    <Field>
                      <FieldLabel>From</FieldLabel>
                      <Input value={settings.notify_email_from} onChange={(event) => updateSetting('notify_email_from', event.target.value)} placeholder="BGP Panel <alert@example.com>" />
                    </Field>
                    <Field>
                      <FieldLabel>To</FieldLabel>
                      <Input value={settings.notify_email_to} onChange={(event) => updateSetting('notify_email_to', event.target.value)} placeholder="noc@example.com" />
                    </Field>
                  </FieldGroup>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 font-medium"><Smartphone className="h-4 w-4" />Bark</div>
                      <p className="text-sm text-muted-foreground">Paste the full Bark push URL including device key.</p>
                    </div>
                    <Badge variant={settings.notify_bark_enabled === 'true' ? 'default' : 'outline'}>
                      {settings.notify_bark_enabled === 'true' ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>Enabled</FieldLabel>
                      <Button type="button" variant="outline" onClick={() => toggleSetting('notify_bark_enabled')}>
                        {settings.notify_bark_enabled === 'true' ? 'Disable' : 'Enable'}
                      </Button>
                    </Field>
                    <Field>
                      <FieldLabel>Bark URL</FieldLabel>
                      <Input value={settings.notify_bark_url} onChange={(event) => updateSetting('notify_bark_url', event.target.value)} placeholder="https://api.day.app/<device-key>" />
                    </Field>
                  </FieldGroup>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 font-medium"><Webhook className="h-4 w-4" />Feishu</div>
                      <p className="text-sm text-muted-foreground">Uses a Feishu bot webhook with plain text messages.</p>
                    </div>
                    <Badge variant={settings.notify_feishu_enabled === 'true' ? 'default' : 'outline'}>
                      {settings.notify_feishu_enabled === 'true' ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>Enabled</FieldLabel>
                      <Button type="button" variant="outline" onClick={() => toggleSetting('notify_feishu_enabled')}>
                        {settings.notify_feishu_enabled === 'true' ? 'Disable' : 'Enable'}
                      </Button>
                    </Field>
                    <Field>
                      <FieldLabel>Webhook URL</FieldLabel>
                      <Input value={settings.notify_feishu_webhook_url} onChange={(event) => updateSetting('notify_feishu_webhook_url', event.target.value)} placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..." />
                    </Field>
                  </FieldGroup>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ssh" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    SSH Keys
                  </CardTitle>
                  <CardDescription>Manage the SSH keys used for initialization and console access.</CardDescription>
                </div>
                <Dialog open={newKeyDialogOpen} onOpenChange={setNewKeyDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add SSH Key
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Add SSH Key</DialogTitle>
                      <DialogDescription>Store an SSH private key for server initialization and console access.</DialogDescription>
                    </DialogHeader>
                    <FieldGroup>
                      <Field>
                        <FieldLabel>Name</FieldLabel>
                        <Input value={newKeyForm.name} onChange={(event) => setNewKeyForm((current) => ({ ...current, name: event.target.value }))} placeholder="production-ed25519" />
                      </Field>
                      <Field>
                        <FieldLabel>Private Key</FieldLabel>
                        <Textarea value={newKeyForm.private_key} onChange={(event) => setNewKeyForm((current) => ({ ...current, private_key: event.target.value }))} className="h-40 font-mono text-xs" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
                      </Field>
                      <Field>
                        <FieldLabel>Public Key (optional)</FieldLabel>
                        <Textarea value={newKeyForm.public_key} onChange={(event) => setNewKeyForm((current) => ({ ...current, public_key: event.target.value }))} className="h-24 font-mono text-xs" placeholder="ssh-ed25519 AAAA..." />
                      </Field>
                    </FieldGroup>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setNewKeyDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleAddSSHKey}>Save Key</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {sshKeys.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Key className="mx-auto mb-4 h-10 w-10 opacity-50" />
                    <p className="font-medium">No SSH keys yet</p>
                    <p className="mt-1 text-sm">Add at least one key before trying initialization or SSH console access.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sshKeys.map((key) => (
                      <div key={key.id} className="flex items-center justify-between rounded-xl border p-4">
                        <div>
                          <p className="font-medium">{key.name}</p>
                          <p className="text-xs text-muted-foreground">Created on {new Date(key.created_at * 1000).toLocaleDateString('zh-CN')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {key.public_key && (
                            <Button variant="ghost" size="icon" onClick={() => void copyToClipboard(key.public_key!, `pub-${key.id}`)}>
                              {copied === `pub-${key.id}` ? <Check className="h-4 w-4 text-status-online" /> : <Copy className="h-4 w-4" />}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void handleDeleteSSHKey(key.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reference" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Region Codes</CardTitle>
                <CardDescription>Used for node metadata, backbone allocation, and future BGP community logic.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {REGION_CODES.map((region) => (
                    <div key={region.code} className="flex items-center justify-between rounded-xl border p-3">
                      <div>
                        <p className="font-mono font-medium">{region.code}</p>
                        <p className="text-xs text-muted-foreground">{region.description}</p>
                      </div>
                      <Badge variant="outline">{region.name}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>vars.conf Quick Reference</CardTitle>
                <CardDescription>Core variables currently used by the panel and remote import workflow.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 text-sm">
                  <div className="font-medium">Node Identity</div>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><code className="rounded bg-muted px-1">LOCAL_ASN</code> - local ASN</li>
                    <li><code className="rounded bg-muted px-1">LOCAL_V6_kernel</code> - local backbone IPv6</li>
                    <li><code className="rounded bg-muted px-1">LOCAL_V4_kernel</code> - local backbone IPv4</li>
                    <li><code className="rounded bg-muted px-1">MY_REGION</code> - region code</li>
                    <li><code className="rounded bg-muted px-1">MY_COUNTRY</code> - country code</li>
                    <li><code className="rounded bg-muted px-1">MY_NODE</code> - node id</li>
                  </ul>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="font-medium">Backbone</div>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><code className="rounded bg-muted px-1">BB_V6</code> - main backbone IPv6</li>
                    <li><code className="rounded bg-muted px-1">BB_V6_Prefix</code> - allocated backbone IPv6 prefix</li>
                    <li><code className="rounded bg-muted px-1">BB_OSPF_V6</code> - OSPF v6 source/prefix</li>
                    <li><code className="rounded bg-muted px-1">router id</code> - BIRD router id</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSaveSettings} disabled={saving}>
            {saving ? <Spinner className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  )
}
