import { z } from "zod"

export const engineLandscapeInput = z.object({
  engine: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      'Engine ids to include. Pass the FULL list of configured engines to also surface engines that report no metrics at all (they come back with `reporting: false`); when omitted, only engines Prometheus holds series for appear. Discover ids with the camunda7_engine tool (action "list").',
    ),
})
