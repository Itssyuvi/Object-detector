'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  CentroidTracker,
  colorForClass,
  type RawDetection,
  type TrackedObject,
} from '@/lib/tracker'
import {
  Camera,
  CameraOff,
  Download,
  Loader2,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DetectionSidebar,
  type HistoryEntry,
} from '@/components/detection-sidebar'
import { StatsPanel } from '@/components/stats-panel'
import { BrandResults, type BrandItem } from '@/components/brand-results'

type Status = 'idle' | 'loading-model' | 'ready' | 'running' | 'error'

export function DetectionDashboard() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modelRef = useRef<any>(null)
  const trackerRef = useRef<CentroidTracker>(new CentroidTracker())
  const rafRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const runningRef = useRef(false)
  const thresholdRef = useRef(0.6)
  const seenIdsRef = useRef<Set<number>>(new Set())

  // FPS bookkeeping
  const lastFrameTime = useRef(performance.now())
  const fpsSamples = useRef<number[]>([])

  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [threshold, setThreshold] = useState(0.6)
  const [showLabels, setShowLabels] = useState(true)
  const [fps, setFps] = useState(0)
  const [inferenceMs, setInferenceMs] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [totalUnique, setTotalUnique] = useState(0)
  const [classCounts, setClassCounts] = useState<
    { label: string; count: number }[]
  >([])
  const [history, setHistory] = useState<HistoryEntry[]>([])

  // AI brand identification state.
  const [analyzing, setAnalyzing] = useState(false)
  const [brandItems, setBrandItems] = useState<BrandItem[]>([])
  const [brandError, setBrandError] = useState('')
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  useEffect(() => {
    thresholdRef.current = threshold
  }, [threshold])

  // Load the TensorFlow.js + COCO-SSD model once on mount.
  useEffect(() => {
    let cancelled = false
    async function loadModel() {
      try {
        setStatus('loading-model')
        const tf = await import('@tensorflow/tfjs')
        await tf.ready()
        // Prefer the WebGL backend for speed when available.
        try {
          await tf.setBackend('webgl')
        } catch {
          /* fall back to default backend */
        }
        await tf.ready()
        const cocoSsd = await import('@tensorflow-models/coco-ssd')
        // 'mobilenet_v2' is more accurate than the lite base.
        const model = await cocoSsd.load({ base: 'mobilenet_v2' })
        if (cancelled) return
        modelRef.current = model
        setStatus('ready')
      } catch (err) {
        console.log('[v0] model load error:', err)
        if (!cancelled) {
          setErrorMsg('Failed to load the detection model.')
          setStatus('error')
        }
      }
    }
    loadModel()
    return () => {
      cancelled = true
    }
  }, [])

  const stopLoop = useCallback(() => {
    runningRef.current = false
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const stopCamera = useCallback(() => {
    stopLoop()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }
    setStatus(modelRef.current ? 'ready' : 'idle')
    setActiveCount(0)
    setClassCounts([])
  }, [stopLoop])

  const drawFrame = useCallback(
    (objects: TrackedObject[]) => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (!canvas || !video) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      if (
        canvas.width !== video.videoWidth ||
        canvas.height !== video.videoHeight
      ) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const obj of objects) {
        const [x, y, w, h] = obj.bbox
        const color = colorForClass(obj.class)
        ctx.lineWidth = 3
        ctx.strokeStyle = color
        ctx.strokeRect(x, y, w, h)

        if (showLabels) {
          const label = `${obj.class} #${obj.id} ${(obj.score * 100).toFixed(0)}%`
          ctx.font =
            '600 15px ui-monospace, SFMono-Regular, Menlo, monospace'
          const textW = ctx.measureText(label).width
          const padX = 6
          const boxH = 22
          const labelY = y - boxH < 0 ? y : y - boxH
          ctx.fillStyle = color
          ctx.fillRect(x, labelY, textW + padX * 2, boxH)
          ctx.fillStyle = '#0b1220'
          ctx.fillText(label, x + padX, labelY + 16)
        }
      }
    },
    [showLabels],
  )

  const detectLoop = useCallback(async () => {
    const model = modelRef.current
    const video = videoRef.current
    if (!model || !video || !runningRef.current) return

    if (video.readyState >= 2) {
      const t0 = performance.now()
      let predictions: any[] = []
      try {
        // Detect up to 40 boxes; minScore lets coco-ssd return more candidates
        // which we then filter with the user's confidence threshold.
        predictions = await model.detect(video, 40, 0.25)
      } catch (err) {
        console.log('[v0] detect error:', err)
      }
      const t1 = performance.now()

      const raw: RawDetection[] = predictions
        .filter((p) => p.score >= thresholdRef.current)
        .map((p) => ({
          bbox: p.bbox as [number, number, number, number],
          class: p.class,
          score: p.score,
        }))

      const tracked = trackerRef.current.update(raw)
      drawFrame(tracked)

      // Stats
      setActiveCount(tracked.length)
      setTotalUnique(trackerRef.current.totalUniqueSeen)
      setInferenceMs(t1 - t0)

      const counts = new Map<string, number>()
      for (const obj of tracked) {
        counts.set(obj.class, (counts.get(obj.class) ?? 0) + 1)
      }
      setClassCounts(
        Array.from(counts.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count),
      )

      // Log newly-seen track IDs to history.
      const newEntries: HistoryEntry[] = []
      for (const obj of tracked) {
        if (!seenIdsRef.current.has(obj.id)) {
          seenIdsRef.current.add(obj.id)
          newEntries.push({
            id: `${obj.id}-${Date.now()}`,
            time: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            label: obj.class,
            trackId: obj.id,
            score: obj.score,
          })
        }
      }
      if (newEntries.length > 0) {
        setHistory((prev) => [...newEntries.reverse(), ...prev].slice(0, 100))
      }

      // FPS smoothing over last 20 frames.
      const now = performance.now()
      const delta = now - lastFrameTime.current
      lastFrameTime.current = now
      if (delta > 0) {
        fpsSamples.current.push(1000 / delta)
        if (fpsSamples.current.length > 20) fpsSamples.current.shift()
        const avg =
          fpsSamples.current.reduce((a, b) => a + b, 0) /
          fpsSamples.current.length
        setFps(avg)
      }
    }

    rafRef.current = requestAnimationFrame(detectLoop)
  }, [drawFrame])

  const startCamera = useCallback(async () => {
    if (!modelRef.current) return

    // getUserMedia requires a secure context and browser support.
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      const inIframe = typeof window !== 'undefined' && window.self !== window.top
      setErrorMsg(
        inIframe
          ? 'Camera access is blocked inside this embedded preview. Open the app in a new browser tab to use your camera.'
          : 'This browser does not support camera access (getUserMedia is unavailable). Make sure you are on HTTPS or localhost.',
      )
      setStatus('error')
      return
    }

    // Try the rear camera first, then fall back to any available camera.
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: 'environment' } }, audio: false },
      { video: true, audio: false },
    ]

    let stream: MediaStream | null = null
    let lastErr: unknown = null
    for (const constraints of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        break
      } catch (err) {
        lastErr = err
        // OverconstrainedError -> try the next, looser constraint.
        // Permission/hardware errors won't be fixed by retrying, so stop.
        const name = (err as DOMException)?.name
        if (name !== 'OverconstrainedError' && name !== 'NotFoundError') break
      }
    }

    if (!stream) {
      console.log('[v0] camera error:', lastErr)
      const name = (lastErr as DOMException)?.name
      const inIframe =
        typeof window !== 'undefined' && window.self !== window.top
      let message = 'Could not access the camera. Please try again.'
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        message = inIframe
          ? 'Camera permission was blocked. This embedded preview may not allow camera access — open the app in a new tab, then allow the camera prompt.'
          : 'Camera permission was denied. Click the camera icon in your browser address bar to allow access, then try again.'
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        message = 'No camera was found on this device.'
      } else if (name === 'NotReadableError') {
        message =
          'The camera is already in use by another app or tab. Close it and try again.'
      }
      setErrorMsg(message)
      setStatus('error')
      return
    }

    try {
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()

      trackerRef.current.reset()
      seenIdsRef.current.clear()
      setHistory([])
      setStatus('running')
      runningRef.current = true
      lastFrameTime.current = performance.now()
      fpsSamples.current = []
      rafRef.current = requestAnimationFrame(detectLoop)
    } catch (err) {
      console.log('[v0] camera play error:', err)
      stream.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setErrorMsg('Could not start the camera stream. Please try again.')
      setStatus('error')
    }
  }, [detectLoop])

  const captureScreenshot = useCallback(() => {
    const video = videoRef.current
    const overlay = canvasRef.current
    if (!video || !overlay) return
    const out = document.createElement('canvas')
    out.width = video.videoWidth
    out.height = video.videoHeight
    const ctx = out.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, out.width, out.height)
    ctx.drawImage(overlay, 0, 0, out.width, out.height)
    const url = out.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `detection-${Date.now()}.png`
    a.click()
  }, [])

  const identifyBrands = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return

    // Downscale the frame to keep the payload small and fast to analyze.
    const maxW = 768
    const scale = Math.min(1, maxW / video.videoWidth)
    const frame = document.createElement('canvas')
    frame.width = Math.round(video.videoWidth * scale)
    frame.height = Math.round(video.videoHeight * scale)
    const ctx = frame.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, frame.width, frame.height)
    const image = frame.toDataURL('image/jpeg', 0.85)

    setAnalyzing(true)
    setBrandError('')
    setHasAnalyzed(true)
    try {
      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Analysis failed.')
      setBrandItems(Array.isArray(data.items) ? data.items : [])
    } catch (err) {
      console.log('[v0] identify request error:', err)
      setBrandItems([])
      setBrandError(
        err instanceof Error
          ? err.message
          : 'Could not analyze the frame. Please try again.',
      )
    } finally {
      setAnalyzing(false)
    }
  }, [])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      runningRef.current = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const isRunning = status === 'running'
  const modelReady = status === 'ready' || status === 'running'

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <StatsPanel
          fps={fps}
          activeCount={activeCount}
          totalUnique={totalUnique}
          inferenceMs={inferenceMs}
        />

        <Card className="overflow-hidden p-0">
          <div className="relative aspect-video w-full bg-black">
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-contain"
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full object-contain"
            />

            {/* Status overlays */}
            {!isRunning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-center">
                {status === 'loading-model' && (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Loading detection model…
                    </p>
                  </>
                )}
                {status === 'error' && (
                  <>
                    <CameraOff className="h-8 w-8 text-destructive" />
                    <p className="max-w-xs text-sm text-destructive">
                      {errorMsg}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setStatus(modelRef.current ? 'ready' : 'idle')
                          setErrorMsg('')
                          startCamera()
                        }}
                        className="gap-2"
                      >
                        <Camera className="h-4 w-4" />
                        Try again
                      </Button>
                      {typeof window !== 'undefined' &&
                        window.self !== window.top && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              window.open(window.location.href, '_blank')
                            }
                          >
                            Open in new tab
                          </Button>
                        )}
                    </div>
                  </>
                )}
                {(status === 'ready' || status === 'idle') && (
                  <>
                    <Video className="h-8 w-8 text-primary" />
                    <p className="text-sm text-muted-foreground">
                      {modelReady
                        ? 'Model ready. Start the camera to begin detection.'
                        : 'Preparing…'}
                    </p>
                  </>
                )}
              </div>
            )}

            {isRunning && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 backdrop-blur">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
                </span>
                <span className="text-xs font-medium text-white">LIVE</span>
              </div>
            )}
          </div>
        </Card>

        {/* Controls */}
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {!isRunning ? (
              <Button
                onClick={startCamera}
                disabled={!modelReady}
                className="gap-2"
              >
                <Camera className="h-4 w-4" />
                Start camera
              </Button>
            ) : (
              <Button
                onClick={stopCamera}
                variant="secondary"
                className="gap-2"
              >
                <CameraOff className="h-4 w-4" />
                Stop
              </Button>
            )}
            <Button
              onClick={identifyBrands}
              disabled={!isRunning || analyzing}
              className="gap-2"
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {analyzing ? 'Analyzing…' : 'Identify brands'}
            </Button>
            <Button
              onClick={captureScreenshot}
              variant="outline"
              disabled={!isRunning}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Screenshot
            </Button>
            <Button
              onClick={() => setHistory([])}
              variant="outline"
              disabled={history.length === 0}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Clear log
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium" htmlFor="conf">
                  Confidence threshold
                </label>
                <Badge variant="secondary" className="font-mono">
                  {(threshold * 100).toFixed(0)}%
                </Badge>
              </div>
              <Slider
                id="conf"
                min={0.2}
                max={0.9}
                step={0.05}
                value={[threshold]}
                onValueChange={(v) => setThreshold(v[0])}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <label className="text-sm font-medium" htmlFor="labels">
                Show labels & IDs
              </label>
              <Switch
                id="labels"
                checked={showLabels}
                onCheckedChange={setShowLabels}
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <BrandResults
          analyzing={analyzing}
          items={brandItems}
          error={brandError}
          hasRun={hasAnalyzed}
        />
        <DetectionSidebar classCounts={classCounts} history={history} />
      </div>
    </div>
  )
}
