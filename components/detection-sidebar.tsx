'use client'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { colorForClass } from '@/lib/tracker'
import { Camera, History } from 'lucide-react'

export type HistoryEntry = {
  id: string
  time: string
  label: string
  trackId: number
  score: number
}

type ClassCount = { label: string; count: number }

export function DetectionSidebar({
  classCounts,
  history,
}: {
  classCounts: ClassCount[]
  history: HistoryEntry[]
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Live breakdown</h2>
        </div>
        {classCounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No objects in frame.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {classCounts.map((c) => (
              <li
                key={c.label}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2 text-sm capitalize">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: colorForClass(c.label) }}
                    aria-hidden
                  />
                  {c.label}
                </span>
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                  {c.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Detection log</h2>
        </div>
        <Separator className="mb-2" />
        <ScrollArea className="h-64 pr-3">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              New tracked objects will appear here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="font-mono text-[10px]"
                    >
                      #{h.trackId}
                    </Badge>
                    <span className="capitalize">{h.label}</span>
                  </span>
                  <span className="flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
                    <span>{(h.score * 100).toFixed(0)}%</span>
                    <span>{h.time}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </Card>
    </div>
  )
}
