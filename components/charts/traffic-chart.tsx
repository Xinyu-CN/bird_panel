'use client'

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'

interface TrafficChartProps {
  data: {
    time: string
    inbound: number
    outbound: number
  }[]
}

const chartConfig = {
  inbound: {
    label: '入站',
    color: 'var(--chart-1)',
  },
  outbound: {
    label: '出站',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig

export function TrafficChart({ data }: TrafficChartProps) {
  return (
    <ChartContainer config={chartConfig} className="h-[200px] w-full">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorInbound" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorOutbound" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis 
            dataKey="time" 
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10 }}
            className="fill-muted-foreground"
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => `${value}G`}
            className="fill-muted-foreground"
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            type="monotone"
            dataKey="inbound"
            stroke="var(--chart-1)"
            fillOpacity={1}
            fill="url(#colorInbound)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="outbound"
            stroke="var(--chart-2)"
            fillOpacity={1}
            fill="url(#colorOutbound)"
            strokeWidth={2}
          />
        </AreaChart>
    </ChartContainer>
  )
}
