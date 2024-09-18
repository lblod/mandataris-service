import { CronJob } from 'cron';

import { querySudo } from '@lblod/mu-auth-sudo';
import { getSparqlResults } from '../util/sparql-result';

const NOTIFICATION_CRON_PATTERN = '* * * * *';
let running = false;

export const cronjob = CronJob.from({
  cronTime: NOTIFICATION_CRON_PATTERN,
  onTick: async () => {
    if (running) {
      return;
    }
    running = true;
    await HandleEffectieveMandatarissen();
    running = false;
  },
});

async function HandleEffectieveMandatarissen() {
  await fetchMandatarissen();
  running = false;
}

async function fetchMandatarissen() {
  const query = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  
    SELECT DISTINCT ?mandataris
      WHERE {
        GRAPH ?graph {
          ?mandataris a mandaat:Mandataris;
            mandaat:status <http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75>.
        }
        FILTER NOT EXISTS {
          ?graph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
        }
        FILTER NOT EXISTS {
          ?graph a <http://mu.semte.ch/graphs/public>
        }
      }
  `;

  const sparqlResult = await querySudo(query);
  const results = getSparqlResults(sparqlResult);

  console.log('LOG: results', results.length);
}
