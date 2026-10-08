import { useCallback, useEffect, useMemo, useState } from 'react'
import { uid, extractLinks } from '@/types/note'
import type { Note } from '@/types/note'

const STORAGE_KEY = 'kaust-knowledge-graph-notes-v1'
/** 用户主动清空所有笔记时置位，避免下次启动又被种子/同步数据"复活" */
const EMPTY_FLAG = 'kaust-knowledge-graph-empty'

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
      content: `欢迎使用本地笔记图谱！

## 这个工具是做什么的

用来组织个人知识、项目和技能，通过笔记链接建立联系。

## 五种笔记类型

- **人物** — 记录某位同事：研究方向、技能、性格、可以帮你什么
- **任务/项目** — 团队的项目、paper、实验任务
- **技能** — 具体技术点（如某个软件、实验方法）
- **求问/学习** — 你想学的东西、想问的问题
- **其他** — 任何不方便归类的内容

## 如何建立联系

在笔记正文中用双方括号引用其他笔记，例如：[[示例人物 张三]]。
被引用的笔记会在图谱视图中与当前笔记连线。

## 标签与年级

- 用 #标签 的形式给笔记打标签，如 #机器学习 #电镜
- 人物笔记可以设置「年级/身份」（教授/博后/博士/硕士…），图谱可按此筛选

## 图谱视图

切换到「图谱」页面后，可以：

1. 按**类型**筛选（只看人物、只看任务…）
2. 按**年级**筛选（只看博士生…）
3. 按**标签**筛选
4. 点击节点进入**焦点模式**，只显示与该节点直接相连的笔记，简化复杂图谱
5. 拖动节点调整布局

数据保存在浏览器本地（localStorage），不会上传。`,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      title: '示例人物 张三',
      type: 'person',
      grade: 'phd',
      tags: ['示例', '机器学习'],
      content: `这是一篇**示例人物**笔记，了解用法后可以删除。

## 基本信息

- 年级：博士生（三年级）
- 方向：#机器学习 在材料筛选中的应用

## 他完成过的工作

- 参与了 [[示例项目 某材料数据库]] 的搭建
- 熟悉 Python 和 [[技能示例 PyTorch]]

## 可以寻求的帮助

- 问代码问题很耐心，可以约每周讨论
- 借得到某仪器的预约权限

关联：[[使用指南]]`,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      title: '示例项目 某材料数据库',
      type: 'task',
      grade: '',
      tags: ['示例', '数据库'],
      content: `示例项目笔记。

## 简介

团队维护的某材料性质数据库。

## 相关成员

- [[示例人物 张三]] 负责数据清洗
- 需要 [[技能示例 PyTorch]] 做模型训练`,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      title: '技能示例 PyTorch',
      type: 'skill',
      grade: '',
      tags: ['示例', '编程'],
      content: `示例技能笔记。

深度学习框架。[[示例人物 张三]] 用它搭过 GNN 模型。

可以在 #求问/学习 笔记里记录你想学的 PyTorch 知识点。`,
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
  const [hydrated, setHydrated] = useState(false)

  // 首次启动：优先从仓库的 notes.json 同步；没有则用内置示例（用户主动清空过则跳过）
  useEffect(() => {
    if (isExplicitlyEmpty()) {
      setHydrated(true)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}notes.json`, { cache: 'no-cache' })
        if (r.ok) {
          const arr = await r.json()
          if (!cancelled && Array.isArray(arr) && arr.length > 0) {
            setNotes((prev) => (prev.length > 0 ? prev : (arr as Note[])))
          } else if (!cancelled) {
            setNotes((prev) => (prev.length > 0 ? prev : seedNotes()))
          }
        }
      } catch {
        /* no notes.json in repo */
      }
      if (!cancelled) setNotes((prev) => (prev.length > 0 ? prev : seedNotes()))
      if (!cancelled) setHydrated(true)
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

  /** 用一批笔记整体替换本地数据（用于「从 notes.json 重新载入」） */
  const replaceAll = useCallback((incoming: Note[]) => {
    const now = Date.now()
    const next: Note[] = incoming
      .filter((n) => n && typeof n.title === 'string' && typeof n.content === 'string')
      .map((n) => ({
        id: n.id || uid(),
        title: n.title,
        type: n.type ?? 'other',
        grade: n.grade ?? '',
        tags: Array.isArray(n.tags) ? n.tags : [],
        content: n.content,
        createdAt: n.createdAt ?? now,
        updatedAt: n.updatedAt ?? now,
      }))
    setNotes(next)
    try {
      if (next.length > 0) localStorage.removeItem(EMPTY_FLAG)
    } catch {
      /* ignore */
    }
    return next.length
  }, [])

  /** 按标题合并一批笔记（同标题更新，新标题新增），避免出现重复节点 */
  const mergeByTitle = useCallback(
    (incoming: Note[]) => {
      const now = Date.now()
      const pending = new Map<string, Note>()
      for (const raw of incoming) {
        if (raw && typeof raw.title === 'string' && typeof raw.content === 'string') {
          pending.set(raw.title.toLowerCase(), raw)
        }
      }
      let updated = 0
      const next: Note[] = notes.map((n) => {
        const key = n.title.toLowerCase()
        const raw = pending.get(key)
        if (!raw) return n
        pending.delete(key)
        updated++
        return {
          ...n,
          type: raw.type ?? n.type,
          grade: raw.grade ?? n.grade,
          tags: Array.isArray(raw.tags) ? raw.tags : n.tags,
          content: raw.content,
          updatedAt: now,
        }
      })
      let added = 0
      for (const raw of pending.values()) {
        next.unshift({
          id: raw.id || uid(),
          title: raw.title,
          type: raw.type ?? 'other',
          grade: raw.grade ?? '',
          tags: Array.isArray(raw.tags) ? raw.tags : [],
          content: raw.content,
          createdAt: raw.createdAt ?? now,
          updatedAt: raw.updatedAt ?? now,
        })
        added++
      }
      setNotes(next)
      try {
        if (next.length > 0) localStorage.removeItem(EMPTY_FLAG)
      } catch {
        /* ignore */
      }
      return { added, updated }
    },
    [notes],
  )

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

  return { notes, hydrated, createNote, updateNote, deleteNote, replaceAll, mergeByTitle, resolveLink, edges }
}

export type NotesApi = ReturnType<typeof useNotes>
