import { useState } from "react"

/**
 * Remote-hosted widget served as an MCP resource by `miravelo-upstream`.
 *
 * The host fetches the bundle through `read-widget-bundle` at render time,
 * evaluates it via a Blob URL + dynamic `import()`, and mounts it next to
 * host-bundled widgets. `react` / `react/jsx-runtime` resolve through the
 * host's import map (same React instance — hooks + context Just Work).
 */

interface Application {
  bikeModel?: unknown
  leaseAmount?: unknown
  leaseTermMonths?: unknown
  creditScore?: unknown
  postalCode?: unknown
  priorityFlag?: unknown
  submittedAt?: unknown
}

interface Customer {
  customerId?: unknown
  name?: unknown
  email?: unknown
  segment?: unknown
  region?: unknown
  channel?: unknown
  accountManager?: unknown
  customerSince?: unknown
  application?: Application
  notes?: unknown
}

interface Keys {
  "miravelo:customer"?: unknown
}

const segmentColor: Record<string, { bg: string; border: string; text: string }> = {
  PRIVATE: { bg: "#eff6ff", border: "#3b82f6", text: "#1d4ed8" },
  BUSINESS: { bg: "#f0fdf4", border: "#22c55e", text: "#15803d" },
  STUDENT: { bg: "#fefce8", border: "#eab308", text: "#a16207" },
}

const styles = {
  card: {
    background: "#ffffff",
    color: "#0f172a",
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.06)",
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
    color: "#0369a1",
    background: "#e0f2fe",
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
    background: "#0ea5e9",
  },
  h2: { margin: 0, fontSize: 18, fontWeight: 600, color: "#0f172a" },
  meta: { fontSize: 12, color: "#64748b", marginTop: 4 },
  divider: { height: 1, background: "#e2e8f0", margin: "16px 0" },
  grid: {
    display: "grid" as const,
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "12px 24px",
  },
  field: { display: "flex" as const, flexDirection: "column" as const },
  fieldLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 2,
  },
  fieldValue: { fontSize: 14, fontWeight: 500, color: "#0f172a" },
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
    color: "#475569",
    background: "#f8fafc",
    padding: "10px 12px",
    borderRadius: 8,
    fontStyle: "italic" as const,
  },
}

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

function scoreColor(score: number | null): { bg: string; border: string; text: string } {
  if (score === null) return { bg: "#f1f5f9", border: "#cbd5e1", text: "#475569" }
  if (score >= 700) return { bg: "#f0fdf4", border: "#22c55e", text: "#15803d" }
  if (score >= 580) return { bg: "#fefce8", border: "#eab308", text: "#a16207" }
  return { bg: "#fef2f2", border: "#ef4444", text: "#b91c1c" }
}

export default function LeasingApplication({ keys }: { keys: Keys }) {
  const customer = (keys["miravelo:customer"] ?? {}) as Customer
  const [showRaw, setShowRaw] = useState(false)

  const name = str(customer.name) || "(unbekannt)"
  const customerId = str(customer.customerId) || "—"
  const email = str(customer.email)
  const segment = str(customer.segment).toUpperCase()
  const region = str(customer.region)
  const channel = str(customer.channel)
  const accountManager = str(customer.accountManager)
  const customerSince = str(customer.customerSince)
  const notes = str(customer.notes)
  const segmentStyle = segmentColor[segment] ?? segmentColor.PRIVATE

  const app = customer.application ?? {}
  const bikeModel = str(app.bikeModel)
  const leaseAmount = num(app.leaseAmount)
  const leaseTermMonths = num(app.leaseTermMonths)
  const creditScore = num(app.creditScore)
  const postalCode = str(app.postalCode)
  const priorityFlag = bool(app.priorityFlag)
  const submittedAt = str(app.submittedAt)
  const scoreStyle = scoreColor(creditScore)

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

      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>
        LEASINGANTRAG
      </div>

      <div style={styles.grid}>
        <Field label="Bike-Modell" value={bikeModel ? capitalize(bikeModel) : "—"} />
        <Field label="Leasingbetrag" value={formatEuro(leaseAmount)} />
        <Field
          label="Laufzeit"
          value={leaseTermMonths !== null ? `${leaseTermMonths} Monate` : "—"}
        />
        <Field
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
        <Field label="PLZ" value={postalCode || "—"} />
        <Field label="Region" value={region || "—"} />
        <Field label="Kanal" value={channel || "—"} />
        <Field
          label="Priorität"
          value={
            priorityFlag === true ? (
              <span
                style={{
                  ...styles.badgeBase,
                  background: "#fef3c7",
                  border: "1px solid #f59e0b",
                  color: "#92400e",
                }}
              >
                priorisiert
              </span>
            ) : priorityFlag === false ? (
              <span style={{ color: "#94a3b8" }}>standard</span>
            ) : (
              "—"
            )
          }
        />
        <Field label="Account Manager" value={accountManager || "—"} />
        <Field
          label="Eingereicht"
          value={submittedAt ? new Date(submittedAt).toLocaleString("de-DE") : "—"}
        />
      </div>

      {notes && <div style={styles.notes}>{notes}</div>}

      <button
        type="button"
        onClick={() => setShowRaw((v) => !v)}
        style={{
          marginTop: 12,
          padding: "5px 12px",
          border: "1px solid #e2e8f0",
          borderRadius: 6,
          background: "#f8fafc",
          color: "#334155",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {showRaw ? "raw ausblenden" : "raw anzeigen"}
      </button>
      {showRaw && (
        <pre
          style={{
            marginTop: 8,
            padding: "10px 12px",
            background: "#0f172a",
            color: "#e2e8f0",
            borderRadius: 6,
            fontSize: 11,
            lineHeight: 1.5,
            overflowX: "auto",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {JSON.stringify(customer, null, 2)}
        </pre>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <span style={styles.fieldValue}>{value}</span>
    </div>
  )
}
