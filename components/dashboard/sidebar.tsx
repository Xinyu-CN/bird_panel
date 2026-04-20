'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  GitBranch,
  Globe,
  Layers,
  Network,
  Server,
  Settings,
  Users,
} from 'lucide-react'
import { LogoutButton } from '@/components/auth/logout-button'
import { cn } from '@/lib/utils'
import type { SafeUser } from '@/types'

const navigation = [
  { name: '监控大屏', href: '/', icon: Globe },
  { name: '服务器', href: '/servers', icon: Server },
  { name: '网络拓扑', href: '/topology', icon: Network },
  { name: '隧道管理', href: '/tunnels', icon: GitBranch },
  { name: 'BGP Sessions', href: '/sessions', icon: Layers },
  { name: '告警中心', href: '/alerts', icon: AlertTriangle },
  { name: '系统设置', href: '/settings', icon: Settings },
]

interface SidebarProps {
  currentUser: SafeUser
}

export function Sidebar({ currentUser }: SidebarProps) {
  const pathname = usePathname()
  const items = currentUser.can_manage_users
    ? [...navigation, { name: '用户管理', href: '/users', icon: Users }]
    : navigation

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <Activity className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-sidebar-foreground">BIRD Panel</span>
          <span className="text-xs text-muted-foreground">登录后方可使用面板</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5', isActive && 'text-sidebar-primary')} />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="space-y-3 border-t border-sidebar-border p-4">
        <div className="rounded-lg bg-sidebar-accent px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-status-online" />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-sidebar-foreground">
                {currentUser.display_name || currentUser.username}
              </span>
              <span className="text-xs text-muted-foreground">
                {currentUser.can_manage_users ? '可创建账号' : '普通成员'}
              </span>
            </div>
          </div>
        </div>
        <LogoutButton />
      </div>
    </aside>
  )
}
