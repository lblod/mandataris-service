import {
  copySimpleInstanceToGraph,
  getBeleidsdomeinTriplesInStagingGraph,
  getGraphsWhereInstanceExists,
  insertTriplesInGraph,
} from '../../data-access/mandatees-decisions';
import { MandatarisFullInfo, Triple } from '../../types';
import { createMandatarisBesluitNotification } from '../../util/create-notification';
import { getUuidForUri } from '../../util/uuid-for-uri';

export async function copyBeleidsdomeinInfo(
  mandatarisFullInfo: MandatarisFullInfo,
) {
  const beleidsDomeinen = mandatarisFullInfo.triples
    .filter(
      (triple) =>
        triple.predicate.value ===
        'http://data.vlaanderen.be/ns/mandaat#beleidsdomein',
    )
    .map((triple) => triple.object.value);

  for (const beleidsDomein of beleidsDomeinen) {
    await copyBeleidsDomein(
      mandatarisFullInfo,
      beleidsDomein,
      mandatarisFullInfo.graph,
    );
  }
}

async function copyBeleidsDomein(
  mandatarisFullInfo: MandatarisFullInfo,
  beleidsDomein: string,
  graph: string,
): Promise<void> {
  const graphsForBeleidsDomein =
    await getGraphsWhereInstanceExists(beleidsDomein);
  const inAppropriateGraph = graphsForBeleidsDomein.find((g) =>
    ['http://mu.semte.ch/graphs/public', graph].includes(g.graph.value),
  );
  if (graphsForBeleidsDomein.length === 0) {
    await createBeleidsDomein(beleidsDomein, graph);
    await createMandatarisBesluitNotification({
      title: 'Beleidsdomein aangemaakt',
      description: `Een nieuw beleidsdomein met uri ${beleidsDomein} werd aangemaakt op basis van de informatie in het Besluit.`,
      type: 'info',
      info: mandatarisFullInfo,
    });
  } else if (!inAppropriateGraph) {
    await copySimpleInstanceToGraph(beleidsDomein, graph);
  } else {
    // beleidsdomein exists in an appropriate graph. nothing to do
  }
}

async function createBeleidsDomein(beleidsdomeinUri: string, graph: string) {
  const triplesForBeleidsdomein =
    await getBeleidsdomeinTriplesInStagingGraph(beleidsdomeinUri);
  const id = await getUuidForUri(beleidsdomeinUri, {
    allowCheckingUri: true,
    allowGenerateUuid: true,
  });
  const extraTriples: Triple[] = [
    {
      subject: {
        value: beleidsdomeinUri,
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
        value: beleidsdomeinUri,
        type: 'uri',
      },
      predicate: {
        value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        type: 'uri',
      },
      object: {
        value: 'http://mu.semte.ch/vocabularies/ext/BeleidsdomeinCode',
        type: 'uri',
      },
    },
    {
      subject: {
        value: beleidsdomeinUri,
        type: 'uri',
      },
      predicate: {
        value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        type: 'uri',
      },
      object: {
        value: 'http://www.w3.org/2004/02/skos/core#Concept',
        type: 'uri',
      },
    },
    {
      subject: {
        value: beleidsdomeinUri,
        type: 'uri',
      },
      predicate: {
        value: 'http://www.w3.org/2004/02/skos/core#inScheme',
        type: 'uri',
      },
      object: {
        value: 'http://data.vlaanderen.be/id/conceptscheme/BeleidsdomeinCode',
        type: 'uri',
      },
    },
    {
      subject: {
        value: beleidsdomeinUri,
        type: 'uri',
      },
      predicate: {
        value: 'http://www.w3.org/2004/02/skos/core#topConceptOf',
        type: 'uri',
      },
      object: {
        value: 'http://data.vlaanderen.be/id/conceptscheme/BeleidsdomeinCode',
        type: 'uri',
      },
    },
  ];
  const allTriples = [...triplesForBeleidsdomein, ...extraTriples];
  await insertTriplesInGraph(allTriples, graph);
}
