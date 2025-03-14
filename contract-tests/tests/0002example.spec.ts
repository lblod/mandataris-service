import 'dotenv/config';

import { describe, expect, test, beforeAll } from '@jest/globals';
import { mockLogin, userRequest, clearDeltas, getDeltas } from 'contract-tests';
import { beforeEach } from 'node:test';

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

  test('count active mandatarissen in organ', async () => {
    const { body } = await userRequest(
      'GET',
      'http://target/organen/0921318d-c195-4fbf-aadf-2534cdd63c7d/activeMembers',
    );
    expect(body).toMatchSnapshot();
    expect(await getDeltas()).toHaveLength(0);
  });
});
