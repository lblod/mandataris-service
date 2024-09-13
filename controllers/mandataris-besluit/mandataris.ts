import {
  checkIfAllPropertiesAccountedFor,
  checkIfMandatarisExists,
  insertTriplesInGraph,
  replacePropertiesOnInstance,
} from '../../data-access/mandatees-decisions';
import { MandatarisFullInfo, Triple } from '../../types';
import { createMandatarisBesluitNotification } from '../../util/create-notification';
import { getUuidForUri } from '../../util/uuid-for-uri';

export async function copyMandatarisInfo(
  mandatarisFullInfo: MandatarisFullInfo,
) {
  const mandatarisSubject = mandatarisFullInfo.mandatarisUri;
  const mandatarisExists = await checkIfMandatarisExists(mandatarisSubject);
  if (mandatarisExists) {
    await copyMandatarisToExisting(mandatarisFullInfo);
  } else {
    await createNewMandataris(mandatarisFullInfo);
  }
}

async function copyMandatarisToExisting(
  mandatarisFullInfo: MandatarisFullInfo,
) {
  const mandatarisSubject = mandatarisFullInfo.mandatarisUri;
  const mandatarisTriples = mandatarisFullInfo.triples;
  const graph = mandatarisFullInfo.graph;
  const allPropertiesAccountedFor = await checkIfAllPropertiesAccountedFor(
    mandatarisSubject,
    mandatarisTriples,
    graph,
  );
  if (!allPropertiesAccountedFor) {
    await replacePropertiesOnInstance(
      mandatarisSubject,
      mandatarisTriples,
      graph,
    );
    await createMandatarisBesluitNotification({
      title: 'Mandataris aangepast',
      description: `Mandataris met uri ${mandatarisSubject} werd aangepast op basis van de informatie in een Besluit.`,
      type: 'info',
      info: mandatarisFullInfo,
    });
  }
}

async function createNewMandataris(mandatarisFullInfo: MandatarisFullInfo) {
  const mandatarisSubject = mandatarisFullInfo.mandatarisUri;
  const mandatarisTriples = mandatarisFullInfo.triples;
  const graph = mandatarisFullInfo.graph;

  const uuid = await getUuidForUri(mandatarisSubject, {
    allowCheckingUri: true,
    allowGenerateUuid: true,
  });

  const extraTriples: Triple[] = [
    {
      subject: {
        value: mandatarisSubject,
        type: 'uri',
      },
      predicate: {
        value: 'http://mu.semte.ch/vocabularies/core/uuid',
        type: 'uri',
      },
      object: {
        value: uuid,
        type: 'string',
      },
    },
    {
      subject: {
        value: mandatarisSubject,
        type: 'uri',
      },
      predicate: {
        value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        type: 'uri',
      },
      object: {
        value: 'http://data.vlaanderen.be/ns/mandaat#Mandataris',
        type: 'uri',
      },
    },
  ];
  const allTriples = [...mandatarisTriples, ...extraTriples];

  const statusFound = allTriples.find(
    (triple) =>
      triple.predicate.value === 'http://data.vlaanderen.be/ns/mandaat#status',
  );
  const statusWarning = statusFound
    ? ''
    : ' Let op: status van de mandataris werd niet gevonden in het Besluit!';

  await insertTriplesInGraph(allTriples, graph);
  await createMandatarisBesluitNotification({
    title: 'Mandataris aangemaakt',
    description: `Een nieuwe Mandataris met uri ${mandatarisSubject} werd aangemaakt op basis van de informatie in een Besluit.${statusWarning}`,
    type: 'warning',
    info: mandatarisFullInfo,
  });
}
