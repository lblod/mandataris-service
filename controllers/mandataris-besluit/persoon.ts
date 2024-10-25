import {
  copyPersonToGraph,
  getGraphsWhereInstanceExists,
  getPersonTriplesInStagingGraph,
  insertTriplesInGraph,
} from '../../data-access/mandatees-decisions';
import { MandatarisFullInfo, Triple } from '../../types';
import { createMandatarisBesluitNotification } from '../../util/create-notification';
import { getUuidForUri } from '../../util/uuid-for-uri';

export async function copyPersonInfo(mandatarisFullInfo: MandatarisFullInfo) {
  // this must exist because we checked earlier if the minimal info was available
  const persoonUri = mandatarisFullInfo.triples.find(
    (triple) =>
      triple.predicate.value ===
      'http://data.vlaanderen.be/ns/mandaat#isBestuurlijkeAliasVan',
  )?.object?.value as string;

  const graphsForPerson = await getGraphsWhereInstanceExists(persoonUri);
  const graph = mandatarisFullInfo.graph;
  const inAppropriateGraph = graphsForPerson.find((g) =>
    ['http://mu.semte.ch/graphs/public', graph].includes(g.graph.value),
  );
  if (graphsForPerson.length === 0) {
    await createPerson(persoonUri, graph);
    await createMandatarisBesluitNotification({
      title: 'Persoon aangemaakt',
      description:
        'Een nieuwe Persoon werd aangemaakt op basis van de informatie in het Besluit. Deze Persoon zal onvolledige informatie bevatten aangezien e.g. rijksregisternummer niet gepubliceerd wordt in het Besluit.',
      type: 'warning',
      info: mandatarisFullInfo,
    });
  } else if (!inAppropriateGraph) {
    await copyPersonToGraph(persoonUri, graph);
  } else {
    // person exists in an appropriate graph. nothing to do
  }
}

async function createPerson(persoonUri: string, graph: string) {
  const triplesForPerson = await getPersonTriplesInStagingGraph(persoonUri);
  const id = await getUuidForUri(persoonUri, {
    allowCheckingUri: true,
    allowGenerateUuid: true,
  });
  const extraTriples: Triple[] = [
    {
      subject: {
        value: persoonUri,
        type: 'uri',
      },
      predicate: {
        value: 'http://mu.semte.ch/vocabularies/core/uuid',
        type: 'uri',
      },
      object: {
        value: id,
        type: 'string',
      },
    },
    {
      subject: {
        value: persoonUri,
        type: 'uri',
      },
      predicate: {
        value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        type: 'uri',
      },
      object: {
        value: 'http://www.w3.org/ns/person#Person',
        type: 'uri',
      },
    },
  ];
  const allTriples = [...triplesForPerson, ...extraTriples];
  await insertTriplesInGraph(allTriples, graph);
}
