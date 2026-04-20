import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { getCurrentUserFromCookies } from '@/lib/auth/session'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const currentUser = await getCurrentUserFromCookies()

  if (!currentUser) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar currentUser={currentUser} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
