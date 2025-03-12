import 'dotenv/config';

import { describe, expect, test, beforeAll } from '@jest/globals';
import { mockLogin, userRequest } from './requestUtils';
import { beforeEach } from 'node:test';
import { clearDeltas, getDeltas } from './sparqlUtils';

describe('index', () => {
  beforeAll(async () => {
    await mockLogin(
      'http://data.lblod.info/id/bestuurseenheden/5116efa8-e96e-46a2-aba6-c077e9056a96',
      'http://data.lblod.info/id/accounts/1234',
      'LoketLB-mandaatGebruiker',
    );
  });
  beforeEach(async () => {
    await clearDeltas();
  });

  test('hello world after', async () => {
    const { body } = await userRequest(
      'GET',
      'http://target/mandataris-api/organen/0921318d-c195-4fbf-aadf-2534cdd63c7d/activeMembers',
    );
    expect(body).toMatchSnapshot();
    expect(await getDeltas()).toHaveLength(0);
  });
});
