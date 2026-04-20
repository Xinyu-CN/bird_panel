'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    setLoading(true)

    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" className="w-full justify-start" onClick={handleLogout} disabled={loading}>
      <LogOut className="mr-2 h-4 w-4" />
      {loading ? '退出中...' : '退出登录'}
    </Button>
  )
}
