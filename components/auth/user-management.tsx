'use client'

import { FormEvent, useEffect, useState } from 'react'
import { KeyRound, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SafeUser, UserRole } from '@/types'

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: 'member', label: '普通成员' },
  { value: 'admin', label: '管理员' },
]

interface UserManagementProps {
  currentUser: SafeUser
}

export function UserManagement({ currentUser }: UserManagementProps) {
  const [users, setUsers] = useState<SafeUser[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    username: '',
    display_name: '',
    password: '',
    role: 'member' as UserRole,
    can_manage_users: false,
  })

  const loadUsers = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/users')
      const result = await response.json()

      if (!response.ok || !result.success) {
        setError(result.error || '加载用户列表失败')
        return
      }

      setUsers(result.data)
    } catch {
      setError('加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        setError(result.error || '创建用户失败')
        return
      }

      setSuccess(`用户 ${result.data.username} 创建成功`)
      setForm({
        username: '',
        display_name: '',
        password: '',
        role: 'member',
        can_manage_users: false,
      })
      await loadUsers()
    } catch {
      setError('创建用户失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleChangePassword = async (user: SafeUser) => {
    const nextPassword = window.prompt(`为 ${user.username} 设置新密码（至少 8 位）`)
    if (!nextPassword) {
      return
    }

    setError('')
    setSuccess('')

    const response = await fetch(`/api/auth/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: nextPassword }),
    })
    const result = await response.json()

    if (!response.ok || !result.success) {
      setError(result.error || '修改密码失败')
      return
    }

    setSuccess(`已更新 ${user.username} 的密码`)
  }

  const handleDelete = async (user: SafeUser) => {
    if (!window.confirm(`确定删除用户 ${user.username} 吗？此操作不可撤销。`)) {
      return
    }

    setError('')
    setSuccess('')

    const response = await fetch(`/api/auth/users/${user.id}`, {
      method: 'DELETE',
    })
    const result = await response.json()

    if (!response.ok || !result.success) {
      setError(result.error || '删除用户失败')
      return
    }

    setSuccess(`已删除用户 ${user.username}`)
    await loadUsers()
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">用户管理</h1>
        <p className="text-sm text-muted-foreground">
          当前登录用户：{currentUser.display_name || currentUser.username}。只有具备注册权限的账号才能创建、改密和删除用户。
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>已有账号</CardTitle>
            <CardDescription>这些账号现在会持久化写入 SQLite 数据库，不再随着服务重启丢失。</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">正在加载用户列表...</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前还没有用户。</p>
            ) : (
              <div className="space-y-3">
                {users.map((user) => (
                  <div key={user.id} className="rounded-xl border border-border/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{user.display_name || user.username}</div>
                        <div className="text-sm text-muted-foreground">@{user.username}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role}</Badge>
                        {user.can_manage_users && <Badge variant="outline">可注册</Badge>}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => void handleChangePassword(user)}>
                        <KeyRound className="mr-2 h-4 w-4" />
                        修改密码
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDelete(user)}
                        disabled={user.id === currentUser.id}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        删除用户
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>注册新用户</CardTitle>
            <CardDescription>新账号会直接写入 SQLite，并立即可用于登录。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="username">用户名</Label>
                <Input
                  id="username"
                  value={form.username}
                  onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                  placeholder="例如 ops-admin"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="display_name">显示名</Label>
                <Input
                  id="display_name"
                  value={form.display_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, display_name: event.target.value }))}
                  placeholder="例如 运维管理员"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">初始密码</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="至少 8 位"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">角色</Label>
                <select
                  id="role"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  value={form.role}
                  onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as UserRole }))}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-3 rounded-lg border border-border/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.can_manage_users}
                  onChange={(event) => setForm((prev) => ({ ...prev, can_manage_users: event.target.checked }))}
                />
                允许该账号继续创建新用户
              </label>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && <p className="text-sm text-status-online">{success}</p>}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? '创建中...' : '创建用户'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
