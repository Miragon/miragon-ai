import { describe, it, expect } from 'vitest';
import { createEngineAdapter } from '../src/factory.js';
import { Camunda7Adapter } from '../src/camunda7/index.js';
import { CibSevenAdapter } from '../src/cibseven/index.js';
import { OperatonAdapter } from '../src/operaton/index.js';

describe('createEngineAdapter', () => {
  const baseConfig = {
    baseUrl: 'http://localhost:8080/engine-rest',
    authType: 'basic' as const,
    username: 'demo',
    password: 'demo',
  };

  it('should create a Camunda7Adapter', () => {
    const adapter = createEngineAdapter({ ...baseConfig, engineType: 'camunda7' });
    expect(adapter).toBeInstanceOf(Camunda7Adapter);
    expect(adapter.engineType).toBe('camunda7');
  });

  it('should create a CibSevenAdapter', () => {
    const adapter = createEngineAdapter({ ...baseConfig, engineType: 'cibseven' });
    expect(adapter).toBeInstanceOf(CibSevenAdapter);
    expect(adapter.engineType).toBe('cibseven');
  });

  it('should create an OperatonAdapter', () => {
    const adapter = createEngineAdapter({ ...baseConfig, engineType: 'operaton' });
    expect(adapter).toBeInstanceOf(OperatonAdapter);
    expect(adapter.engineType).toBe('operaton');
  });

  it('should throw for unsupported engine type', () => {
    expect(() => createEngineAdapter({ ...baseConfig, engineType: 'invalid' as any }))
      .toThrow('Unsupported engine type: invalid');
  });
});
