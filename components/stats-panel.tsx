'use client'

import { Card } from '@/components/ui/card'
import { Activity, Gauge, Layers, ScanEye } from 'lucide-react'

type StatsPanelProps = {
  fps: number
  activeCount: number
  totalUnique: number
  inferenceMs: number
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <Card className="flex flex-row items-center gap-3 p-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
          accent
            ? 'bg-primary/15 text-primary'
            : 'bg-secondary text-muted-foreground'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="font-mono text-xl font-semibold tabular-nums text-foreground">
          {value}
        </p>
      </div>
    </Card>
  )
}

export function StatsPanel({
  fps,
  activeCount,
  totalUnique,
  inferenceMs,
}: StatsPanelProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        icon={<Gauge className="h-5 w-5" />}
        label="FPS"
        value={fps.toFixed(0)}
        accent
      />
      <Stat
        icon={<ScanEye className="h-5 w-5" />}
        label="In frame"
        value={activeCount.toString()}
      />
      <Stat
        icon={<Layers className="h-5 w-5" />}
        label="Tracked IDs"
        value={totalUnique.toString()}
      />
      <Stat
        icon={<Activity className="h-5 w-5" />}
        label="Inference"
        value={`${inferenceMs.toFixed(0)}ms`}
      />
    </div>
  )
}
