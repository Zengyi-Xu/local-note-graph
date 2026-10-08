import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useNotes } from '@/hooks/useNotes'
import { NoteList } from '@/components/NoteList'
import { NoteEditor } from '@/components/NoteEditor'
import { GraphView } from '@/components/GraphView'
import type { Filters } from '@/components/GraphView'
import { NOTE_TYPE_META, GRADE_META } from '@/types/note'
import type { NoteType, Grade, Note } from '@/types/note'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Network, NotebookText, Upload, FileUp, FolderSync, Settings2, Save } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { AUTO_SYNC_KEY, downloadNotes, isDesktop, saveNotesToSyncFile, SYNC_PATH_KEY } from '@/lib/syncFile'
import { Switch } from '@/components/ui/switch'

export default function App() {
  const api = useNotes()
  const { notes, hydrated } = api
  const [view, setView] = useState<'notes' | 'graph'>('notes')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>({ types: new Set(), grades: new Set(), tags: new Set(), search: '' })
  const fileRef = useRef<HTMLInputElement>(null)
  const mdRef = useRef<HTMLInputElement>(null)
  const [syncPath, setSyncPath] = useState(() => localStorage.getItem(SYNC_PATH_KEY) ?? '')
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem(AUTO_SYNC_KEY) === '1')
  const [syncing, setSyncing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)

  const active = notes.find((n) => n.id === activeId) ?? notes[0] ?? null

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const n of notes) for (const t of n.tags) s.add(t)
    return [...s].sort()
  }, [notes])

  const toggle = (set: Set<string>, v: string, key: keyof Filters) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setFilters((f) => ({ ...f, [key]: next }))
  }

  const openNote = (id: string) => {
    setActiveId(id)
    setView('notes')
  }

  const createNote = (title?: string) => {
    const n = api.createNote(title ? { title, content: '' } : {})
    setActiveId(n.id)
    setView('notes')
    return n
  }

  const exportJson = () => {
    downloadNotes(notes, `kaust-notes-${new Date().toISOString().slice(0, 10)}.json`)
    toast.success('已导出全部笔记为 JSON 备份')
  }

  const importJson = async (file: File) => {
    try {
      const arr = JSON.parse(await file.text()) as Note[]
      if (!Array.isArray(arr)) throw new Error('bad format')
      let count = 0
      for (const n of arr) {
        if (n.title && typeof n.content === 'string') {
          api.createNote({ title: n.title, type: n.type ?? 'other', grade: n.grade ?? '', tags: n.tags ?? [], content: n.content })
          count++
        }
      }
      toast.success(`已导入 ${count} 篇笔记`)
    } catch {
      toast.error('导入失败：不是有效的 JSON 备份文件')
    }
  }

  const importMd = async (file: File) => {
    const text = await file.text()
    const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?/)
    const get = (k: string) => fmMatch?.[1].match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim()
    let type: NoteType = 'other'
    let grade: Grade = ''
    let tags: string[] = []
    let content = text
    if (fmMatch) {
      content = text.slice(fmMatch[0].length)
      const t = get('type')
      if (t && t in NOTE_TYPE_META) type = t as NoteType
      const g = get('grade')
      if (g && g in GRADE_META) grade = g as Grade
      const tg = get('tags')
      if (tg) tags = tg.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean)
    }
    const title = get('title') ?? file.name.replace(/\.md$/i, '')
    const n = api.createNote({ title, type, grade, tags, content: content.trim() })
    setActiveId(n.id)
    toast.success(`已导入「${title}」`)
  }

  const chooseSyncFile = useCallback(async () => {
    const api = window.knowledgeGraphDesktop
    if (!api) {
      toast.info('请使用桌面版选择同步文件；浏览器版会下载 JSON 文件')
      return null
    }
    const selected = await api.chooseSyncFile()
    if (!selected) return null
    localStorage.setItem(SYNC_PATH_KEY, selected)
    setSyncPath(selected)
    toast.success('已设置同步文件位置')
    return selected
  }, [])

  const syncNow = useCallback(async (quiet = false) => {
    if (!syncPath) {
      if (!quiet) {
        if (isDesktop()) {
          await chooseSyncFile()
        } else {
          downloadNotes(notes, 'notes.json')
          toast.success('已下载 notes.json，可放入同步文件夹')
        }
      }
      return
    }
    setSyncing(true)
    try {
      await saveNotesToSyncFile(notes, syncPath)
      setLastSyncAt(Date.now())
      if (!quiet) toast.success('已保存到同步文件')
    } catch {
      toast.error('同步文件保存失败，请重新选择文件位置')
    } finally {
      setSyncing(false)
    }
  }, [chooseSyncFile, notes, syncPath])

  useEffect(() => {
    localStorage.setItem(AUTO_SYNC_KEY, autoSync ? '1' : '0')
  }, [autoSync])

  useEffect(() => {
    if (!autoSync || !syncPath || !hydrated) return
    const timer = window.setTimeout(() => void syncNow(true), 900)
    return () => window.clearTimeout(timer)
  }, [autoSync, hydrated, syncNow])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* 顶栏 */}
      <header className="flex h-14 items-center gap-3 border-b px-4">
        <Network className="h-5 w-5 text-primary" />
        <h1 className="text-base font-bold">KAUST 团队知识图谱</h1>
        <span className="text-xs text-muted-foreground">Yating Wan 课题组 · {notes.length} 篇笔记</span>
        <div className="ml-auto flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <input ref={mdRef} type="file" accept=".md,.markdown" className="hidden" onChange={(e) => e.target.files?.[0] && importMd(e.target.files[0])} />
          <Button variant="outline" size="sm" onClick={() => void syncNow()}>
            <Save className="mr-1 h-3.5 w-3.5" /> 保存到同步文件
          </Button>
          <Button variant="outline" size="icon" title="选择同步文件" onClick={() => void chooseSyncFile()}>
            <FolderSync className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-3.5 w-3.5" /> 导入备份
          </Button>
          <Button variant="outline" size="sm" onClick={() => mdRef.current?.click()}>
            <FileUp className="mr-1 h-3.5 w-3.5" /> 导入 .md
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson}>导出备份</Button>
        </div>
      </header>
      <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-1.5 text-xs text-muted-foreground">
        <Settings2 className="h-3.5 w-3.5" />
        <span className="truncate" title={syncPath || '尚未选择同步文件'}>
          {syncPath ? `同步文件：${syncPath}` : '尚未选择同步文件'}
        </span>
        <label className="ml-auto flex shrink-0 items-center gap-2">
          <span>自动同步</span>
          <Switch checked={autoSync} onCheckedChange={setAutoSync} disabled={!syncPath} aria-label="自动同步" />
        </label>
        {syncing && <span>保存中…</span>}
        {!syncing && lastSyncAt && <span>已保存 {new Date(lastSyncAt).toLocaleTimeString()}</span>}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 左侧：笔记列表 */}
        <aside className="w-64 shrink-0 border-r bg-muted/30">
          <NoteList notes={notes} activeId={active?.id ?? null} onSelect={openNote} onCreate={() => createNote()} />
        </aside>

        {/* 右侧主区 */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b px-4 py-2">
            <Tabs value={view} onValueChange={(v) => setView(v as 'notes' | 'graph')}>
              <TabsList>
                <TabsTrigger value="notes">
                  <NotebookText className="mr-1.5 h-4 w-4" /> 笔记
                </TabsTrigger>
                <TabsTrigger value="graph">
                  <Network className="mr-1.5 h-4 w-4" /> 图谱
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {view === 'graph' && (
              <span className="text-xs text-muted-foreground">
                点击节点打开笔记 · 双击节点聚焦/取消聚焦
              </span>
            )}
          </div>

          {view === 'notes' ? (
            active ? (
              <div className="min-h-0 flex-1">
                <NoteEditor
                  key={active.id}
                  note={active}
                  allNotes={notes}
                  onChange={(p) => api.updateNote(active.id, p)}
                  onDelete={() => {
                    api.deleteNote(active.id)
                    setActiveId(null)
                  }}
                  onOpenNote={openNote}
                  onCreateNote={(t) => createNote(t)}
                />
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                <Button onClick={() => createNote()}>新建第一篇笔记</Button>
              </div>
            )
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 xl:flex-row">
              {/* 筛选面板 */}
              <div className="shrink-0 space-y-4 overflow-y-auto rounded-lg border bg-card p-3 text-sm xl:w-52">
                <div>
                  <div className="mb-1.5 font-medium">按类型</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(NOTE_TYPE_META).map(([k, v]) => (
                      <Badge
                        key={k}
                        variant={filters.types.has(k) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggle(filters.types, k, 'types')}
                      >
                        <span className="mr-1 h-2 w-2 rounded-full" style={{ background: v.color }} />
                        {v.label}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 font-medium">按年级/身份（人物）</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(GRADE_META).map(([k, v]) => (
                      <Badge
                        key={k}
                        variant={filters.grades.has(k) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggle(filters.grades, k, 'grades')}
                      >
                        {v}
                      </Badge>
                    ))}
                  </div>
                </div>
                {allTags.length > 0 && (
                  <div>
                    <div className="mb-1.5 font-medium">按标签</div>
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.map((t) => (
                        <Badge
                          key={t}
                          variant={filters.tags.has(t) ? 'default' : 'secondary'}
                          className="cursor-pointer"
                          onClick={() => toggle(filters.tags, t, 'tags')}
                        >
                          #{t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {(filters.types.size > 0 || filters.grades.size > 0 || filters.tags.size > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setFilters({ types: new Set(), grades: new Set(), tags: new Set(), search: '' })}
                  >
                    清除全部筛选
                  </Button>
                )}
              </div>
              {/* 图谱 */}
              <div className="min-w-0 flex-1">
                <GraphView
                  notes={notes}
                  onOpenNote={openNote}
                  filters={filters}
                  focusId={focusId}
                  onFocusChange={setFocusId}
                />
              </div>
            </div>
          )}
        </main>
      </div>
      <Toaster position="bottom-right" richColors />
    </div>
  )
}
