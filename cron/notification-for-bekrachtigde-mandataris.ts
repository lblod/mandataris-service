import { CronJob } from 'cron';

import moment from 'moment';
import { querySudo } from '@lblod/mu-auth-sudo';

import { findFirstSparqlResult, getSparqlResults } from '../util/sparql-result';
import { PUBLICATION_STATUS } from '../util/constants';
import {
  sparqlEscapeDateTime,
  sparqlEscapeString,
  sparqlEscapeUri,
} from '../util/mu';
import { createBulkNotificationMandatarissenWithoutBesluit } from '../util/create-notification';
import {
  SEND_EMAILS,
  sendMissingBekrachtigingsmail,
} from '../util/create-email';

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
    await handleEffectieveMandatarissen();
    running = false;
  },
});

async function handleEffectieveMandatarissen() {
  const mandatarissen =
    await fetchEffectiveMandatarissenWithoutBesluitAndNotification();

  await createBulkNotificationMandatarissenWithoutBesluit(
    SUBJECT,
    mandatarissen,
  );

  if (SEND_EMAILS) {
    const grouped_mandatarissen = mandatarissen.reduce((acc, mandataris) => {
      const { graph } = mandataris;
      if (!acc[graph]) {
        acc[graph] = [];
      }
      acc[graph].push(mandataris);
      return acc;
    }, {});
    for (const key in grouped_mandatarissen) {
      const mandataris_group = grouped_mandatarissen[key];
      const email = await getContactEmailForMandataris(
        mandataris_group.at(0)?.uri,
      );
      if (email) {
        await sendMissingBekrachtigingsmail(email, mandataris_group);
      }
    }
  }
  running = false;
}

async function getContactEmailForMandataris(mandatarisUri?: string) {
  if (!mandatarisUri) {
    return null;
  }
  const query = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX schema: <http://schema.org/>
    SELECT ?email WHERE {
      ${sparqlEscapeUri(mandatarisUri)} a mandaat:Mandataris;
        org:holds ?mandaat.
      ?bestuurseenheid a besluit:Bestuurseenheid.
      ?bestuursorgaan besluit:bestuurt ?bestuurseenheid .
      ?bestuursorgaanInTijd mandaat:isTijdspecialisatieVan ?bestuursorgaan .
      ?bestuursorgaanInTijd org:hasPost ?mandaat .
      
      ?contact a ext:BestuurseenheidContact ;
        ext:contactVoor ?bestuurseenheid ;
        schema:email ?email .
      
    } LIMIT 1
  `;
  const sparqlResult = await querySudo(query);

  return findFirstSparqlResult(sparqlResult)?.email?.value;
}

async function fetchEffectiveMandatarissenWithoutBesluitAndNotification() {
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
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT ?mandataris ?fName ?lName ?bestuursfunctieName ?graph
      WHERE {
        GRAPH ?graph {
          ?mandataris a mandaat:Mandataris ;
            lmb:hasPublicationStatus <${PUBLICATION_STATUS.EFFECTIEF}> ;
            mandaat:isBestuurlijkeAliasVan ?person ;
            org:holds / org:role ?bestuursfunctie .
          ?person persoon:gebruikteVoornaam ?fName ;
            foaf:familyName ?lName .
          OPTIONAL {
            ?mandataris lmb:effectiefAt ?effectiefAt .
          }

          FILTER NOT EXISTS {
            ?notification a ext:SystemNotification;
              dct:subject ${sparqlEscapeString(SUBJECT)};
              ext:notificationLink ?notificationLink.
            ?notificationLink ext:linkedTo ?mandataris.
          }
        }
        ?bestuursfunctie skos:prefLabel ?bestuursfunctieName .
        ?graph ext:ownedBy ?owningEenheid.
        FILTER NOT EXISTS {
          ?graph a <http://mu.semte.ch/graphs/public>
        }

        BIND(IF(BOUND(?effectiefAt), ?effectiefAt, ${escapedTenDaysBefore}) AS ?saveEffectiefAt).
        FILTER(${escapedTenDaysBefore} >= ?saveEffectiefAt)
      }
      ORDER BY ?bestuursfunctieName ?lName
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
