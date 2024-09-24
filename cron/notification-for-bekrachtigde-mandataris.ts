import { CronJob } from 'cron';

import { querySudo } from '@lblod/mu-auth-sudo';
import {
  getBooleanSparqlResult,
  getSparqlResults,
} from '../util/sparql-result';
import { MANDATARIS_STATUS } from '../util/constants';
import { sparqlEscapeDateTime, sparqlEscapeString } from '../util/mu';
import { createNotification } from '../util/create-notification';
import { bestuurseenheid_sudo } from '../data-access/bestuurseenheid';
import { SEND_EMAILS, sendMailTo } from '../util/create-email';
import { Term } from '../types';
import { sparqlEscapeTermValue } from '../util/sparql-escape';

const SUBJECT = 'Mandataris zonder besluit';
const NOTIFICATION_CRON_PATTERN =
  process.env.NOTIFICATION_CRON_PATTERN || '0 8 * * 1-5'; // Every weekday at 8am
console.log(`NOTIFICATION CRON TIME SET TO: ${NOTIFICATION_CRON_PATTERN}`);
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
        description: `De status van mandataris met uri <${mandatarisWithGraph.mandataris}> staat al 10 dagen of meer of effectief zonder dat er een besluit is toegevoegd.`,
        type: 'warning',
        graph: mandatarisWithGraph.graph.value,
        links: [
          {
            type: 'mandataris',
            uri: mandatarisWithGraph.mandataris.value,
          },
        ],
      });

      if (SEND_EMAILS) {
        const email = await bestuurseenheid_sudo.getContactEmailFromMandataris(
          mandatarisWithGraph.mandataris,
        );
        if (email) {
          await sendMailTo(email.value, mandatarisWithGraph.mandataris.value);
        }
      }
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
      mandataris: term.mandataris,
      graph: term.graph,
    };
  });
}

async function hasNotificationForMandataris(
  mandataris: Term,
  graph: Term,
): Promise<boolean> {
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dct: <http://purl.org/dc/terms/>
    
    ASK {
      GRAPH ${sparqlEscapeTermValue(graph)} {
        ?notification a ext:SystemNotification;
          dct:subject ${sparqlEscapeString(SUBJECT)};
          ext:notificationLink ?notificationLink.
        
        ?notificationLink ext:linkedTo ${sparqlEscapeTermValue(mandataris)}.
      }
    }
  `;

  const sparqlResult = await querySudo(query);

  return getBooleanSparqlResult(sparqlResult);
}
