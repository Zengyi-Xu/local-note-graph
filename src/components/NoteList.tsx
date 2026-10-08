import { useMemo, useState } from 'react'
import { NOTE_TYPE_META, GRADE_META } from '@/types/note'
import type { Note } from '@/types/note'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Search } from 'lucide-react'

interface Props {
  notes: Note[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
}

export function NoteList({ notes, activeId, onSelect, onCreate }: Props) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    const list = query
      ? notes.filter((n) => (n.title + n.content + n.tags.join(' ')).toLowerCase().includes(query))
      : notes
    // 按类型分组，组内按更新时间倒序
    const groups = new Map<string, Note[]>()
    for (const n of list) {
      const g = groups.get(n.type) ?? []
      g.push(n)
      groups.set(n.type, g)
    }
    for (const g of groups.values()) g.sort((a, b) => b.updatedAt - a.updatedAt)
    return [...groups.entries()].sort(
      (a, b) =>
        Object.keys(NOTE_TYPE_META).indexOf(a[0]) - Object.keys(NOTE_TYPE_META).indexOf(b[0]),
    )
  }, [notes, q])

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索笔记…" className="pl-8" />
        </div>
        <Button onClick={onCreate} className="w-full" size="sm">
          <Plus className="mr-1 h-4 w-4" /> 新建笔记
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.map(([type, items]) => (
          <div key={type} className="mb-3">
            <div className="mb-1 flex items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: NOTE_TYPE_META[type as keyof typeof NOTE_TYPE_META].color }} />
              {NOTE_TYPE_META[type as keyof typeof NOTE_TYPE_META].label}
              <span className="text-muted-foreground/60">({items.length})</span>
            </div>
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => onSelect(n.id)}
                className={`mb-0.5 block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  n.id === activeId ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-muted'
                }`}
              >
                <div className="truncate">{n.title}</div>
                <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                  {n.type === 'person' && n.grade && (
                    <span>[{GRADE_META[n.grade as keyof typeof GRADE_META]}]</span>
                  )}
                  {n.tags.slice(0, 3).map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">没有匹配的笔记</p>
        )}
      </div>
    </div>
  )
}
