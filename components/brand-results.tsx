'use client'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Loader2, ScanSearch, Sparkles, Tag } from 'lucide-react'

export type BrandItem = {
  object: string
  brand: string
  detail: string
  confidence: number
}

export function BrandResults({
  analyzing,
  items,
  error,
  hasRun,
}: {
  analyzing: boolean
  items: BrandItem[]
  error: string
  hasRun: boolean
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">AI brand identification</h2>
      </div>

      {analyzing && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Analyzing the current frame…
        </div>
      )}

      {!analyzing && error && (
        <p className="py-4 text-sm text-destructive">{error}</p>
      )}

      {!analyzing && !error && !hasRun && (
        <p className="flex items-start gap-2 py-2 text-sm text-muted-foreground">
          <ScanSearch className="mt-0.5 h-4 w-4 shrink-0" />
          Press “Identify brands” while the camera is running to detect object
          names and brands in the current frame.
        </p>
      )}

      {!analyzing && !error && hasRun && items.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">
          No recognizable objects were found in that frame.
        </p>
      )}

      {!analyzing && items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li
              key={`${item.object}-${i}`}
              className="rounded-md border border-border bg-secondary/40 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium capitalize text-foreground">
                  {item.object}
                </span>
                <Badge
                  variant="secondary"
                  className="font-mono text-[11px]"
                  title="Brand confidence"
                >
                  {Math.round(item.confidence * 100)}%
                </Badge>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm">
                <Tag className="h-3.5 w-3.5 text-primary" />
                <span
                  className={
                    item.brand.toLowerCase() === 'unknown'
                      ? 'text-muted-foreground'
                      : 'font-semibold text-primary'
                  }
                >
                  {item.brand}
                </span>
              </div>
              {item.detail && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {item.detail}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
