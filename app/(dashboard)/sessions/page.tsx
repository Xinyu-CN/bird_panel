'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Layers, RefreshCw, Trash2 } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { BGPSessionWithRelations } from '@/types'

function formatSessionType(type: BGPSessionWithRelations['session_type']) {
  if (type === 'ibgp') return 'iBGP'
  if (type === 'rr') return 'RR Client'
  return type
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<BGPSessionWithRelations[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sessions', { cache: 'no-store' })
      const result = await response.json()
      if (result.success) {
        setSessions(result.data)
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSessions()
  }, [fetchSessions])

  const handleDelete = async (sessionId: number) => {
    if (!confirm('删除这条 BGP Session 吗？')) {
      return
    }

    try {
      const response = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete session')
      }
      await fetchSessions()
    } catch (error) {
      console.error('Failed to delete session:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete session')
    }
  }

  return (
    <div className="flex flex-col">
      <Header title="BGP Sessions" description="全局查看所有 BGP 会话，支持 IX / 内网 / Tunnel 三种承载方式。" />
      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">共 {sessions.length} 条 Session</div>
          <Button variant="outline" onClick={() => void fetchSessions()} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            刷新
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-8 w-8" />
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Layers className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">还没有 BGP Session</p>
                <p className="text-sm text-muted-foreground">请到任意节点详情页创建 Session。</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {sessions.map((session) => (
              <Card key={session.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {session.peer_name || session.peer_server?.name || `AS${session.peer_asn}`}
                      </CardTitle>
                      <CardDescription>
                        <Link href={`/servers/${session.server.id}`} className="hover:underline">
                          {session.server.name}
                        </Link>
                        {session.peer_server && (
                          <>
                            {' -> '}
                            <Link href={`/servers/${session.peer_server.id}`} className="hover:underline">
                              {session.peer_server.name}
                            </Link>
                          </>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => void handleDelete(session.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{formatSessionType(session.session_type)}</Badge>
                    <Badge variant="outline">{session.transport_mode}</Badge>
                    <Badge variant="outline">{session.address_family}</Badge>
                    {session.ix_name && <Badge variant="secondary">{session.ix_name}</Badge>}
                    {session.tunnel && <Badge variant="secondary">{session.tunnel.name || `Tunnel #${session.tunnel.id}`}</Badge>}
                    <Badge
                      className={cn(
                        session.status === 'established'
                          ? 'bg-status-online/20 text-status-online'
                          : session.status === 'error'
                            ? 'bg-destructive/20 text-destructive'
                            : 'bg-status-pending/20 text-status-pending',
                      )}
                    >
                      {session.status}
                    </Badge>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 text-sm">
                    <div className="space-y-1">
                      <p className="font-medium">Local</p>
                      <p className="text-muted-foreground">IPv4: {session.local_ipv4 || '-'}</p>
                      <p className="text-muted-foreground">IPv6: {session.local_ipv6 || '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">Remote</p>
                      <p className="text-muted-foreground">ASN: AS{session.peer_asn}</p>
                      <p className="text-muted-foreground">IPv4: {session.peer_ipv4 || '-'}</p>
                      <p className="text-muted-foreground">IPv6: {session.peer_ipv6 || '-'}</p>
                    </div>
                  </div>
                  {(session.description || session.source) && (
                    <p className="text-xs text-muted-foreground">
                      {[session.description, session.source].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
