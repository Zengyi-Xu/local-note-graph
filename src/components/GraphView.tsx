import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { NOTE_TYPE_META, GRADE_META, GRADE_COLORS } from '@/types/note'
import type { Note } from '@/types/note'
import { extractLinks } from '@/types/note'

interface Props {
  notes: Note[]
  onOpenNote: (id: string) => void
  filters: Filters
  focusId: string | null
  onFocusChange: (id: string | null) => void
}

export interface Filters {
  types: Set<string> // empty = all
  grades: Set<string> // empty = all
  tags: Set<string> // empty = all
  search: string
}

interface SimNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

export function noteMatches(n: Note, f: Filters): boolean {
  if (f.types.size > 0 && !f.types.has(n.type)) return false
  if (f.grades.size > 0 && !(n.type === 'person' && f.grades.has(n.grade || 'none'))) return false
  if (f.tags.size > 0 && !n.tags.some((t) => f.tags.has(t))) return false
  if (f.search) {
    const q = f.search.toLowerCase()
    const hay = (n.title + ' ' + n.content + ' ' + n.tags.join(' ')).toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

export function GraphView({ notes, onOpenNote, filters, focusId, onFocusChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [hoverId, setHoverId] = useState<string | null>(null)
  const nodesRef = useRef<Map<string, SimNode>>(new Map())
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const [, forceTick] = useState(0)

  // 可见节点：先按筛选条件过滤
  const visible = useMemo(() => notes.filter((n) => noteMatches(n, filters)), [notes, filters])

  // 焦点模式：只保留与焦点节点 1 跳相连的节点
  const { shownIds, shownEdges } = useMemo(() => {
    let ids = new Set(visible.map((n) => n.id))
    const edgeSet = new Set<string>()
    const edges: { source: string; target: string }[] = []
    for (const n of notes) {
      for (const t of extractLinks(n.content)) {
        const o = notes.find((x) => x.title.toLowerCase() === t.toLowerCase())
        if (!o || o.id === n.id) continue
        const key = n.id < o.id ? `${n.id}|${o.id}` : `${o.id}|${n.id}`
        if (edgeSet.has(key)) continue
        edgeSet.add(key)
        edges.push({ source: n.id, target: o.id })
      }
    }
    if (focusId && ids.has(focusId)) {
      const neighbors = new Set([focusId])
      for (const e of edges) {
        if (e.source === focusId) neighbors.add(e.target)
        if (e.target === focusId) neighbors.add(e.source)
      }
      ids = new Set([...ids].filter((id) => neighbors.has(id)))
    }
    const kept = edges.filter((e) => ids.has(e.source) && ids.has(e.target))
    return { shownIds: ids, shownEdges: kept }
  }, [notes, visible, focusId])

  const shownNotes = useMemo(() => visible.filter((n) => shownIds.has(n.id)), [visible, shownIds])

  // 尺寸自适应
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      setSize({ w: rect.width, h: rect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 初始化新节点位置 & 移除消失节点
  useEffect(() => {
    const map = nodesRef.current
    for (const n of shownNotes) {
      if (!map.has(n.id)) {
        map.set(n.id, {
          id: n.id,
          x: size.w / 2 + (Math.random() - 0.5) * size.w * 0.6,
          y: size.h / 2 + (Math.random() - 0.5) * size.h * 0.6,
          vx: 0,
          vy: 0,
          r: 0,
        })
      }
    }
    for (const id of [...map.keys()]) {
      if (!shownIds.has(id)) map.delete(id)
    }
  }, [shownNotes, shownIds, size])

  // 力导向模拟
  useEffect(() => {
    let raf = 0
    const step = () => {
      const map = nodesRef.current
      const arr = [...map.values()]
      const cx = size.w / 2
      const cy = size.h / 2
      // 斥力
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i]
          const b = arr[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) {
            dx = Math.random() - 0.5
            dy = Math.random() - 0.5
            d2 = 1
          }
          const f = 2600 / d2
          const d = Math.sqrt(d2)
          const fx = (dx / d) * f
          const fy = (dy / d) * f
          a.vx -= fx
          a.vy -= fy
          b.vx += fx
          b.vy += fy
        }
      }
      // 引力（边）
      for (const e of shownEdges) {
        const a = map.get(e.source)
        const b = map.get(e.target)
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const f = (d - 120) * 0.004
        a.vx += (dx / d) * f * d * 0.05
        a.vy += (dy / d) * f * d * 0.05
        b.vx -= (dx / d) * f * d * 0.05
        b.vy -= (dy / d) * f * d * 0.05
      }
      // 向心 & 阻尼
      for (const n of arr) {
        if (dragRef.current?.id === n.id) continue
        n.vx += (cx - n.x) * 0.003
        n.vy += (cy - n.y) * 0.003
        n.vx *= 0.82
        n.vy *= 0.82
        n.x += Math.max(-12, Math.min(12, n.vx))
        n.y += Math.max(-12, Math.min(12, n.vy))
        n.x = Math.max(30, Math.min(size.w - 30, n.x))
        n.y = Math.max(30, Math.min(size.h - 30, n.y))
      }
      forceTick((t) => t + 1)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [shownEdges, size])

  const onPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    const svg = svgRef.current
    if (!svg) return
    const pt = svgPt(svg, e.clientX, e.clientY)
    const node = nodesRef.current.get(id)
    if (!node) return
    dragRef.current = { id, dx: pt.x - node.x, dy: pt.y - node.y }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const svg = svgRef.current
      const node = nodesRef.current.get(drag.id)
      if (!svg || !node) return
      const pt = svgPt(svg, e.clientX, e.clientY)
      node.x = pt.x - drag.dx
      node.y = pt.y - drag.dy
      node.vx = 0
      node.vy = 0
    },
    [],
  )

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  const map = nodesRef.current

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border bg-card">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* 边 */}
        {shownEdges.map((e, i) => {
          const a = map.get(e.source)
          const b = map.get(e.target)
          if (!a || !b) return null
          const active =
            hoverId === e.source || hoverId === e.target || focusId === e.source || focusId === e.target
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
              strokeOpacity={active ? 0.7 : 0.22}
              strokeWidth={active ? 1.8 : 1.2}
            />
          )
        })}
        {/* 节点 */}
        {shownNotes.map((n) => {
          const node = map.get(n.id)
          if (!node) return null
          const meta = NOTE_TYPE_META[n.type]
          const isFocus = n.id === focusId
          const isHover = n.id === hoverId
          const color = n.type === 'person' && n.grade ? GRADE_COLORS[n.grade] : meta.color
          const r = isFocus || isHover ? 13 : 10
          return (
            <g
              key={n.id}
              transform={`translate(${node.x},${node.y})`}
              className="cursor-pointer"
              onPointerDown={(e) => onPointerDown(e, n.id)}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => onOpenNote(n.id)}
              onDoubleClick={() => onFocusChange(isFocus ? null : n.id)}
            >
              <circle
                r={r + 5}
                fill="transparent"
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  onFocusChange(isFocus ? null : n.id)
                }}
              />
              <circle
                r={r}
                fill={color}
                fillOpacity={0.85}
                stroke={isFocus ? 'hsl(var(--primary))' : 'hsl(var(--background))'}
                strokeWidth={isFocus ? 3 : 1.5}
                style={{ transition: 'r 0.15s' }}
              />
              <text
                y={r + 14}
                textAnchor="middle"
                className="pointer-events-none fill-foreground"
                fontSize={11}
                style={{ userSelect: 'none' }}
              >
                {n.title.length > 14 ? n.title.slice(0, 13) + '…' : n.title}
              </text>
              {n.type === 'person' && n.grade && (
                <text
                  y={4}
                  textAnchor="middle"
                  className="pointer-events-none"
                  fontSize={8}
                  fill="#fff"
                  fontWeight={700}
                >
                  {(GRADE_META[n.grade] ?? '')[0]}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* 统计信息 */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
        显示 {shownNotes.length} / {notes.length} 篇笔记 · {shownEdges.length} 条连线
        {focusId && noteById.get(focusId) && (
          <span className="ml-2 text-primary">焦点：{noteById.get(focusId)!.title}（双击节点可取消）</span>
        )}
      </div>
    </div>
  )
}

function svgPt(svg: SVGSVGElement, x: number, y: number) {
  const pt = svg.createSVGPoint()
  pt.x = x
  pt.y = y
  return pt.matrixTransform(svg.getScreenCTM()!.inverse())
}
