export function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  // Electron prefixes IPC rejections with the handler location; drop the noise.
  return raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
}
