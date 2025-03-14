import 'dotenv/config';

import { describe, expect, test, beforeAll } from '@jest/globals';
import {
  mockLogin,
  userRequest,
  clearDeltas,
  expectQueryToHaveNoResults,
  getDeltas,
  runSudoQuery,
} from 'contract-tests';
import { beforeEach } from 'node:test';
import { sparqlEscapeUri } from 'mu';

describe('fractions', () => {
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

  test('get mandataris fraction', async () => {
    const { body } = await userRequest(
      'GET',
      'http://target/mandatarissen/231e42a4-25a6-424b-9885-c16bea74a545/fracties',
    );
    expect(body).toMatchSnapshot();
    expect(await getDeltas()).toHaveLength(0);
  });

  test('update mandataris publication status', async () => {
    const mandatarisUris = [
      'http://data.lblod.info/id/mandatarissen/231e42a4-25a6-424b-9885-c16bea74a545',
      'http://data.lblod.info/id/mandatarissen/2f40df94-a8c6-47bc-8771-493c6b5f29bc',
    ];
    const bekrachtigd =
      'http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/9d8fd14d-95d0-4f5e-b3a5-a56a126227b6';
    // don't have mu but as it's not application code we can be a bit more lenient
    const query = `
      PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
      PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

      SELECT * WHERE {
        VALUES ?mandataris {
          ${mandatarisUris.map((uri) => sparqlEscapeUri(uri)).join('\n')}
        }
        GRAPH ?g {
          ?mandataris lmb:hasPublicationStatus ${sparqlEscapeUri(bekrachtigd)} .
        }
        ?g ext:ownedBy ?someone.
      } ORDER by ?mandataris
    `;
    await expectQueryToHaveNoResults(query);
    const { body } = await userRequest(
      'POST',
      'http://target/mandatarissen/bulk-set-publication-status',
      {
        decision: 'http://data.lblod.info/id/besluit/1',
        statusUri: bekrachtigd,
        mandatarissen: mandatarisUris.map((uri) => uri.split('/').pop()),
      },
    );
    expect(body).toMatchSnapshot();
    const result = await runSudoQuery(query);
    expect(result).toMatchSnapshot();
    expect(await getDeltas()).toMatchSnapshot();
  });

  test('update-mandataris-fractie', async () => {
    // change someone's fraction before
    await runSudoQuery(`
      PREFIX org: <http://www.w3.org/ns/org#>
      DELETE {
        GRAPH ?g {
          ?membership org:organization ?old .
        }
      }
      INSERT {
        GRAPH ?g {
          ?membership org:organization <http://data.lblod.info/id/fracties/673C4FDF9AA6EE1DF1856B4E> .
        }
      }
      WHERE {
        VALUES ?membership {
          <http://data.lblod.info/id/lidmaatschappen/391c5846-659e-4742-86b6-b1b6f30883ff>
        }
        GRAPH ?g {
          ?membership org:organization ?old .
        }
      }`);

    await clearDeltas();
    const { body } = await userRequest(
      'PUT',
      'http://target/fracties/5F914115CE511800080003A4/current-fractie',
    );
    expect(body).toMatchSnapshot();
    expect(await getDeltas()).toMatchSnapshot();
  });
});
