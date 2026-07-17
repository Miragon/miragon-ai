import { useEffect, useMemo, useState } from "react"

import type { Application, Customer } from "../shared/customer.js"

/**
 * Remote-hosted widget served as an MCP resource by `miravelo-upstream`.
 *
 * The host fetches the bundle through `read-widget-bundle` at render time,
 * evaluates it via a Blob URL + dynamic `import()`, and mounts it next to
 * host-bundled widgets. `react` / `react/jsx-runtime` resolve through the
 * host's import map (same React instance — hooks + context Just Work).
 *
 * The data shape comes from `../shared/customer.js` as a *type-only* import:
 * the Zod schema stays on the server, so zod never enters this bundle. At
 * runtime the payload is still untrusted — every field goes through the
 * str/num/bool guards below before rendering.
 */

interface Keys {
  "miravelo:customer"?: unknown
}

/**
 * Theme detection. The host resolves the user's theme (including "system")
 * by toggling the `dark` class on `<html>` — so the widget only follows that
 * class and never consults `prefers-color-scheme` itself.
 */
function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"))
  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains("dark"))
    })
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
  return isDark
}

interface Tone {
  bg: string
  border: string
  text: string
}

interface Palette {
  cardBg: string
  cardShadow: string
  fg: string
  mutedFg: string
  faintFg: string
  divider: string
  subtleBg: string
  notesFg: string
  buttonFg: string
  buttonBorder: string
  headerBadgeBg: string
  headerBadgeFg: string
  headerDot: string
  preBg: string
  preFg: string
  preBorder: string
  segment: Record<string, Tone>
  scoreNeutral: Tone
  scoreGood: Tone
  scoreMid: Tone
  scoreBad: Tone
  priority: Tone
}

const LIGHT: Palette = {
  cardBg: "#ffffff",
  cardShadow: "0 1px 3px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.06)",
  fg: "#0f172a",
  mutedFg: "#64748b",
  faintFg: "#94a3b8",
  divider: "#e2e8f0",
  subtleBg: "#f8fafc",
  notesFg: "#475569",
  buttonFg: "#334155",
  buttonBorder: "#e2e8f0",
  headerBadgeBg: "#e0f2fe",
  headerBadgeFg: "#0369a1",
  headerDot: "#0ea5e9",
  preBg: "#0f172a",
  preFg: "#e2e8f0",
  preBorder: "transparent",
  segment: {
    PRIVATE: { bg: "#eff6ff", border: "#3b82f6", text: "#1d4ed8" },
    BUSINESS: { bg: "#f0fdf4", border: "#22c55e", text: "#15803d" },
    STUDENT: { bg: "#fefce8", border: "#eab308", text: "#a16207" },
  },
  scoreNeutral: { bg: "#f1f5f9", border: "#cbd5e1", text: "#475569" },
  scoreGood: { bg: "#f0fdf4", border: "#22c55e", text: "#15803d" },
  scoreMid: { bg: "#fefce8", border: "#eab308", text: "#a16207" },
  scoreBad: { bg: "#fef2f2", border: "#ef4444", text: "#b91c1c" },
  priority: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
}

const DARK: Palette = {
  cardBg: "#0f172a",
  cardShadow: "0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 1px #334155",
  fg: "#e2e8f0",
  mutedFg: "#94a3b8",
  faintFg: "#64748b",
  divider: "#334155",
  subtleBg: "#1e293b",
  notesFg: "#cbd5e1",
  buttonFg: "#cbd5e1",
  buttonBorder: "#334155",
  headerBadgeBg: "#0c4a6e",
  headerBadgeFg: "#7dd3fc",
  headerDot: "#38bdf8",
  preBg: "#020617",
  preFg: "#e2e8f0",
  preBorder: "#334155",
  segment: {
    PRIVATE: { bg: "#172554", border: "#3b82f6", text: "#93c5fd" },
    BUSINESS: { bg: "#052e16", border: "#22c55e", text: "#4ade80" },
    STUDENT: { bg: "#422006", border: "#eab308", text: "#facc15" },
  },
  scoreNeutral: { bg: "#1e293b", border: "#475569", text: "#cbd5e1" },
  scoreGood: { bg: "#052e16", border: "#22c55e", text: "#4ade80" },
  scoreMid: { bg: "#422006", border: "#eab308", text: "#facc15" },
  scoreBad: { bg: "#450a0a", border: "#ef4444", text: "#f87171" },
  priority: { bg: "#451a03", border: "#f59e0b", text: "#fbbf24" },
}

function makeStyles(p: Palette) {
  return {
    card: {
      background: p.cardBg,
      color: p.fg,
      borderRadius: 12,
      boxShadow: p.cardShadow,
      padding: "1.25rem 1.5rem",
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    },
    headerBadge: {
      display: "inline-flex" as const,
      alignItems: "center" as const,
      gap: 6,
      fontSize: 11,
      fontWeight: 500,
      color: p.headerBadgeFg,
      background: p.headerBadgeBg,
      padding: "2px 8px",
      borderRadius: 999,
      marginBottom: 12,
      letterSpacing: "0.02em",
    },
    headerDot: {
      display: "inline-block" as const,
      width: 6,
      height: 6,
      borderRadius: 999,
      background: p.headerDot,
    },
    h2: { margin: 0, fontSize: 18, fontWeight: 600, color: p.fg },
    meta: { fontSize: 12, color: p.mutedFg, marginTop: 4 },
    divider: { height: 1, background: p.divider, margin: "16px 0" },
    grid: {
      display: "grid" as const,
      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
      gap: "12px 24px",
    },
    sectionLabel: { fontSize: 11, fontWeight: 600, color: p.mutedFg, marginBottom: 8 },
    field: { display: "flex" as const, flexDirection: "column" as const },
    fieldLabel: {
      fontSize: 10,
      fontWeight: 600,
      color: p.mutedFg,
      textTransform: "uppercase" as const,
      letterSpacing: "0.06em",
      marginBottom: 2,
    },
    fieldValue: { fontSize: 14, fontWeight: 500, color: p.fg },
    badgeBase: {
      display: "inline-block" as const,
      fontSize: 10,
      fontWeight: 600,
      padding: "3px 9px",
      borderRadius: 999,
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      whiteSpace: "nowrap" as const,
    },
    notes: {
      marginTop: 12,
      fontSize: 12,
      color: p.notesFg,
      background: p.subtleBg,
      padding: "10px 12px",
      borderRadius: 8,
      fontStyle: "italic" as const,
    },
    rawButton: {
      marginTop: 12,
      padding: "5px 12px",
      border: `1px solid ${p.buttonBorder}`,
      borderRadius: 6,
      background: p.subtleBg,
      color: p.buttonFg,
      cursor: "pointer" as const,
      fontSize: 12,
      fontWeight: 500,
    },
    pre: {
      marginTop: 8,
      padding: "10px 12px",
      background: p.preBg,
      color: p.preFg,
      border: `1px solid ${p.preBorder}`,
      borderRadius: 6,
      fontSize: 11,
      lineHeight: 1.5,
      overflowX: "auto" as const,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    },
  }
}

type Styles = ReturnType<typeof makeStyles>

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  return null
}
function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v
  return null
}

function formatEuro(amount: number | null): string {
  if (amount === null) return "—"
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount)
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function scoreColor(p: Palette, score: number | null): Tone {
  if (score === null) return p.scoreNeutral
  if (score >= 700) return p.scoreGood
  if (score >= 580) return p.scoreMid
  return p.scoreBad
}

export default function LeasingApplication({ keys }: { keys: Keys }) {
  const customer = (keys["miravelo:customer"] ?? {}) as Partial<Customer>
  const [showRaw, setShowRaw] = useState(false)
  const isDark = useIsDark()
  const palette = isDark ? DARK : LIGHT
  const styles = useMemo(() => makeStyles(palette), [palette])

  const name = str(customer.name) || "(unbekannt)"
  const customerId = str(customer.customerId) || "—"
  const email = str(customer.email)
  const segment = str(customer.segment).toUpperCase()
  const region = str(customer.region)
  const channel = str(customer.channel)
  const accountManager = str(customer.accountManager)
  const customerSince = str(customer.customerSince)
  const notes = str(customer.notes)
  const segmentStyle = palette.segment[segment] ?? palette.segment.PRIVATE

  const app: Partial<Application> = customer.application ?? {}
  const bikeModel = str(app.bikeModel)
  const leaseAmount = num(app.leaseAmount)
  const leaseTermMonths = num(app.leaseTermMonths)
  const creditScore = num(app.creditScore)
  const postalCode = str(app.postalCode)
  const priorityFlag = bool(app.priorityFlag)
  const submittedAt = str(app.submittedAt)
  const scoreStyle = scoreColor(palette, creditScore)

  return (
    <div style={styles.card}>
      <div style={styles.headerBadge}>
        <span style={styles.headerDot} />
        remote bundle · miravelo-upstream
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={styles.h2}>{name}</h2>
          <div style={styles.meta}>
            <code>{customerId}</code>
            {email && <> · {email}</>}
            {customerSince && <> · Kunde seit {customerSince}</>}
          </div>
        </div>
        {segment && (
          <span
            style={{
              ...styles.badgeBase,
              background: segmentStyle.bg,
              border: `1px solid ${segmentStyle.border}`,
              color: segmentStyle.text,
              alignSelf: "flex-start",
            }}
          >
            {segment}
          </span>
        )}
      </div>

      <div style={styles.divider} />

      <div style={styles.sectionLabel}>LEASINGANTRAG</div>

      <div style={styles.grid}>
        <Field
          styles={styles}
          label="Bike-Modell"
          value={bikeModel ? capitalize(bikeModel) : "—"}
        />
        <Field styles={styles} label="Leasingbetrag" value={formatEuro(leaseAmount)} />
        <Field
          styles={styles}
          label="Laufzeit"
          value={leaseTermMonths !== null ? `${leaseTermMonths} Monate` : "—"}
        />
        <Field
          styles={styles}
          label="Score"
          value={
            creditScore !== null ? (
              <span
                style={{
                  ...styles.badgeBase,
                  background: scoreStyle.bg,
                  border: `1px solid ${scoreStyle.border}`,
                  color: scoreStyle.text,
                  letterSpacing: "0.04em",
                }}
              >
                {creditScore}
              </span>
            ) : (
              "—"
            )
          }
        />
        <Field styles={styles} label="PLZ" value={postalCode || "—"} />
        <Field styles={styles} label="Region" value={region || "—"} />
        <Field styles={styles} label="Kanal" value={channel || "—"} />
        <Field
          styles={styles}
          label="Priorität"
          value={
            priorityFlag === true ? (
              <span
                style={{
                  ...styles.badgeBase,
                  background: palette.priority.bg,
                  border: `1px solid ${palette.priority.border}`,
                  color: palette.priority.text,
                }}
              >
                priorisiert
              </span>
            ) : priorityFlag === false ? (
              <span style={{ color: palette.faintFg }}>standard</span>
            ) : (
              "—"
            )
          }
        />
        <Field styles={styles} label="Account Manager" value={accountManager || "—"} />
        <Field
          styles={styles}
          label="Eingereicht"
          value={submittedAt ? new Date(submittedAt).toLocaleString("de-DE") : "—"}
        />
      </div>

      {notes && <div style={styles.notes}>{notes}</div>}

      <button type="button" onClick={() => setShowRaw((v) => !v)} style={styles.rawButton}>
        {showRaw ? "raw ausblenden" : "raw anzeigen"}
      </button>
      {showRaw && <pre style={styles.pre}>{JSON.stringify(customer, null, 2)}</pre>}
    </div>
  )
}

function Field({
  styles,
  label,
  value,
}: {
  styles: Styles
  label: string
  value: React.ReactNode
}) {
  return (
    <div style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <span style={styles.fieldValue}>{value}</span>
    </div>
  )
}
