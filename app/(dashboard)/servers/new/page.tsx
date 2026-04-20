import { Header } from '@/components/dashboard/header'
import { ServerForm } from '@/components/servers/server-form'

export default function NewServerPage() {
  return (
    <div className="flex flex-col">
      <Header 
        title="添加服务器" 
        description="添加新的 POP 节点到网络中" 
      />

      <div className="flex-1 p-6">
        <div className="mx-auto max-w-3xl">
          <ServerForm mode="create" />
        </div>
      </div>
    </div>
  )
}
