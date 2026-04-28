/**
 * Mock CRM data for the Miravelo leasing showcase.
 *
 * The Camunda seeder (`MiraveloLeasingSeeder.kt`) emits customer IDs as
 * `CUST-XXXXX` (5-digit suffix). This file ships a small handful of
 * "well-known" customer records so demos can reference stable IDs; for any
 * other CUST-XXXXX the upstream synthesises a deterministic profile from the
 * id so every running instance has *some* answer.
 */

export type CustomerSegment = "PRIVATE" | "BUSINESS" | "STUDENT"
export type Region = "EU" | "US" | "APAC"
export type Channel = "ONLINE" | "BRANCH" | "FAX"
export type BikeModel = "city" | "cargo" | "trail" | "road"

export interface LeasingCustomer {
  customerId: string
  name: string
  email: string
  segment: CustomerSegment
  region: Region
  channel: Channel
  /** Salesforce/CRM-style account manager. */
  accountManager: string
  /** ISO date the customer first became a customer. */
  customerSince: string
  /** Canonical leasing application snapshot — last submitted application. */
  application: {
    bikeModel: BikeModel
    leaseAmount: number
    leaseTermMonths: 12 | 24 | 36 | 48
    creditScore: number
    postalCode: string
    priorityFlag: boolean
    submittedAt: string
  }
  /** Free-text customer notes — surfaced in the widget for human context. */
  notes: string
}

const WELL_KNOWN: LeasingCustomer[] = [
  {
    customerId: "CUST-12345",
    name: "Anna Becker",
    email: "anna.becker@example.de",
    segment: "PRIVATE",
    region: "EU",
    channel: "ONLINE",
    accountManager: "Markus Hoffmann",
    customerSince: "2023-04-12",
    application: {
      bikeModel: "city",
      leaseAmount: 2400,
      leaseTermMonths: 24,
      creditScore: 742,
      postalCode: "10115",
      priorityFlag: false,
      submittedAt: "2026-04-12T09:31:00Z",
    },
    notes: "Stammkundin. Bevorzugt Online-Kommunikation, schnelle Antworten erwartet.",
  },
  {
    customerId: "CUST-23456",
    name: "Globex Logistik GmbH",
    email: "fuhrpark@globex.example.com",
    segment: "BUSINESS",
    region: "EU",
    channel: "BRANCH",
    accountManager: "Sabine Klein",
    customerSince: "2021-09-01",
    application: {
      bikeModel: "cargo",
      leaseAmount: 18500,
      leaseTermMonths: 24,
      creditScore: 685,
      postalCode: "20095",
      priorityFlag: true,
      submittedAt: "2026-04-15T14:02:00Z",
    },
    notes: "Cargo-Flottenkunde. 24-Monats-Cap durch Risk-Policy (cargo-Hardlimit).",
  },
  {
    customerId: "CUST-34567",
    name: "Tobias Lehmann",
    email: "t.lehmann@uni-leipzig.example",
    segment: "STUDENT",
    region: "EU",
    channel: "ONLINE",
    accountManager: "—",
    customerSince: "2025-10-20",
    application: {
      bikeModel: "trail",
      leaseAmount: 1200,
      leaseTermMonths: 36,
      creditScore: 612,
      postalCode: "04109",
      priorityFlag: false,
      submittedAt: "2026-04-20T18:44:00Z",
    },
    notes: "Studentenrate; Score knapp über Mindestschwelle.",
  },
]

const segments: CustomerSegment[] = ["PRIVATE", "BUSINESS", "STUDENT"]
const regions: Region[] = ["EU", "US", "APAC"]
const channels: Channel[] = ["ONLINE", "BRANCH", "FAX"]
const bikeModels: BikeModel[] = ["city", "cargo", "trail", "road"]

/**
 * Returns a deterministic mock profile for an unknown CUST-XXXXX id. Same id
 * always yields the same profile, so demos referring to a randomly-seeded
 * instance still see stable data.
 */
function synthesise(customerId: string): LeasingCustomer {
  // `>>>` (unsigned shift) keeps the seed positive — `>>` would treat
  // hashes > 2^31 as signed-negative, yielding negative modulo results
  // and `undefined` array lookups that zod's `outputSchema` then silently
  // strips, leaving the widget without those fields.
  const seed = hash(customerId)
  const segment = segments[seed % segments.length]
  const region = regions[(seed >>> 3) % regions.length]
  const channel = channels[(seed >>> 5) % channels.length]
  const bikeModel = bikeModels[(seed >>> 7) % bikeModels.length]
  const leaseTerm = ([12, 24, 36, 48] as const)[(seed >>> 9) % 4]
  const cappedTerm: 12 | 24 | 36 | 48 = bikeModel === "cargo" && leaseTerm > 24 ? 24 : leaseTerm
  const leaseAmount = 800 + ((seed * 17) % 23800)
  const creditScore = 300 + ((seed * 13) % 551)
  const postalCode = String(10000 + ((seed * 7) % 89999)).slice(0, 5)
  return {
    customerId,
    name: `Synthetic Customer ${customerId.slice(-5)}`,
    email: `${customerId.toLowerCase()}@example.invalid`,
    segment,
    region,
    channel,
    accountManager: segment === "BUSINESS" ? "Default BizDesk" : "—",
    customerSince: "2024-01-01",
    application: {
      bikeModel,
      leaseAmount,
      leaseTermMonths: cappedTerm,
      creditScore,
      postalCode,
      priorityFlag: (seed & 1) === 1,
      submittedAt: "2026-04-01T00:00:00Z",
    },
    notes: "Synthetisches Profil — kein realer CRM-Eintrag.",
  }
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return h
}

export function lookupCustomer(customerId: string): LeasingCustomer {
  return WELL_KNOWN.find((c) => c.customerId === customerId) ?? synthesise(customerId)
}

export function listKnownCustomers(): LeasingCustomer[] {
  return WELL_KNOWN
}
