import { z } from "zod"

/**
 * Single source of truth for the customer + leasing-application data shape.
 *
 * - `server.ts` uses the Zod schema at runtime (tool `outputSchema`).
 * - `widget/LeasingApplication.tsx` uses the inferred types only — imported
 *   with `import type` so zod never enters the widget bundle.
 */
export const customerSchema = z.object({
  customerId: z.string(),
  name: z.string(),
  email: z.string(),
  segment: z.enum(["PRIVATE", "BUSINESS", "STUDENT"]),
  region: z.enum(["EU", "US", "APAC"]),
  channel: z.enum(["ONLINE", "BRANCH", "FAX"]),
  accountManager: z.string(),
  customerSince: z.string(),
  application: z.object({
    bikeModel: z.enum(["city", "cargo", "trail", "road"]),
    leaseAmount: z.number(),
    leaseTermMonths: z.union([z.literal(12), z.literal(24), z.literal(36), z.literal(48)]),
    creditScore: z.number(),
    postalCode: z.string(),
    priorityFlag: z.boolean(),
    submittedAt: z.string(),
  }),
  notes: z.string(),
})

export type Customer = z.infer<typeof customerSchema>
export type Application = Customer["application"]
