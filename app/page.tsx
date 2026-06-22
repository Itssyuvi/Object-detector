import { DetectionDashboard } from '@/components/detection-dashboard'
import { ScanEye } from 'lucide-react'

export default function Page() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
              <ScanEye className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">
                Object Detection & Tracking
              </h1>
              <p className="text-xs text-muted-foreground">
                Real-time in-browser detection with persistent object IDs
              </p>
            </div>
          </div>
          <span className="hidden rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground sm:inline">
            COCO-SSD · TensorFlow.js
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6">
        <DetectionDashboard />
      </section>
    </main>
  )
}
