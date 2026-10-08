import type { Note } from '@/types/note'

export const SYNC_PATH_KEY = 'kaust-knowledge-graph-sync-path'
export const AUTO_SYNC_KEY = 'kaust-knowledge-graph-auto-sync'

export function isDesktop(): boolean {
  return Boolean(window.knowledgeGraphDesktop?.isElectron)
}

export function downloadNotes(notes: Note[], filename: string): void {
  const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' })
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(blob)
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(anchor.href)
}

export async function saveNotesToSyncFile(notes: Note[], filePath: string): Promise<string> {
  const api = window.knowledgeGraphDesktop
  if (!api) throw new Error('桌面文件同步 API 不可用')
  const result = await api.writeSyncFile(filePath, JSON.stringify(notes, null, 2))
  return result.filePath
}
