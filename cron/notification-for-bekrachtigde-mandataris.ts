import { CronJob } from 'cron';

import { querySudo } from '@lblod/mu-auth-sudo';
import { getSparqlResults } from '../util/sparql-result';
import { MANDATARIS_STATUS } from '../util/constants';
import { sparqlEscapeDateTime } from '../util/mu';
import { createNotification } from '../util/create-notification';

const NOTIFICATION_CRON_PATTERN =
  process.env.BESLUIT_CRON_PATTERN || '0 0 * * SUN'; // Every week at 00:00 on monday
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
  const mandatarissenWithGraph = await fetchMandatarissen();
  const bufferTime = 1000;
  for (const mandatarisWithGraph of mandatarissenWithGraph) {
    setTimeout(async () => {
      console.log(`Create notification for ${mandatarisWithGraph.mandataris}`);
      createNotification({
        title: 'Mandataris zonder besluit',
        description: `De status van mandataris met uri <${mandatarisWithGraph.mandataris}> staat al 10 dagen of meer of effectief zonder dat er een besluit is toegevoegd.`,
        type: 'warning',
        graph: mandatarisWithGraph.graph,
        links: [
          {
            type: 'mandataris',
            uri: mandatarisWithGraph.mandataris,
          },
        ],
      });
    }, bufferTime);
  }
  running = false;
}

async function fetchMandatarissen() {
  const tenDaysBefore = new Date();
  tenDaysBefore.setDate(tenDaysBefore.getDate() - 10);
  const escapedToday = sparqlEscapeDateTime(new Date());
  const query = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  
    SELECT DISTINCT ?mandataris ?graph
      WHERE {
        GRAPH ?graph {
          ?mandataris a mandaat:Mandataris;
            mandaat:status <${MANDATARIS_STATUS.EFFECTIEF}>.

          OPTIONAL {
            ?mandaat lmb:effectiefAt ?saveEffectiefAt.
          }
        }
        FILTER NOT EXISTS {
          ?graph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
        }
        FILTER NOT EXISTS {
          ?graph a <http://mu.semte.ch/graphs/public>
        }

        FILTER(${sparqlEscapeDateTime(tenDaysBefore)} <= ?saveEffectiefAt)
        BIND(IF(BOUND(?effectiefAt), ?effectiefAt, ${escapedToday}) AS ?saveEffectiefAt).
      }
  `;

  const sparqlResult = await querySudo(query);
  const results = getSparqlResults(sparqlResult);

  return results.map((term) => {
    return {
      mandataris: term.mandataris.value,
      graph: term.graph.value,
    };
  });
}
