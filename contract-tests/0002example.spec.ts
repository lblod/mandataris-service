import 'dotenv/config';

import { describe, expect, test, beforeAll } from '@jest/globals';

describe('index', () => {
  beforeAll(async () => {}, 25000);
  test('hello world after', async () => {
    expect(1 + 1).toBe(2);
    console.log('Deltas', globalThis.deltas);
  });

  test('hello world after', async () => {
    expect(1 + 2).toBe(2);
  });
});
