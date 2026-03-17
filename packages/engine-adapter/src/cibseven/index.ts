import { BaseAdapter } from '../base-adapter.js';
import type { EngineType } from '../types.js';

export class CibSevenAdapter extends BaseAdapter {
  readonly engineType: EngineType = 'cibseven';
}
