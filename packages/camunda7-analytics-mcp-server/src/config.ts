import { z } from 'zod';

const configSchema = z.object({
  clickhouseUrl: z.string().default('http://localhost:8123'),
  clickhouseUser: z.string().default('camunda'),
  clickhousePassword: z.string().default('camunda123'),
  clickhouseDatabase: z.string().default('camunda_history'),
});

export type AnalyticsConfig = z.infer<typeof configSchema>;

export function loadConfig(): AnalyticsConfig {
  return configSchema.parse({
    clickhouseUrl: process.env.CLICKHOUSE_URL,
    clickhouseUser: process.env.CLICKHOUSE_USER,
    clickhousePassword: process.env.CLICKHOUSE_PASSWORD,
    clickhouseDatabase: process.env.CLICKHOUSE_DATABASE,
  });
}
