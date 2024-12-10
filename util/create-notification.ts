import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeDateTime, sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { v4 as uuid } from 'uuid';
import { MandatarisFullInfo } from '../types';

const notificationTypes = {
  warning: 'http://lblod.data.gift/concepts/notification-codes/warning',
  error: 'http://lblod.data.gift/concepts/notification-codes/error',
  info: 'http://lblod.data.gift/concepts/notification-codes/info',
};

export type notificationLink = {
  type: string;
  uri: string;
};

export async function createNotification({
  title,
  description,
  type,
  graph,
  links,
}: {
  title: string;
  description: string;
  type: keyof typeof notificationTypes;
  graph: string;
  links: notificationLink[];
}) {
  console.log(`Notification created: ${title}, ${JSON.stringify(links)}`);
  const id = uuid();
  const uri = sparqlEscapeUri(
    `http://data.lblod.info/id/SystemNotification/${id}`,
  );
  const newData = links
    .map((link) => {
      const linkId = uuid();
      const linkUri = sparqlEscapeUri(
        `http://data.lblod.info/id/SystemNotificationLink/${linkId}`,
      );
      return `${uri} ext:notificationLink ${linkUri} .
          ${linkUri} a ext:SystemNotificationLink ;
            mu:uuid ${sparqlEscapeString(linkId)} ;
            ext:linkedType ${sparqlEscapeString(link.type)} ;
            ext:linkedTo ${sparqlEscapeUri(link.uri)} .`;
    })
    .join('\n');

  const query = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX schema: <http://schema.org/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    INSERT DATA {
      GRAPH <${graph}> {
        ${uri} a ext:SystemNotification ;
          mu:uuid ${sparqlEscapeString(id)} ;
          dct:subject ${sparqlEscapeString(title)} ;
          schema:description ${sparqlEscapeString(description)} ;
          dct:created ${sparqlEscapeDateTime(new Date())} ;
          dct:type ${sparqlEscapeUri(notificationTypes[type])} .
        ${newData}
      }
    }`;
  await updateSudo(query);
}

export const createMandatarisBesluitNotification = async ({
  title,
  description,
  type,
  info,
}: {
  title: string;
  description: string;
  type: keyof typeof notificationTypes;
  info: MandatarisFullInfo;
}) => {
  return createNotification({
    title,
    description,
    type,
    graph: info.graph,
    links: [
      {
        type: 'mandataris',
        uri: info.mandatarisUri,
      },
      {
        type: 'besluit',
        uri: info.besluitUri,
      },
    ],
  });
};

export async function getMandatarisNotificationGraph(mandataris: string) {
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    SELECT ?graph WHERE {
      ${sparqlEscapeUri(mandataris)} org:holds ?mandaat .
      GRAPH ?graph {
        ?mandaat a mandaat:Mandaat .
      }
      ?graph ext:ownedBy ?bestuurseenheid.
    } LIMIT 1`;
  const result = await querySudo(query);
  if (result.results.bindings.length === 0) {
    // no mandaat known in a bestuurseenheid graph, add the notification to the ABB bestuurseenheid graph
    return 'http://mu.semte.ch/graphs/organizations/141d9d6b-54af-4d17-b313-8d1c30bc3f5b/LoketLB-mandaatGebruiker';
  }
  return result.results.bindings[0].graph.value;
}

export async function createBulkNotificationMandatarissenWithoutBesluit(
  title: string,
  mandatarissen,
) {
  console.log(
    `Bulk notification created for mandatarissen: ${title}, ${mandatarissen
      .map((mandataris) => mandataris.uri)
      .join(', ')}`,
  );

  const data = mandatarissen
    .map((mandataris) => {
      const notificationId = uuid();
      const notification = sparqlEscapeUri(
        `http://data.lblod.info/id/SystemNotification/${notificationId}`,
      );
      const linkId = uuid();
      const link = sparqlEscapeUri(
        `http://data.lblod.info/id/SystemNotificationLink/${linkId}`,
      );
      const description = `De publicatie status van ${mandataris.name} met mandaat ${mandataris.mandate} staat al 10 dagen of meer op effectief zonder dat er een besluit is toegevoegd. Gelieve deze mandataris manueel te bekrachtigen en een besluit toe te voegen of publiceer het besluit van de installatievergadering via een notuleringspakket.`;

      return `
        GRAPH ${sparqlEscapeUri(mandataris.graph)} {
          ${notification} a ext:SystemNotification ;
            mu:uuid ${sparqlEscapeString(notificationId)} ;
            dct:subject ${sparqlEscapeString(title)} ;
            schema:description ${sparqlEscapeString(description)} ;
            dct:created ${sparqlEscapeDateTime(new Date())} ;
            dct:type ${sparqlEscapeUri(notificationTypes['warning'])} ;
            ext:notificationLink ${link} .
          ${link} a ext:SystemNotificationLink ;
            mu:uuid ${sparqlEscapeString(linkId)} ;
            ext:linkedType ${sparqlEscapeString('mandataris')} ;
            ext:linkedTo ${sparqlEscapeUri(mandataris.uri)} .
        }
      `;
    })
    .join('\n');

  const query = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX schema: <http://schema.org/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    INSERT DATA {
      ${data}
    }`;
  await updateSudo(query);
}
