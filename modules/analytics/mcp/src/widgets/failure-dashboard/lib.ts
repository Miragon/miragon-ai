export const PERIODS = ["1d", "7d", "30d", "90d"] as const
export type Period = (typeof PERIODS)[number]

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function truncate(s: string, max: number): string {
  if (!s) return "—"
  return s.length > max ? s.slice(0, max) + "…" : s
}
