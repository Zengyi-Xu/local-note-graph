import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { NOTE_TYPE_META, GRADE_META, GRADE_COLORS } from '@/types/note'
import type { Note } from '@/types/note'
import { extractLinks } from '@/types/note'

// 多维分类：标签前缀 -> 维度颜色
const DIM_META: Record<string, { label: string; color: string }> = {
  功能: { label: '功能', color: '#3b82f6' },
  材料: { label: '材料', color: '#22c55e' },
  器件: { label: '器件', color: '#f97316' },
}
const DIM_ORDER = ['功能', '材料', '器件']

// 聚焦景深：按到焦点的跳数决定模糊档位与不透明度
const HOP_OPACITY = [1, 0.88, 0.62, 0.4]

function blurLevel(hop: number | undefined): number {
  if (hop === undefined) return 3
  if (hop <= 1) return 0
  return Math.min(hop - 1, 3)
}

function noteDims(n: Note): string[] {
  const dims = new Set<string>()
  for (const t of n.tags) {
    const i = t.indexOf(':')
    if (i > 0) {
      const p = t.slice(0, i)
      if (DIM_META[p]) dims.add(p)
    }
  }
  return DIM_ORDER.filter((d) => dims.has(d))
}

function sectorPath(r1: number, r2: number, a0: number, a1: number): string {
  const p0 = [r1 * Math.cos(a0), r1 * Math.sin(a0)]
  const p1 = [r1 * Math.cos(a1), r1 * Math.sin(a1)]
  const p2 = [r2 * Math.cos(a1), r2 * Math.sin(a1)]
  const p3 = [r2 * Math.cos(a0), r2 * Math.sin(a0)]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const f = (v: number) => v.toFixed(3)
  return `M ${f(p0[0])} ${f(p0[1])} A ${r1} ${r1} 0 ${large} 1 ${f(p1[0])} ${f(p1[1])} L ${f(p2[0])} ${f(p2[1])} A ${r2} ${r2} 0 ${large} 0 ${f(p3[0])} ${f(p3[1])} Z`
}

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
  if (f.tags.size > 0) {
    // 交集筛选：按标签前缀分组，同一前缀（同一维度）内满足任一即可，不同前缀之间须同时满足
    const groups = new Map<string, Set<string>>()
    for (const t of f.tags) {
      const i = t.indexOf(':')
      const key = i >= 0 ? t.slice(0, i) : ''
      if (!groups.has(key)) groups.set(key, new Set())
      groups.get(key)!.add(t)
    }
    for (const g of groups.values()) {
      if (!n.tags.some((t) => g.has(t))) return false
    }
  }
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
  const dragRef = useRef<{ id: string; dx: number; dy: number; sx: number; sy: number } | null>(null)
  const movedRef = useRef(false)
  const [, forceTick] = useState(0)
  const [simNonce, setSimNonce] = useState(0)

  // 可见节点：先按筛选条件过滤
  const visible = useMemo(() => notes.filter((n) => noteMatches(n, filters)), [notes, filters])

  // 边 + 聚焦跳数。聚焦时不再隐藏节点，而是按到焦点的跳数逐层虚化
  const { shownIds, shownEdges, hopById } = useMemo(() => {
    const ids = new Set(visible.map((n) => n.id))
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
    const kept = edges.filter((e) => ids.has(e.source) && ids.has(e.target))
    const hop = new Map<string, number>()
    if (focusId && ids.has(focusId)) {
      hop.set(focusId, 0)
      let frontier = [focusId]
      let depth = 0
      while (frontier.length > 0) {
        depth += 1
        const next: string[] = []
        for (const id of frontier) {
          for (const e of kept) {
            let other: string | null = null
            if (e.source === id) other = e.target
            else if (e.target === id) other = e.source
            if (other && ids.has(other) && !hop.has(other)) {
              hop.set(other, depth)
              next.push(other)
            }
          }
        }
        frontier = next
      }
    }
    return { shownIds: ids, shownEdges: kept, hopById: hop }
  }, [notes, visible, focusId])

  const shownNotes = useMemo(() => visible.filter((n) => shownIds.has(n.id)), [visible, shownIds])
  const focusActive = Boolean(focusId)

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
      let maxV = 0
      for (const n of arr) maxV = Math.max(maxV, Math.abs(n.vx), Math.abs(n.vy))
      forceTick((t) => t + 1)
      // 速度足够小就停住，避免节点持续漂移导致难以点中
      if (maxV > 0.05) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [shownEdges, size, simNonce])

  const onPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    const svg = svgRef.current
    if (!svg) return
    const pt = svgPt(svg, e.clientX, e.clientY)
    const node = nodesRef.current.get(id)
    if (!node) return
    movedRef.current = false
    dragRef.current = { id, dx: pt.x - node.x, dy: pt.y - node.y, sx: pt.x, sy: pt.y }
    setSimNonce((v) => v + 1)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const svg = svgRef.current
    const node = nodesRef.current.get(drag.id)
    if (!svg || !node) return
    const pt = svgPt(svg, e.clientX, e.clientY)
    // 位移超过阈值即视为拖动，松手后不会触发点击
    if (!movedRef.current && Math.hypot(pt.x - drag.sx, pt.y - drag.sy) > 4) movedRef.current = true
    node.x = pt.x - drag.dx
    node.y = pt.y - drag.dy
    node.vx = 0
    node.vy = 0
  }, [])

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
        onClick={(e) => {
          if (e.target === svgRef.current) onFocusChange(null)
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <filter id="kgblur1" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.1" />
          </filter>
          <filter id="kgblur2" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.1" />
          </filter>
          <filter id="kgblur3" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        </defs>

        {/* 边 */}
        {shownEdges.map((e, i) => {
          const a = map.get(e.source)
          const b = map.get(e.target)
          if (!a || !b) return null
          const active =
            hoverId === e.source || hoverId === e.target || focusId === e.source || focusId === e.target
          const nearFocus =
            focusActive && (hopById.get(e.source) ?? 9) <= 1 && (hopById.get(e.target) ?? 9) <= 1
          const opacity = focusActive ? (nearFocus ? 0.6 : 0.07) : active ? 0.7 : 0.22
          const width = focusActive ? (nearFocus ? 1.6 : 1) : active ? 1.8 : 1.2
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
              strokeOpacity={opacity}
              strokeWidth={width}
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
          const dims = noteDims(n)
          const lvl = focusActive ? blurLevel(hopById.get(n.id)) : 0
          return (
            <g
              key={n.id}
              transform={`translate(${node.x},${node.y})`}
              className="cursor-pointer"
              opacity={focusActive ? HOP_OPACITY[lvl] : 1}
              filter={lvl > 0 ? `url(#kgblur${lvl})` : undefined}
              onPointerDown={(e) => onPointerDown(e, n.id)}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => {
                if (movedRef.current) return
                // 未选中 → 选中并聚焦；已选中 → 打开笔记
                if (isFocus) onOpenNote(n.id)
                else onFocusChange(n.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                if (movedRef.current) return
                onFocusChange(isFocus ? null : n.id)
              }}
            >
              <circle r={r + 7} fill="transparent" />
              <circle
                r={r}
                fill={color}
                fillOpacity={0.85}
                stroke={isFocus ? 'hsl(var(--primary))' : 'hsl(var(--background))'}
                strokeWidth={isFocus ? 3 : 1.5}
                style={{ transition: 'r 0.15s' }}
              />
              {dims.length === 1 && (
                <circle r={r + 4} fill="none" stroke={DIM_META[dims[0]].color} strokeWidth={4} />
              )}
              {dims.length > 1 && (
                <g>
                  {dims.map((d, i) => {
                    const a0 = (i / dims.length) * 2 * Math.PI - Math.PI / 2
                    const a1 = ((i + 1) / dims.length) * 2 * Math.PI - Math.PI / 2
                    return (
                      <path
                        key={d}
                        d={sectorPath(r + 2, r + 6, a0, a1)}
                        fill={DIM_META[d].color}
                        fillOpacity={0.9}
                      />
                    )
                  })}
                </g>
              )}
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
          <span className="ml-2 text-primary">
            焦点：{noteById.get(focusId)!.title}（再次单击可打开，单击空白处取消）
          </span>
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
