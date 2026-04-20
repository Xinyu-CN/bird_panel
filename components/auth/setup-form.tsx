'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ShieldPlus, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SetupForm() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          display_name: displayName,
          password,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        setError(result.error || '初始化管理员失败')
        return
      }

      router.push('/login')
      router.refresh()
    } catch {
      setError('初始化管理员失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl text-white">
          <ShieldPlus className="h-6 w-6" />
          初始化管理员
        </CardTitle>
        <CardDescription>当前数据库为空，请先创建第一个管理员账号。</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="username">用户名</Label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="username"
                className="pl-9"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="请输入管理员用户名"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display_name">显示名</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="例如 系统管理员"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位"
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '创建中...' : '创建首个管理员'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
