import 'dotenv/config';

import { beforeAll, describe, expect, test } from '@jest/globals';
import { clearDeltas, getDeltas, mockLogin, userRequest } from 'contract-tests';
import { beforeEach } from 'node:test';

describe('fractions', () => {
  beforeAll(async () => {
    await mockLogin(
      'http://data.lblod.info/id/bestuurseenheden/d769b4b9411ad25f67c1d60b0a403178e24a800e1671fb3258280495011d8e18',
      'http://data.lblod.info/id/accounts/1234',
      'LoketLB-mandaatGebruiker',
    );
  });

  beforeEach(async () => {
    await clearDeltas();
  });

  test('it should not allow changing the fraction to one that is not used in gemeente', async () => {
    const { body } = await userRequest(
      'POST',
      'http://target/personen/db35d79036a5ea82fe41e2a90ed2dc8c5327ea7c1033e47be0ea418103241a82/check-fraction',
      {
        bestuursperiodeId: '96efb929-5d83-48fa-bfbb-b98dfb1180c7',
        fractieId: '673340D73B862019FED2B9B3',
      },
    );
    expect(body).toMatchSnapshot();
    expect(await getDeltas()).toHaveLength(0);
  });

  test('it should allow changing the fractie to one that is used in gemeente', async () => {
    const { body } = await userRequest(
      'POST',
      'http://target/personen/db35d79036a5ea82fe41e2a90ed2dc8c5327ea7c1033e47be0ea418103241a82/check-fraction',
      {
        bestuursperiodeId: '96efb929-5d83-48fa-bfbb-b98dfb1180c7',
        fractieId: '6733409B3B862019FED2B9AC',
      },
    );
    expect(body).toMatchSnapshot();
    expect(await getDeltas()).toHaveLength(0);
  });
});
