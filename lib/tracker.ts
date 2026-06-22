// Lightweight centroid-based multi-object tracker.
// Assigns persistent IDs to detections across frames by matching
// the nearest centroid within a distance threshold. Objects that
// disappear for `maxMissing` frames are removed.

export type RawDetection = {
  bbox: [number, number, number, number] // x, y, width, height
  class: string
  score: number
}

export type TrackedObject = {
  id: number
  bbox: [number, number, number, number]
  class: string
  score: number
  centroid: [number, number]
  missing: number
  age: number // frames seen
}

function centroidOf(bbox: [number, number, number, number]): [number, number] {
  const [x, y, w, h] = bbox
  return [x + w / 2, y + h / 2]
}

function distance(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return Math.sqrt(dx * dx + dy * dy)
}

export class CentroidTracker {
  private objects: Map<number, TrackedObject> = new Map()
  private nextId = 1
  private maxMissing: number
  private maxDistance: number

  constructor(maxMissing = 12, maxDistance = 120) {
    this.maxMissing = maxMissing
    this.maxDistance = maxDistance
  }

  reset() {
    this.objects.clear()
    this.nextId = 1
  }

  get totalUniqueSeen() {
    // nextId - 1 reflects how many distinct IDs have ever been created
    return this.nextId - 1
  }

  update(detections: RawDetection[]): TrackedObject[] {
    const existing = Array.from(this.objects.values())

    // No prior objects: register everything new.
    if (existing.length === 0) {
      for (const det of detections) {
        this.register(det)
      }
      return this.activeList()
    }

    const unmatchedDetections = new Set(detections.map((_, i) => i))
    const matchedObjectIds = new Set<number>()

    // Build candidate matches sorted by distance (greedy nearest-neighbor).
    const candidates: { objId: number; detIdx: number; dist: number }[] = []
    for (const obj of existing) {
      detections.forEach((det, detIdx) => {
        const dist = distance(obj.centroid, centroidOf(det.bbox))
        if (dist <= this.maxDistance) {
          candidates.push({ objId: obj.id, detIdx, dist })
        }
      })
    }
    candidates.sort((a, b) => a.dist - b.dist)

    for (const c of candidates) {
      if (matchedObjectIds.has(c.objId)) continue
      if (!unmatchedDetections.has(c.detIdx)) continue
      // Assign detection to this object.
      const det = detections[c.detIdx]
      const obj = this.objects.get(c.objId)!
      obj.bbox = det.bbox
      obj.class = det.class
      obj.score = det.score
      obj.centroid = centroidOf(det.bbox)
      obj.missing = 0
      obj.age += 1
      matchedObjectIds.add(c.objId)
      unmatchedDetections.delete(c.detIdx)
    }

    // Unmatched existing objects: increment missing, drop if stale.
    for (const obj of existing) {
      if (!matchedObjectIds.has(obj.id)) {
        obj.missing += 1
        if (obj.missing > this.maxMissing) {
          this.objects.delete(obj.id)
        }
      }
    }

    // Unmatched detections become new objects.
    for (const detIdx of unmatchedDetections) {
      this.register(detections[detIdx])
    }

    return this.activeList()
  }

  private register(det: RawDetection) {
    const id = this.nextId++
    this.objects.set(id, {
      id,
      bbox: det.bbox,
      class: det.class,
      score: det.score,
      centroid: centroidOf(det.bbox),
      missing: 0,
      age: 1,
    })
  }

  private activeList(): TrackedObject[] {
    // Only surface objects currently visible (missing === 0).
    return Array.from(this.objects.values()).filter((o) => o.missing === 0)
  }
}

// Stable color per class label for bounding boxes.
const PALETTE = [
  '#34d399', // emerald
  '#60a5fa', // blue
  '#fbbf24', // amber
  '#f87171', // red
  '#c084fc', // purple
  '#22d3ee', // cyan
  '#f472b6', // pink
  '#a3e635', // lime
]

const colorCache = new Map<string, string>()

export function colorForClass(label: string): string {
  if (colorCache.has(label)) return colorCache.get(label)!
  let hash = 0
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  }
  const color = PALETTE[hash % PALETTE.length]
  colorCache.set(label, color)
  return color
}
