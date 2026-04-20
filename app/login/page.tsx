import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'
import { SetupForm } from '@/components/auth/setup-form'
import { getCurrentUserFromCookies } from '@/lib/auth/session'
import { db } from '@/lib/db'

export default async function LoginPage() {
  const currentUser = await getCurrentUserFromCookies()

  if (currentUser) {
    redirect('/')
  }

  const userCount = await db.getUserCount()
  const isEmptyDatabase = userCount === 0

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.2),transparent_35%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40" />
      <div className="relative z-10 flex w-full max-w-5xl items-center justify-between gap-10">
        <div className="hidden max-w-xl space-y-5 lg:block">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-300/80">BIRD Panel</p>
          <h1 className="text-5xl font-semibold leading-tight text-white">
            先登录，再进入网络面板
          </h1>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300 backdrop-blur">
            <p>数据库文件：`data/panel.sqlite`</p>
          </div>
        </div>
        {isEmptyDatabase ? <SetupForm /> : <LoginForm />}
      </div>
    </div>
  )
}
