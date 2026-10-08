import { useMemo, useState } from 'react'
import type { Note } from '@/types/note'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export type ConflictChoice = 'local' | 'remote'

interface Props {
  local: Note[]
  remote: Note[]
  onCancel: () => void
  onApply: (merged: Note[]) => void
}

type Kind = 'only-local' | 'only-remote' | 'diff' | 'same'

interface Row {
  title: string
  kind: Kind
  local?: Note
  remote?: Note
}

function sameNote(a: Note, b: Note): boolean {
  return (
    a.content === b.content &&
    a.type === b.type &&
    a.grade === b.grade &&
    a.tags.join('\u0000') === b.tags.join('\u0000')
  )
}

export function ConflictDialog({ local, remote, onCancel, onApply }: Props) {
  const rows = useMemo<Row[]>(() => {
    const byTitle = (list: Note[]) => {
      const m = new Map<string, Note>()
      for (const n of list) m.set(n.title, n)
      return m
    }
    const lm = byTitle(local)
    const rm = byTitle(remote)
    const titles = [...new Set([...lm.keys(), ...rm.keys()])].sort((a, b) => a.localeCompare(b, 'zh'))
    const out: Row[] = []
    for (const t of titles) {
      const l = lm.get(t)
      const r = rm.get(t)
      if (l && !r) out.push({ title: t, kind: 'only-local', local: l })
      else if (!l && r) out.push({ title: t, kind: 'only-remote', remote: r })
      else if (l && r) out.push({ title: t, kind: sameNote(l, r) ? 'same' : 'diff', local: l, remote: r })
    }
    return out
  }, [local, remote])

  const diffs = useMemo(() => rows.filter((r) => r.kind === 'diff'), [rows])
  const [active, setActive] = useState<string>(() => diffs[0]?.title ?? rows[0]?.title ?? '')
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>(() => {
    const c: Record<string, ConflictChoice> = {}
    for (const r of diffs) c[r.title] = 'local'
    return c
  })

  const row = rows.find((r) => r.title === active)
  const setAll = (v: ConflictChoice) => {
    const c: Record<string, ConflictChoice> = {}
    for (const r of diffs) c[r.title] = v
    setChoices(c)
  }

  const merged = useMemo<Note[]>(() => {
    const out: Note[] = []
    for (const r of rows) {
      if (r.kind === 'only-local' && r.local) out.push(r.local)
      else if (r.kind === 'only-remote' && r.remote) out.push(r.remote)
      else if (r.kind === 'same' && r.local) out.push(r.local)
      else if (r.kind === 'diff') out.push(choices[r.title] === 'remote' ? r.remote! : r.local!)
    }
    return out
  }, [rows, choices])

  const count = (k: Kind) => rows.filter((r) => r.kind === k).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <span className="font-semibold">同步冲突：本地和同步文件都改过了</span>
          <span className="text-xs text-muted-foreground">
            冲突 {count('diff')} · 仅本地 {count('only-local')} · 仅文件 {count('only-remote')} · 一致 {count('same')}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAll('local')}>
              全部用本地
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAll('remote')}>
              全部用文件
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 左：差异清单 */}
          <div className="w-72 shrink-0 overflow-y-auto border-r p-2">
            {rows.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">没有差异</p>
            )}
            {rows.map((r) => (
              <button
                key={r.title}
                type="button"
                onClick={() => setActive(r.title)}
                className={`mb-0.5 block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  r.title === active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                }`}
              >
                <div className="truncate">{r.title}</div>
                <div className="mt-0.5 flex items-center gap-1">
                  {r.kind === 'diff' && <Badge variant="destructive" className="text-[10px]">冲突</Badge>}
                  {r.kind === 'only-local' && <Badge variant="secondary" className="text-[10px]">仅本地</Badge>}
                  {r.kind === 'only-remote' && <Badge variant="secondary" className="text-[10px]">仅文件</Badge>}
                  {r.kind === 'same' && <Badge variant="outline" className="text-[10px]">一致</Badge>}
                  {r.kind === 'diff' && (
                    <span className="text-[10px] text-muted-foreground">
                      {choices[r.title] === 'remote' ? '→ 用文件' : '→ 用本地'}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* 右：逐条对比 */}
          <div className="flex min-h-0 flex-1 flex-col">
            {row ? (
              <>
                <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
                  <span className="text-sm font-medium">{row.title}</span>
                  {row.kind === 'diff' && (
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        size="sm"
                        variant={choices[row.title] === 'local' ? 'default' : 'outline'}
                        onClick={() => setChoices((c) => ({ ...c, [row.title]: 'local' }))}
                      >
                        用本地
                      </Button>
                      <Button
                        size="sm"
                        variant={choices[row.title] === 'remote' ? 'default' : 'outline'}
                        onClick={() => setChoices((c) => ({ ...c, [row.title]: 'remote' }))}
                      >
                        用文件
                      </Button>
                    </div>
                  )}
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-2 divide-x">
                  <div className="flex min-h-0 flex-col">
                    <div className="shrink-0 border-b px-3 py-1.5 text-xs text-muted-foreground">
                      本地版本
                      {row.local ? `（更新于 ${new Date(row.local.updatedAt).toLocaleString('zh-CN')}）` : '：无'}
                    </div>
                    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs">
                      {row.local?.content ?? ''}
                    </pre>
                  </div>
                  <div className="flex min-h-0 flex-col">
                    <div className="shrink-0 border-b px-3 py-1.5 text-xs text-muted-foreground">
                      同步文件版本
                      {row.remote ? `（更新于 ${new Date(row.remote.updatedAt).toLocaleString('zh-CN')}）` : '：无'}
                    </div>
                    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs">
                      {row.remote?.content ?? ''}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                没有可对比的内容
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">
            仅本地/仅文件的条目会自动保留，冲突条目按上面的选择合并（共 {merged.length} 篇）
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              先不合并
            </Button>
            <Button onClick={() => onApply(merged)}>按选择合并</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
