import React, { useMemo } from 'react'
import type { Note } from '@/types/note'
import { parseMarkdown } from '@/lib/md'
import type { Align, Block, Inline, ListItem } from '@/lib/md'

interface Props {
  content: string
  notes?: Note[]
  onOpenNote?: (id: string) => void
  onCreateNote?: (title: string) => void
}

interface Ctx {
  linkIndex?: Map<string, Note>
  onOpenNote?: (id: string) => void
  onCreateNote?: (title: string) => void
}

/* ------------------------------------------------------------------ 行内渲染 */

function renderInline(nodes: Inline[], keyPrefix: string, ctx: Ctx): React.ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`
    switch (node.t) {
      case 'text':
        return node.v
      case 'strong':
        return <strong key={key}>{renderInline(node.c, key, ctx)}</strong>
      case 'em':
        return <em key={key}>{renderInline(node.c, key, ctx)}</em>
      case 'del':
        return (
          <del key={key} className="opacity-70">
            {renderInline(node.c, key, ctx)}
          </del>
        )
      case 'code':
        return (
          <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
            {node.v}
          </code>
        )
      case 'link':
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline decoration-dotted underline-offset-2 hover:bg-primary/10"
          >
            {renderInline(node.c, key, ctx)}
          </a>
        )
      case 'image':
        return (
          <img
            key={key}
            src={node.src}
            alt={node.alt}
            className="my-2 max-h-80 max-w-full rounded border"
          />
        )
      case 'wikilink': {
        const found = ctx.linkIndex?.get(node.target.toLowerCase())
        return (
          <button
            key={key}
            onClick={() => (found ? ctx.onOpenNote?.(found.id) : ctx.onCreateNote?.(node.target))}
            className={`rounded px-1 underline decoration-dotted underline-offset-2 transition-colors ${
              found ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:bg-muted'
            }`}
            title={found ? '打开笔记' : '点击创建这篇笔记'}
          >
            {node.alias ?? node.target}
            {!found && <span className="ml-0.5 opacity-60">?</span>}
          </button>
        )
      }
      case 'tag':
        return (
          <span
            key={key}
            className="rounded-full bg-accent px-1.5 py-0.5 text-[0.85em] text-accent-foreground"
          >
            #{node.v}
          </span>
        )
      case 'sub':
        return <sub key={key}>{renderInline(node.c, key, ctx)}</sub>
      case 'sup':
        return <sup key={key}>{renderInline(node.c, key, ctx)}</sup>
      default:
        return null
    }
  })
}

/* ------------------------------------------------------------------ 块级渲染 */

const ALIGN_STYLE: Record<Exclude<Align, null>, React.CSSProperties> = {
  left: { textAlign: 'left' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
}

const HEADING_CLASS: Record<number, string> = {
  1: 'mb-2 mt-4 text-xl font-bold',
  2: 'mb-2 mt-5 border-b pb-1 text-lg font-semibold',
  3: 'mb-1 mt-4 text-base font-semibold',
  4: 'mb-1 mt-3 text-sm font-semibold',
  5: 'mb-1 mt-3 text-sm font-semibold opacity-90',
  6: 'mb-1 mt-3 text-sm font-semibold opacity-80',
}

function renderListItem(item: ListItem, key: string, ctx: Ctx): React.ReactNode {
  const [first, ...rest] = item.blocks
  const isTask = item.checked !== undefined
  const body = (
    <>
      {first && first.t === 'paragraph' ? (
        <span>{renderInline(first.c, key + '-p0', ctx)}</span>
      ) : first ? (
        renderBlocks([first], key + '-b0', ctx)
      ) : null}
      {rest.length > 0 && <div className="mt-1">{renderBlocks(rest, key + '-rest', ctx)}</div>}
    </>
  )
  if (isTask) {
    return (
      <li key={key} className="list-none">
        <span className="mr-1 select-none opacity-70">{item.checked ? '☑' : '☐'}</span>
        {body}
      </li>
    )
  }
  return <li key={key}>{body}</li>
}

function renderBlocks(blocks: Block[], keyPrefix: string, ctx: Ctx): React.ReactNode {
  return blocks.map((b, i) => {
    const key = `${keyPrefix}-${i}`
    switch (b.t) {
      case 'heading': {
        const Tag = `h${Math.min(b.level, 6)}` as React.ElementType
        return (
          <Tag key={key} className={HEADING_CLASS[b.level] ?? HEADING_CLASS[6]}>
            {renderInline(b.c, key, ctx)}
          </Tag>
        )
      }
      case 'paragraph':
        return (
          <p key={key} className="my-1.5 leading-relaxed">
            {renderInline(b.c, key, ctx)}
          </p>
        )
      case 'hr':
        return <hr key={key} className="my-4 border-muted" />
      case 'code':
        return (
          <pre key={key} className="my-2 overflow-x-auto rounded bg-muted p-3">
            <code className="text-[0.85em] leading-relaxed">{b.v}</code>
          </pre>
        )
      case 'quote':
        return (
          <blockquote
            key={key}
            className="my-2 border-l-4 border-muted-foreground/30 pl-3 text-muted-foreground"
          >
            {renderBlocks(b.blocks, key, ctx)}
          </blockquote>
        )
      case 'list': {
        const Tag = b.ordered ? 'ol' : 'ul'
        return (
          <Tag
            key={key}
            start={b.ordered ? b.start : undefined}
            className="my-2 list-inside space-y-1 pl-2"
          >
            {b.items.map((it, idx) => renderListItem(it, `${key}-i${idx}`, ctx))}
          </Tag>
        )
      }
      case 'table':
        return (
          <div key={key} className="my-3 overflow-x-auto">
            <table className="w-full border-collapse text-[0.95em]">
              <thead>
                <tr>
                  {b.header.map((cell, ci) => (
                    <th
                      key={ci}
                      style={b.align[ci] ? ALIGN_STYLE[b.align[ci] as Exclude<Align, null>] : undefined}
                      className="border border-border bg-muted px-2 py-1 font-semibold"
                    >
                      {renderInline(cell, `${key}-h${ci}`, ctx)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={b.align[ci] ? ALIGN_STYLE[b.align[ci] as Exclude<Align, null>] : undefined}
                        className="border border-border px-2 py-1 align-top"
                      >
                        {renderInline(cell, `${key}-r${ri}c${ci}`, ctx)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      default:
        return null
    }
  })
}

/* ------------------------------------------------------------------ 组件 */

export function Markdown({ content, notes, onOpenNote, onCreateNote }: Props) {
  const linkIndex = useMemo(() => {
    const map = new Map<string, Note>()
    for (const n of notes ?? []) map.set(n.title.toLowerCase(), n)
    return map
  }, [notes])

  const blocks = useMemo(() => parseMarkdown(content), [content])

  return (
    <div className="text-sm">
      {renderBlocks(
        blocks,
        'b',
        { linkIndex, onOpenNote, onCreateNote },
      )}
    </div>
  )
}
