import { redirect } from 'next/navigation'
import { UserManagement } from '@/components/auth/user-management'
import { getCurrentUserFromCookies } from '@/lib/auth/session'

export default async function UsersPage() {
  const currentUser = await getCurrentUserFromCookies()

  if (!currentUser) {
    redirect('/login')
  }

  if (!currentUser.can_manage_users) {
    redirect('/')
  }

  return <UserManagement currentUser={currentUser} />
}
