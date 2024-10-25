import { CronJob } from 'cron';

import moment from 'moment';
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
import { bestuurseenheid_sudo } from '../data-access/bestuurseenheid';
import { SEND_EMAILS, sendMailTo } from '../util/create-email';

const SUBJECT = 'Mandataris zonder besluit';
const NOTIFICATION_CRON_PATTERN =
  process.env.NOTIFICATION_CRON_PATTERN || '0 8 * * 1-5'; // Every weekday at 8am
console.log(`NOTIFICATION CRON TIME SET TO: ${NOTIFICATION_CRON_PATTERN}`);
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
  const mandatarissen = await fetchEffectiveMandatarissenWithoutBesluit();
  const bufferTime = 1000;
  for (const mandataris of mandatarissen) {
    const hasNotification = await hasNotificationForMandataris(
      mandataris.uri,
      mandataris.graph,
    );
    if (hasNotification) {
      continue;
    }

    setTimeout(async () => {
      await createNotification({
        title: SUBJECT,
        description: `De publicatie status van ${mandataris.name} met mandaat ${mandataris.mandate} staat al 10 dagen of meer op effectief zonder dat er een besluit is toegevoegd. Gelieve deze mandataris manueel te bekrachtigen en een besluit toe te voegen of publiceer het besluit van de installatievergadering via een notuleringspakket.`,
        type: 'warning',
        graph: mandataris.graph,
        links: [
          {
            type: 'mandataris',
            uri: mandataris.uri,
          },
        ],
      });

      if (SEND_EMAILS) {
        const email = await bestuurseenheid_sudo.getContactEmailFromMandataris(
          mandataris.uri,
        );
        if (email) {
          await sendMailTo(email, mandataris);
        }
      }
    }, bufferTime);
  }
  running = false;
}

async function fetchEffectiveMandatarissenWithoutBesluit() {
  const momentTenDaysAgo = moment(new Date()).subtract(10, 'days');
  const escapedTenDaysBefore = sparqlEscapeDateTime(momentTenDaysAgo.toDate());
  const query = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
  
    SELECT DISTINCT ?mandataris ?fName ?lName ?bestuursfunctieName ?graph
      WHERE {
        GRAPH ?graph {
          ?mandataris a mandaat:Mandataris ;
            lmb:hasPublicationStatus <${PUBLICATION_STATUS.EFECTIEF}> ;
            mandaat:isBestuurlijkeAliasVan ?person ;
            org:holds / org:role ?bestuursfunctie .
          ?person persoon:gebruikteVoornaam ?fName ;
            foaf:familyName ?lName .
          OPTIONAL {
            ?mandataris lmb:effectiefAt ?effectiefAt .
          }
        }
        ?bestuursfunctie skos:prefLabel ?bestuursfunctieName .
        FILTER NOT EXISTS {
          ?graph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
        }
        FILTER NOT EXISTS {
          ?graph a <http://mu.semte.ch/graphs/public>
        }

        FILTER(${escapedTenDaysBefore} >= ?saveEffectiefAt)
        BIND(IF(BOUND(?effectiefAt), ?effectiefAt, ${escapedTenDaysBefore}) AS ?saveEffectiefAt).
      }
  `;

  const sparqlResult = await querySudo(query);
  const results = getSparqlResults(sparqlResult);

  return results.map((term) => {
    return {
      uri: term.mandataris.value,
      name: `${term.fName.value} ${term.lName.value}`,
      mandate: term.bestuursfunctieName.value,
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
