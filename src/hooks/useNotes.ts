import { useCallback, useEffect, useMemo, useState } from 'react'
import { uid, extractLinks } from '@/types/note'
import type { Note } from '@/types/note'

const STORAGE_KEY = 'note-graph-notes-v1'
/** 用户主动清空所有笔记时置位，避免下次启动又被种子/同步数据"复活" */
const EMPTY_FLAG = 'note-graph-empty'

function isExplicitlyEmpty(): boolean {
  return localStorage.getItem(EMPTY_FLAG) === '1'
}

function seedNotes(): Note[] {
  const now = Date.now()
  return [
    {
      id: uid(),
      title: '使用指南',
      type: 'other',
      grade: '',
      tags: ['指南'],
      content: `欢迎使用本地笔记图谱。

## 写笔记

默认以预览模式阅读，切换到编辑标签即可修改 Markdown。
用 [[项目计划]] 这样的双括号建立笔记关联，用 #标签 组织内容。

## 图谱

图谱视图会显示笔记之间的关联，可按类型与标签筛选。

## 备份

数据保存在本机。请定期通过顶栏导出 JSON 备份。`,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      title: '项目计划',
      type: 'task',
      grade: '',
      tags: ['示例', '计划'],
      content: `## 本周任务

- 整理 [[资料索引]]
- 复习 [[Markdown 技巧]]

用笔记之间的双链把相关事项连起来。`,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      title: '资料索引',
      type: 'other',
      grade: '',
      tags: ['示例', '资料'],
      content: `把需要阅读的资料列在这里，再从 [[项目计划]] 跳转过来。`,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      title: 'Markdown 技巧',
      type: 'skill',
      grade: '',
      tags: ['示例', '写作'],
      content: `**加粗**、*斜体*、列表和表格都可以在预览中呈现。

返回 [[使用指南]]。`,
      createdAt: now,
      updatedAt: now,
    },
  ]
}

function load(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as Note[]
    }
    // 本地无数据：返回空，由同步/种子逻辑决定初始内容
    return []
  } catch {
    /* ignore */
  }
  return []
}

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>(load)

  // 首次启动：优先从仓库的 notes.json 同步；没有则用内置示例（用户主动清空过则跳过）
  useEffect(() => {
    if (isExplicitlyEmpty()) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}notes.json`, { cache: 'no-cache' })
        if (r.ok) {
          const arr = await r.json()
          if (!cancelled && Array.isArray(arr) && arr.length > 0) {
            setNotes((prev) => (prev.length > 0 ? prev : (arr as Note[])))
            return
          }
        }
      } catch {
        /* no notes.json in repo */
      }
      if (!cancelled) setNotes((prev) => (prev.length > 0 ? prev : seedNotes()))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    try {
      if (notes.length > 0) localStorage.removeItem(EMPTY_FLAG)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
    } catch {
      /* ignore */
    }
  }, [notes])

  const createNote = useCallback((partial: Partial<Note> = {}): Note => {
    const now = Date.now()
    const note: Note = {
      id: uid(),
      title: partial.title ?? '未命名笔记',
      type: partial.type ?? 'other',
      grade: partial.grade ?? '',
      tags: partial.tags ?? [],
      content: partial.content ?? '',
      createdAt: now,
      updatedAt: now,
    }
    setNotes((prev) => [note, ...prev])
    return note
  }, [])

  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)),
    )
  }, [])

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => {
      const remaining = prev.filter((n) => n.id !== id)
      // 用户主动删光所有笔记时置位，避免下次启动被同步数据/种子"复活"
      if (remaining.length === 0) {
        try {
          localStorage.setItem(EMPTY_FLAG, '1')
        } catch {
          /* ignore */
        }
      }
      return remaining
    })
  }, [])

  /** 标题 -> 笔记 的索引（用于解析 wikilink） */
  const byTitle = useMemo(() => {
    const map = new Map<string, Note>()
    for (const n of notes) {
      map.set(n.title.toLowerCase(), n)
    }
    return map
  }, [notes])

  const resolveLink = useCallback(
    (title: string): Note | undefined => byTitle.get(title.toLowerCase()),
    [byTitle],
  )

  /** 图谱边：sourceId -> targetId 集合 */
  const edges = useMemo(() => {
    const set = new Set<string>()
    for (const n of notes) {
      for (const t of extractLinks(n.content)) {
        const target = byTitle.get(t.toLowerCase())
        if (target && target.id !== n.id) {
          const key = n.id < target.id ? `${n.id}|${target.id}` : `${target.id}|${n.id}`
          set.add(key)
        }
      }
    }
    return [...set].map((k) => {
      const [a, b] = k.split('|')
      return { source: a, target: b }
    })
  }, [notes, byTitle])

  return { notes, createNote, updateNote, deleteNote, resolveLink, edges }
}

export type NotesApi = ReturnType<typeof useNotes>
