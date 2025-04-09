import { CronJob } from 'cron';

import moment from 'moment';
import { querySudo } from '@lblod/mu-auth-sudo';
import {
  sparqlEscapeDateTime,
  sparqlEscapeString,
  sparqlEscapeUri,
  uuid,
} from 'mu';

import { findFirstSparqlResult, getSparqlResults } from '../util/sparql-result';
import { PUBLICATION_STATUS } from '../util/constants';
import { HttpError } from '../util/http-error';
import { createBulkNotificationMandatarissenWithoutBesluit } from '../util/create-notification';
import {
  SEND_EMAILS,
  sendMissingBekrachtigingsmail,
} from '../util/create-email';

export const SUBJECT_DECISION = 'Actieve mandataris zonder besluit';
const BATCH_SIZE = 100;
const NOTIFICATION_CRON_PATTERN = process.env.NOTIFICATION_CRON_PATTERN; // disable by default
console.log(
  `NOTIFICATION CRON TIME SET TO: ${NOTIFICATION_CRON_PATTERN ?? 'DISABLED'}`,
);
let running = false;

let job = {
  start: () => {},
};
if (NOTIFICATION_CRON_PATTERN) {
  job = CronJob.from({
    cronTime: NOTIFICATION_CRON_PATTERN,
    onTick: async () => {
      console.log(
        'DEBUG: Starting cronjob to send notifications for active mandatarissen without besluit.',
      );
      if (running) {
        return;
      }
      await handleMandatarissen();
    },
  });
}

export const cronjob = job;

async function handleBatchOfMandatarissen(keyOfRun: string) {
  const mandatarissen = await fetchActiveMandatarissenWithoutBesluit();

  if (mandatarissen.length == 0) {
    return mandatarissen;
  }

  await createBulkNotificationMandatarissenWithoutBesluit(
    SUBJECT_DECISION,
    mandatarissen,
    keyOfRun,
  );

  return mandatarissen;
}

export async function handleMandatarissen() {
  running = true;
  const keyOfRun = uuid();
  let moreToDo = true;
  while (moreToDo) {
    const processed = await handleBatchOfMandatarissen(keyOfRun);
    moreToDo = processed.length > 0;
  }
  await sendEmailsForNotifications(keyOfRun);
  running = false;
}

async function sendEmailsForNotifications(keyOfRun: string) {
  if (!SEND_EMAILS) {
    return;
  }
  const graphs = await getGraphsWithMandatarissenRequiringMail(keyOfRun);
  for (const graph of graphs) {
    const mandatarissen = await getMandatarissenToNotifyAbout(graph, keyOfRun);
    const email = await getContactEmailForMandataris(mandatarissen[0]?.uri);
    if (email) {
      await sendMissingBekrachtigingsmail(email, mandatarissen);
    }
  }
}

async function getGraphsWithMandatarissenRequiringMail(keyOfRun: string) {
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX dct: <http://purl.org/dc/terms/>

    SELECT DISTINCT ?g WHERE {
      GRAPH ?g {
        ?mandataris a mandaat:Mandataris .
        ?notification a ext:SystemNotification ;
          dct:subject ${sparqlEscapeString(SUBJECT_DECISION)} ;
          ext:generatedByRun ${sparqlEscapeString(keyOfRun)} ;
          ext:notificationLink / ext:linkedTo ?mandataris .
      }
      ?g ext:ownedBy ?eenheid.
    }
  `;
  const result = await querySudo(query);
  return getSparqlResults(result).map((term) => term.g.value);
}

async function getMandatarissenToNotifyAbout(graph: string, keyOfRun: string) {
  const query = `
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>

    SELECT DISTINCT ?mandataris ?fName ?lName ?bestuursfunctieName WHERE {
      GRAPH ${sparqlEscapeUri(graph)} {
        ?mandataris a mandaat:Mandataris ;
            mandaat:isBestuurlijkeAliasVan ?person ;
            org:holds / org:role ?bestuursfunctie .
        ?person persoon:gebruikteVoornaam ?fName ;
            foaf:familyName ?lName .

        ?notification a ext:SystemNotification ;
          dct:subject ${sparqlEscapeString(SUBJECT_DECISION)} ;
          ext:generatedByRun ${sparqlEscapeString(keyOfRun)} ;
          ext:notificationLink / ext:linkedTo ?mandataris .
      }
      ?bestuursfunctie skos:prefLabel ?bestuursfunctieName .
      ?g ext:ownedBy ?eenheid.
    } ORDER BY ?bestuursfunctieName ?lName ?fName
  `;
  const result = await querySudo(query);
  return getSparqlResults(result).map((term) => {
    return {
      uri: term.mandataris.value,
      name: `${term.fName.value} ${term.lName.value}`,
      mandate: term.bestuursfunctieName.value,
    };
  });
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
  try {
    const sparqlResult = await querySudo(query);

    return findFirstSparqlResult(sparqlResult)?.email?.value;
  } catch (error) {
    throw new HttpError(
      'Something went wrong while trying to get the contact email for the mandataris.',
    );
  }
}

async function fetchActiveMandatarissenWithoutBesluit() {
  const momentTenDaysAgo = moment().subtract(10, 'days');
  const escapedTenDaysBefore = sparqlEscapeDateTime(momentTenDaysAgo.toDate());
  const nietBekrachtigd = sparqlEscapeUri(PUBLICATION_STATUS.NIET_BEKRACHTIGD);
  const today = sparqlEscapeDateTime(moment().toDate());
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
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

    SELECT DISTINCT ?mandataris ?fName ?lName ?bestuursfunctieName ?graph
      WHERE {
        GRAPH ?graph {
          ?mandataris a mandaat:Mandataris ;
            lmb:hasPublicationStatus ${nietBekrachtigd} ;
            mandaat:start ?startMandaat ;
            mandaat:isBestuurlijkeAliasVan ?person ;
            org:holds ?mandaat.
          ?mandaat org:role ?bestuursfunctie .
          ?orgT org:hasPost ?mandaat .
          ?orgT mandaat:isTijdspecialisatieVan / besluit:bestuurt ?eenheid .
          ?person persoon:gebruikteVoornaam ?fName ;
            foaf:familyName ?lName .
          VALUES ?bestuursfunctie {
            <http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000011> # Gemeenteraadslid
            <http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000014> # Schepen
            <http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000019> # Lid van het Bijzonder Comité voor de Sociale Dienst
            <http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000012> # Voorzitter van de gemeenteraad
            <http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e00001a> # Voorzitter van het Bijzonder Comité voor de Sociale Dienst
            <http://data.vlaanderen.be/id/concept/BestuursfunctieCode/59a90e03-4f22-4bb9-8c91-132618db4b38> # Toegevoegde schepen
            <http://data.vlaanderen.be/id/concept/BestuursfunctieCode/7b038cc40bba10bec833ecfe6f15bc7a> # Aangewezen burgemeester
          }

          FILTER NOT EXISTS {
            ?notification a ext:SystemNotification;
              dct:subject ${sparqlEscapeString(SUBJECT_DECISION)};
              ext:notificationLink ?notificationLink.
            ?notificationLink ext:linkedTo ?mandataris.
          }
          OPTIONAL {
            ?mandataris mandaat:einde ?eindeMandaat .
          }

          BIND(IF(BOUND(?eindeMandaat), ?eindeMandaat, ${escapedTenDaysBefore}) AS ?saveEindeMandaat).
          FILTER(${escapedTenDaysBefore} >= ?startMandaat && ?saveEindeMandaat <= ${today})
        }
        ?bestuursfunctie skos:prefLabel ?bestuursfunctieName .
        ?graph ext:ownedBy ?owningEenheid.
      }
      ORDER BY ?bestuursfunctieName ?lName
      LIMIT ${BATCH_SIZE}
  `;

  try {
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
  } catch (error) {
    throw new HttpError(
      'Something went wrong while fetching active mandatarissen without besluit',
    );
  }
}
