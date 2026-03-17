import { BaseAdapter } from '../base-adapter.js';
import type { EngineType } from '../types.js';

export class Camunda7Adapter extends BaseAdapter {
  readonly engineType: EngineType = 'camunda7';
}
