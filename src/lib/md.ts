/**
 * 轻量 Markdown 解析器（纯函数，不依赖 React）—— 产出 AST，由 Markdown.tsx 渲染。
 *
 * 支持（"常见语法"子集）：
 *   块级：ATX 标题(#~######)、段落、无序/有序列表(含嵌套、任务列表)、
 *         围栏代码块(``` 或 ~~~)、引用(> ，可多行)、GFM 表格(含对齐)、分隔线
 *   行内：**粗体**、*斜体* / _斜体_、~~删除线~~、`行内代码`、
 *         [文字](链接)、![图片](地址)、<自动链接>、裸 URL、
 *         [[双链]]、[[双链|别名]]、#标签、~下标~、^上标^、反斜杠转义
 *
 * 有意保留的行为：**不以空行分隔的相邻文本行各自成为一个段落**（与本应用此前的
 * 渲染一致，避免已有笔记的排版被改变）。标准 Markdown 会把它们合并成一段。
 */

export type Align = 'left' | 'center' | 'right' | null

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'del'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'image'; src: string; alt: string }
  | { t: 'wikilink'; target: string; alias?: string }
  | { t: 'tag'; v: string }
  | { t: 'sub'; c: Inline[] }
  | { t: 'sup'; c: Inline[] }

export interface ListItem {
  checked?: boolean
  blocks: Block[]
}

export type Block =
  | { t: 'heading'; level: number; c: Inline[] }
  | { t: 'paragraph'; c: Inline[] }
  | { t: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'table'; align: Align[]; header: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' }

/* ------------------------------------------------------------------ 行内解析 */

const SAFE_URL = /^(https?:|mailto:)/i
const SAFE_IMG = /^(https?:|data:image\/)/i

/** 允许的反斜杠转义字符 */
const ESCAPABLE = '\\`*_{}[]()#+-.!|~>^'

/** Single delimiters only; double tildes remain strikethrough. */
function scriptSpan(src: string, delimiter: '~' | '^'): { value: string; length: number } | null {
  if (src[0] !== delimiter || src[1] === delimiter) return null
  let value = ''
  for (let i = 1; i < src.length; i++) {
    const ch = src[i]
    if (ch === '\\' && (src[i + 1] === delimiter || src[i + 1] === ' ' || src[i + 1] === '\\')) {
      value += src[++i]
      continue
    }
    if (ch === delimiter) {
      if (!value || src[i + 1] === delimiter) return null
      return { value, length: i + 1 }
    }
    if (/\s/.test(ch)) return null
    value += ch
  }
  return null
}

function pushInline(out: Inline[], node: Inline) {
  const last = out[out.length - 1]
  if (node.t === 'text' && last && last.t === 'text') {
    last.v += node.v
    return
  }
  if (node.t === 'text' && node.v === '') return
  out.push(node)
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let i = 0
  let buf = ''

  const flush = () => {
    if (buf) {
      pushInline(out, { t: 'text', v: buf })
      buf = ''
    }
  }

  while (i < src.length) {
    const rest = src.slice(i)
    let m: RegExpMatchArray | null

    // \ 转义
    if (rest[0] === '\\' && rest.length > 1 && ESCAPABLE.includes(rest[1])) {
      buf += rest[1]
      i += 2
      continue
    }

    // `行内代码`
    if ((m = rest.match(/^`([^`]+)`/))) {
      flush()
      pushInline(out, { t: 'code', v: m[1] })
      i += m[0].length
      continue
    }

    // ![图片](地址)
    if ((m = rest.match(/^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/))) {
      if (SAFE_IMG.test(m[2])) {
        flush()
        pushInline(out, { t: 'image', src: m[2], alt: m[1] })
        i += m[0].length
        continue
      }
    }

    // [[双链]] / [[双链|别名]]
    if ((m = rest.match(/^\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/))) {
      flush()
      pushInline(out, { t: 'wikilink', target: m[1].trim(), alias: m[2]?.trim() })
      i += m[0].length
      continue
    }

    // [文字](链接)
    if ((m = rest.match(/^\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/))) {
      if (SAFE_URL.test(m[2])) {
        flush()
        pushInline(out, { t: 'link', href: m[2], c: parseInline(m[1]) })
        i += m[0].length
        continue
      }
    }

    // <自动链接>
    if ((m = rest.match(/^<((?:https?|mailto):[^>\s]+)>/i))) {
      flush()
      pushInline(out, { t: 'link', href: m[1], c: [{ t: 'text', v: m[1] }] })
      i += m[0].length
      continue
    }

    // <sub>下标</sub> / <sup>上标</sup>
    if ((m = rest.match(/^<(sub|sup)>([\s\S]*?)<\/\1>/i))) {
      flush()
      pushInline(out, { t: m[1].toLowerCase() as 'sub' | 'sup', c: parseInline(m[2]) })
      i += m[0].length
      continue
    }

    // **粗体** / __粗体__
    if ((m = rest.match(/^\*\*(\S(?:[\s\S]*?\S)?)\*\*/)) || (m = rest.match(/^__(\S(?:[\s\S]*?\S)?)__/))) {
      flush()
      pushInline(out, { t: 'strong', c: parseInline(m[1]) })
      i += m[0].length
      continue
    }

    // ~~删除线~~
    if ((m = rest.match(/^~~(\S(?:[\s\S]*?\S)?)~~/))) {
      flush()
      pushInline(out, { t: 'del', c: parseInline(m[1]) })
      i += m[0].length
      continue
    }

    // Typora-style scripts; code, links and double tildes take precedence.
    if (
      (rest[0] === '~' || rest[0] === '^') &&
      (i === 0 || src[i - 1] !== rest[0])
    ) {
      const span = scriptSpan(rest, rest[0])
      if (span) {
        flush()
        pushInline(out, {
          t: rest[0] === '~' ? 'sub' : 'sup',
          c: [{ t: 'text', v: span.value }],
        })
        i += span.length
        continue
      }
    }

    // *斜体* / _斜体_
    if ((m = rest.match(/^\*(\S(?:[^*]*?\S)?)\*/)) || (m = rest.match(/^_(\S(?:[^_]*?\S)?)_/))) {
      flush()
      pushInline(out, { t: 'em', c: parseInline(m[1]) })
      i += m[0].length
      continue
    }

    // 裸 URL
    if ((m = rest.match(/^(https?:\/\/[^\s<>()\[\]]+)/i))) {
      const url = m[1].replace(/[.,;:!?，。；：！？）)】」"']+$/, '')
      flush()
      pushInline(out, { t: 'link', href: url, c: [{ t: 'text', v: url }] })
      i += url.length
      continue
    }

    // #标签（前面必须是行首或空白/标点，避免把 a#b 当标签）
    if (
      rest[0] === '#' &&
      (i === 0 || /[\s，。；：、,.;:!?()[\]{}"']/.test(src[i - 1])) &&
      (m = rest.match(/^#([^\s#，。；：、,.;:!?()[\]{}"'`]+)/))
    ) {
      flush()
      pushInline(out, { t: 'tag', v: m[1] })
      i += m[0].length
      continue
    }

    // 普通文本：攒到下一个可能触发语法/换行的字符
    const next = rest.search(/[\\`!\[<*_~^#h]/)
    const take = next === -1 ? rest.length : next === 0 ? 1 : next
    buf += rest.slice(0, take)
    i += take
  }

  flush()
  return out
}

/* ------------------------------------------------------------------ 表格工具 */

/** 按未转义的 | 切分一行表格，并把 \| 还原成 | */
export function splitRow(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\\' && line[i + 1] === '|') {
      cur += '|'
      i++
      continue
    }
    if (ch === '|') {
      cells.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  cells.push(cur)
  // 去掉首尾因 | 包裹产生的空单元
  if (cells.length > 1 && cells[0].trim() === '') cells.shift()
  if (cells.length > 1 && cells[cells.length - 1].trim() === '') cells.pop()
  return cells.map((c) => c.trim())
}

const TABLE_DELIM = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/

function isTableDelim(line: string): boolean {
  return !!line && line.includes('-') && TABLE_DELIM.test(line)
}

function alignOf(cell: string): Align {
  const s = cell.trim()
  const l = s.startsWith(':')
  const r = s.endsWith(':')
  if (l && r) return 'center'
  if (r) return 'right'
  if (l) return 'left'
  return null
}

/* ------------------------------------------------------------------ 块级解析 */

const RE_FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)/
const RE_HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RE_HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const RE_QUOTE = /^ {0,3}>\s?(.*)$/
const RE_TASK = /^\[([ xX])\]\s+(.*)$/

interface ItemMatch {
  indent: number
  ordered: boolean
  start: number
  text: string
}

/**
 * 识别列表项。注意中文习惯：
 *   `- 项目`、`1. 项目` 需要标记后有空白；
 *   `1、项目`（顿号）允许没有空格；
 *   而 `1.5 倍` 不能被当成有序列表，所以 `.` / `)` 后必须有空白。
 */
function matchItem(line: string): ItemMatch | null {
  const b = line.match(/^(\s*)([-*+])\s+(.*)$/)
  if (b) return { indent: b[1].length, ordered: false, start: 1, text: b[3] }
  const o = line.match(/^(\s*)(\d{1,9})([.)、])(\s*)(.*)$/)
  if (o) {
    const sep = o[3]
    if ((sep === '.' || sep === ')') && o[4].length === 0) return null
    return { indent: o[1].length, ordered: true, start: parseInt(o[2], 10) || 1, text: o[5] }
  }
  return null
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // 空行
    if (/^\s*$/.test(line)) {
      i++
      continue
    }

    // 围栏代码块
    let m = line.match(RE_FENCE)
    if (m) {
      const fence = m[1]
      const lang = m[2] || ''
      const body: string[] = []
      i++
      while (i < lines.length && !new RegExp('^ {0,3}' + fence[0] + '{' + fence.length + ',}\\s*$').test(lines[i])) {
        body.push(lines[i])
        i++
      }
      i++ // 跳过结束围栏
      blocks.push({ t: 'code', lang, v: body.join('\n') })
      continue
    }

    // 分隔线
    if (RE_HR.test(line)) {
      blocks.push({ t: 'hr' })
      i++
      continue
    }

    // 标题
    m = line.match(RE_HEADING)
    if (m) {
      blocks.push({ t: 'heading', level: m[1].length, c: parseInline(m[2]) })
      i++
      continue
    }

    // 引用（可多行）
    if (RE_QUOTE.test(line)) {
      const inner: string[] = []
      while (i < lines.length && (RE_QUOTE.test(lines[i]) || (/^\s*$/.test(lines[i]) && RE_QUOTE.test(lines[i + 1] ?? '')))) {
        const q = lines[i].match(RE_QUOTE)
        inner.push(q ? q[1] : '')
        i++
      }
      blocks.push({ t: 'quote', blocks: parseMarkdown(inner.join('\n')) })
      continue
    }

    // 表格：本行含 | 且下一行是分隔行
    if (line.includes('|') && isTableDelim(lines[i + 1] ?? '')) {
      const header = splitRow(line).map(parseInline)
      const align = splitRow(lines[i + 1]).map(alignOf)
      i += 2
      const rows: Inline[][][] = []
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
        const cells = splitRow(lines[i])
        while (cells.length < header.length) cells.push('')
        rows.push(cells.slice(0, header.length).map(parseInline))
        i++
      }
      blocks.push({ t: 'table', align, header, rows })
      continue
    }

    // 列表（含嵌套 / 任务列表）
    const first = matchItem(line)
    if (first) {
      const baseIndent = first.indent
      const ordered = first.ordered
      const start = first.start
      const items: ListItem[] = []

      while (i < lines.length) {
        const it = matchItem(lines[i])
        if (!it || it.indent !== baseIndent) break
        const content: string[] = [it.text]
        i++
        // 收集该项的续行（缩进更深，或空行后仍是更深缩进）
        while (i < lines.length) {
          const cur = lines[i]
          if (/^\s*$/.test(cur)) {
            const nxt = lines[i + 1] ?? ''
            const nm = matchItem(nxt)
            const indented = /^\s+\S/.test(nxt) && (!nm || nm.indent > baseIndent)
            if (indented) {
              content.push('')
              i++
              continue
            }
            break
          }
          const curItem = matchItem(cur)
          if (curItem && curItem.indent <= baseIndent) break
          const lead = cur.match(/^\s+/)
          if (lead && lead[0].length > baseIndent) {
            const strip = Math.min(lead[0].length, baseIndent + 2)
            content.push(cur.slice(strip))
            i++
            continue
          }
          break
        }
        let checked: boolean | undefined
        const task = content[0].match(RE_TASK)
        if (task) {
          checked = task[1].toLowerCase() === 'x'
          content[0] = task[2]
        }
        items.push({ checked, blocks: parseMarkdown(content.join('\n')) })
      }

      blocks.push({ t: 'list', ordered, start, items })
      continue
    }

    // 段落：一行一段（见文件头说明）
    blocks.push({ t: 'paragraph', c: parseInline(line) })
    i++
  }

  return blocks
}
