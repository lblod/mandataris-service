import { CronJob } from 'cron';

import { querySudo } from '@lblod/mu-auth-sudo';
import {
  getBooleanSparqlResult,
  getSparqlResults,
} from '../util/sparql-result';
import { PUBLICATION_STATUS } from '../util/constants';
import {
  sparqlEscapeDateTime,
  sparqlEscapeString,
  sparqlEscapeUri,
} from '../util/mu';
import { createNotification } from '../util/create-notification';

const SUBJECT = 'Mandataris zonder besluit';
const NOTIFICATION_CRON_PATTERN =
  process.env.NOTIFICATION_CRON_PATTERN || '0 8 * * 1-5'; // Every weekday at 8am
let running = false;

export const cronjob = CronJob.from({
  cronTime: NOTIFICATION_CRON_PATTERN,
  onTick: async () => {
    console.log(
      'DEBUG: Starting cronjob to send notifications for effective mandatees without besluit.',
    );
    if (running) {
      return;
    }
    running = true;
    await HandleEffectieveMandatarissen();
    running = false;
  },
});

async function HandleEffectieveMandatarissen() {
  const mandatarissenWithGraph =
    await fetchEffectiveMandatarissenWithoutBesluit();
  const bufferTime = 1000;
  for (const mandatarisWithGraph of mandatarissenWithGraph) {
    const hasNotification = await hasNotificationForMandataris(
      mandatarisWithGraph.mandataris,
      mandatarisWithGraph.graph,
    );
    if (hasNotification) {
      continue;
    }

    setTimeout(async () => {
      await createNotification({
        title: SUBJECT,
        description: `De status van mandataris met uri <${mandatarisWithGraph.mandataris}> staat al 10 dagen of meer op effectief zonder dat er een besluit is toegevoegd.`,
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

async function fetchEffectiveMandatarissenWithoutBesluit() {
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
            lmb:hasPublicationStatus <${PUBLICATION_STATUS.EFECTIEF}>.

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

async function hasNotificationForMandataris(
  mandataris: string,
  graph: string,
): Promise<boolean> {
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dct: <http://purl.org/dc/terms/>
    
    ASK {
      GRAPH ${sparqlEscapeUri(graph)} {
        ?notification a ext:SystemNotification;
          dct:subject ${sparqlEscapeString(SUBJECT)};
          ext:notificationLink ?notificationLink.
        
        ?notificationLink ext:linkedTo ${sparqlEscapeUri(mandataris)}.
      }
    }
  `;

  const sparqlResult = await querySudo(query);

  return getBooleanSparqlResult(sparqlResult);
}
