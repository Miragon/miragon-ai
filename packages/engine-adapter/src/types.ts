export type EngineType = 'camunda7' | 'cibseven' | 'operaton';

export type AuthType = 'basic' | 'bearer' | 'none';

export interface AdapterConfig {
  engineType: EngineType;
  baseUrl: string;
  authType: AuthType;
  username?: string;
  password?: string;
  token?: string;
}

export interface HttpClientConfig {
  baseUrl: string;
  authType: AuthType;
  username?: string;
  password?: string;
  token?: string;
}
