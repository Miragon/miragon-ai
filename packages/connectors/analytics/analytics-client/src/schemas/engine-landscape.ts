import { z } from "zod"

export const engineLandscapeInput = z.object({
  engine: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      "Engine ids to include; omitted = every configured engine. An engine that reports no metrics at all comes back with `reporting: false`.",
    ),
})
