import { z } from 'zod';

const configSchema = z.object({
  engineType: z.enum(['camunda7', 'cibseven', 'operaton']).default('cibseven'),
  baseUrl: z.string().url().default('http://localhost:8080/engine-rest'),
  authType: z.enum(['basic', 'bearer', 'none']).default('basic'),
  username: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
});

export type ServerConfig = z.infer<typeof configSchema>;

export function loadConfig(): ServerConfig {
  return configSchema.parse({
    engineType: process.env.ENGINE_TYPE,
    baseUrl: process.env.ENGINE_BASE_URL,
    authType: process.env.ENGINE_AUTH_TYPE,
    username: process.env.ENGINE_USERNAME,
    password: process.env.ENGINE_PASSWORD,
    token: process.env.ENGINE_TOKEN,
  });
}
