import type { EngineAdapter } from './adapter.js';
import type { AdapterConfig } from './types.js';
import { Camunda7Adapter } from './camunda7/index.js';
import { CibSevenAdapter } from './cibseven/index.js';
import { OperatonAdapter } from './operaton/index.js';

export function createEngineAdapter(config: AdapterConfig): EngineAdapter {
  switch (config.engineType) {
    case 'camunda7':
      return new Camunda7Adapter(config);
    case 'cibseven':
      return new CibSevenAdapter(config);
    case 'operaton':
      return new OperatonAdapter(config);
    default:
      throw new Error(`Unsupported engine type: ${config.engineType satisfies never}`);
  }
}
