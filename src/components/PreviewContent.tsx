import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Note } from '@/types/note'
import { Markdown } from './Markdown'
import baseStyles from '@/index.css?inline'

export type PreviewTheme = 'default' | 'paper' | 'night' | 'custom'

const themeStyles: Record<Exclude<PreviewTheme, 'custom'>, string> = {
  default: `
    #write { background: #fff; color: #202428; font-family: system-ui, sans-serif; }
    #write a, #write button { color: #087e84; }
  `,
  paper: `
    #write { background: #fcfaf5; color: #273430; font-family: Georgia, "Noto Serif CJK SC", serif; line-height: 1.8; }
    #write h1, #write h2, #write h3 { color: #146b69; }
    #write a, #write button { color: #ad503a; }
    #write pre, #write code { background: #f0ede5; }
    #write blockquote { border-color: #d67c5e; color: #52605b; }
  `,
  night: `
    #write { background: #202827; color: #e4e9e5; font-family: system-ui, sans-serif; }
    #write h1, #write h2, #write h3 { color: #a8d8c6; }
    #write a, #write button { color: #9bd5cb; }
    #write pre, #write code, #write th { background: #303d3a; color: #e4e9e5; }
    #write blockquote { color: #b2c4ba; }
    #write td, #write th, #write img { border-color: #53635c; }
  `,
}

interface Props {
  content: string
  notes: Note[]
  onOpenNote: (id: string) => void
  onCreateNote: (title: string) => void
  theme: PreviewTheme
  customCss: string
}

export function PreviewContent({ content, notes, onOpenNote, onCreateNote, theme, customCss }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [shadow, setShadow] = useState<ShadowRoot | null>(null)

  useEffect(() => {
    if (hostRef.current && !hostRef.current.shadowRoot) {
      setShadow(hostRef.current.attachShadow({ mode: 'open' }))
    }
  }, [])

  return (
    <div ref={hostRef} className="h-full overflow-y-auto">
      {shadow && createPortal(
        <>
          <style>{baseStyles}</style>
          <style>{`
            :host { display: block; min-height: 100%; }
            #write { box-sizing: border-box; min-height: 100%; margin: 0 auto; padding: 28px clamp(20px, 5%, 64px) 64px; }
            #write > div { max-width: 820px; margin: 0 auto; font-size: 15px; line-height: 1.7; }
            #write button { cursor: pointer; font: inherit; }
            ${theme === 'custom' ? themeStyles.default : themeStyles[theme]}
          `}</style>
          {theme === 'custom' && <style>{customCss}</style>}
          <div id="write">
            <Markdown content={content} notes={notes} onOpenNote={onOpenNote} onCreateNote={onCreateNote} />
          </div>
        </>,
        shadow,
      )}
    </div>
  )
}
