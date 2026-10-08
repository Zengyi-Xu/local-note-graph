export {}

declare global {
  interface Window {
    knowledgeGraphDesktop?: {
      isElectron: true
      chooseSyncFile: () => Promise<string | null>
      writeSyncFile: (
        filePath: string,
        contents: string,
      ) => Promise<{ filePath: string }>
    }
  }
}
