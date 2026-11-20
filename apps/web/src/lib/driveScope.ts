// Client-safe twin of hasDriveScope (server version lives in lib/server/driveCore.ts).
export function hasDriveScope(granted: string | null | undefined): boolean {
  const s = (granted ?? "").split(/\s+/);
  return s.includes("https://www.googleapis.com/auth/drive.file") || s.includes("https://www.googleapis.com/auth/drive");
}
