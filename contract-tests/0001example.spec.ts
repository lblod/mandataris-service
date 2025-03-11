import 'dotenv/config';

import { describe, expect, test, beforeAll } from '@jest/globals';
import { setSession, userRequest } from './requestUtils';

describe('index', () => {
  beforeAll(async () => {
    setSession(
      'http://mu.semte.ch/sessions/a3bacf3e-fb4c-11ef-851c-0242ac120016',
    );
  }, 25000);
  test('hello world', async () => {
    const { body } = await userRequest(
      'GET',
      'http://target/mandatarissen/6729D1A2A12BA678FC88719E/fracties',
    );
    console.log('Deltas', globalThis.deltas);
    expect(body).toMatchSnapshot();
  });

  test('hello world2', async () => {
    expect(1 + 2).toBe(2);
  });
});
