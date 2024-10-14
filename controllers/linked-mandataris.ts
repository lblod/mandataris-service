import { HttpError } from '../util/http-error';
import { sparqlEscapeUri } from 'mu';
import {
  canAccessMandataris,
  findLinkedMandate,
  createNewLinkedMandataris,
  copyPersonOfMandataris,
  getFractieOfMandatarisInGraph,
  getDestinationGraphLinkedMandataris,
  personOfMandatarisExistsInGraph,
  correctLinkedMandataris,
  replaceFractieOfMandataris,
  isFractieNameEqual,
  copyExtraValues,
  findLinkedInstance,
  linkInstances,
  copyOnafhankelijkeFractieOfMandataris,
  unlinkInstance,
  linkedMandateAlreadyExists,
} from '../data-access/linked-mandataris';
import { endExistingMandataris, mandataris } from '../data-access/mandataris';
import {
  fetchUserIdFromSession,
  saveHistoryItem,
} from '../data-access/form-queries';
import { mandatarisUsecase } from './mandataris';
import { isOnafhankelijkInPeriod } from '../data-access/persoon';

export const checkLinkedMandataris = async (req) => {
  const mandatarisId = req.params.id;

  await preliminaryChecksLinkedMandataris(req);

  const valueBindings = getValueBindings(linkedMandaten);

  const linkedMandates = await findLinkedMandate(mandatarisId, valueBindings);

  if (!linkedMandates?.duplicateMandate) {
    return linkedMandates;
  }

  const linkedMandataris = await findLinkedInstance(mandatarisId);

  return {
    ...linkedMandates,
    hasDouble: linkedMandataris?.id.value,
  };
};

export const addLinkLinkedMandataris = async (req) => {
  const from = req.params.from;
  const to = req.params.to;
  if (!from || !to) {
    throw new HttpError(
      'Missing at least one mandataris id, you should provide two',
      400,
    );
  }

  const userId = await fetchUserIdFromSession(req.get('mu-session-id'));
  if (!userId) {
    throw new HttpError('Not authenticated', 401);
  }

  const hasAccess =
    (await canAccessMandataris(from)) || (await canAccessMandataris(to));
  if (!hasAccess) {
    throw new HttpError(
      'You do not have access to any of the provided mandatees',
      404,
    );
  }

  await linkInstances(from, to);
};

export const removeLinkLinkedMandataris = async (req) => {
  const mandatarisId = req.params.id;
  await preliminaryChecksLinkedMandataris(req);
  await unlinkInstance(mandatarisId);
};

export const createLinkedMandataris = async (req) => {
  const mandatarisId = req.params.id;

  const userId = await preliminaryChecksLinkedMandataris(req);

  const destinationGraph = await getDestinationGraphLinkedMandataris(
    mandatarisId,
    getValueBindings(linkedBestuurseenheden),
  );
  if (!destinationGraph) {
    throw new HttpError('No destination graph found', 500);
  }

  const mandateAlreadyExists = await linkedMandateAlreadyExists(
    mandatarisId,
    destinationGraph,
    getValueBindings(linkedMandaten),
  );

  if (mandateAlreadyExists) {
    throw new HttpError(
      'Er bestaat al een mandaat voor deze persoon in het OCMW',
      400,
    );
  }

  const personExists = await personOfMandatarisExistsInGraph(
    mandatarisId,
    destinationGraph,
  );

  if (!personExists) {
    await copyPersonOfMandataris(mandatarisId, destinationGraph);
  }

  const fractie = await handleFractie(mandatarisId, destinationGraph);

  const newMandataris = await createNewLinkedMandataris(
    mandatarisId,
    fractie,
    destinationGraph,
    getValueBindings(linkedMandaten),
  );

  // Update current fractie on person
  await mandatarisUsecase.updateCurrentFractieSudo(
    newMandataris.id,
    destinationGraph,
  );

  await saveHistoryItem(
    newMandataris.uri,
    userId,
    'created by gemeente - ocmw mirror',
  );

  await linkInstances(mandatarisId, newMandataris.id);

  return newMandataris;
};

export const correctMistakesLinkedMandataris = async (req) => {
  const mandatarisId = req.params.id;

  const userId = await preliminaryChecksLinkedMandataris(req);

  const destinationGraph = await getDestinationGraphLinkedMandataris(
    mandatarisId,
    getValueBindings(linkedBestuurseenheden),
  );
  if (!destinationGraph) {
    throw new HttpError('No destination graph found', 500);
  }

  const linkedMandataris = await findLinkedInstance(mandatarisId);
  if (!linkedMandataris) {
    throw new HttpError(
      `No linked mandataris found for id ${mandatarisId}`,
      404,
    );
  }

  // Fractie needs to be handled differently because of the complex relation
  const sameFractie = await isFractieNameEqual(
    mandatarisId,
    linkedMandataris.uri,
  );
  if (!sameFractie) {
    const fractie = handleFractie(mandatarisId, destinationGraph);

    await replaceFractieOfMandataris(
      mandatarisId,
      linkedMandataris.uri,
      fractie,
      destinationGraph,
    );

    // Update current fractie on person
    await mandatarisUsecase.updateCurrentFractieSudo(
      linkedMandataris.id.value,
      destinationGraph,
    );
  }

  await correctLinkedMandataris(mandatarisId, linkedMandataris.uri);

  await saveHistoryItem(
    linkedMandataris.uri.value,
    userId,
    'Corrected by gemeente - ocmw mirror',
  );
};

export const changeStateLinkedMandataris = async (req) => {
  const oldMandatarisId = req.params.oldId;
  const newMandatarisId = req.params.newId;
  if (!oldMandatarisId) {
    throw new HttpError('No old mandataris id provided', 400);
  }
  if (!newMandatarisId) {
    throw new HttpError('No new mandataris id provided', 400);
  }

  const userId = await fetchUserIdFromSession(req.get('mu-session-id'));
  if (!userId) {
    throw new HttpError('Not authenticated', 401);
  }

  const hasAccess = await canAccessMandataris(newMandatarisId);
  if (!hasAccess) {
    throw new HttpError('No mandataris with given id found', 404);
  }

  const destinationGraph = await getDestinationGraphLinkedMandataris(
    newMandatarisId,
    getValueBindings(linkedBestuurseenheden),
  );
  if (!destinationGraph) {
    throw new HttpError('No destination graph found', 500);
  }

  const linkedMandataris = await findLinkedInstance(oldMandatarisId);
  if (!linkedMandataris) {
    throw new HttpError(
      `No linked mandataris found for id ${oldMandatarisId}`,
      404,
    );
  }

  const fractie = await handleFractie(newMandatarisId, destinationGraph);

  // We are updating state, the linked mandatee needs a new instance for the updated state.
  const newLinkedMandataris = await createNewLinkedMandataris(
    newMandatarisId,
    fractie,
    destinationGraph,
    getValueBindings(linkedMandaten),
  );

  // Copy over values that were in the original linked mandatee but are not set in the new linked mandatee
  await copyExtraValues(linkedMandataris.uri, newLinkedMandataris.uri);

  // Update current fractie on person
  await mandatarisUsecase.updateCurrentFractieSudo(
    newLinkedMandataris.id,
    destinationGraph,
  );

  await saveHistoryItem(
    newLinkedMandataris.uri,
    userId,
    'created as update state by gemeente - ocmw mirror',
  );

  await linkInstances(newMandatarisId, newLinkedMandataris.id);

  // End original linked mandatee
  const endDate = new Date();
  endExistingMandataris(destinationGraph, linkedMandataris.uri, endDate);
};

const preliminaryChecksLinkedMandataris = async (req) => {
  const mandatarisId = req.params.id;
  if (!mandatarisId) {
    throw new HttpError('No mandataris id provided', 400);
  }

  const userId = await fetchUserIdFromSession(req.get('mu-session-id'));
  if (!userId) {
    throw new HttpError('Not authenticated', 401);
  }

  const hasAccess = await canAccessMandataris(mandatarisId);
  if (!hasAccess) {
    throw new HttpError('No mandataris with given id found', 404);
  }

  return userId;
};

export const handleFractie = async (mandatarisId, graph) => {
  const isOnafhankelijk = await mandataris.isOnafhankelijk(mandatarisId);

  let fractie;
  if (isOnafhankelijk) {
    fractie = await getOrCreateOnafhankelijkeFractie(mandatarisId, graph);
  } else {
    fractie = await getFractieOfMandatarisInGraph(mandatarisId, graph);

    if (!fractie) {
      throw new HttpError(
        'The given fractie does not exist in the OCMW, it is not possible to create linked mandatarissen in a fractie that exists in the municipality but not in the OCMW.',
        400,
      );
    }
  }
  return fractie;
};

export const getOrCreateOnafhankelijkeFractie = async (mandatarisId, graph) => {
  const { persoonId, bestuursperiodeId } =
    await mandataris.getPersonWithBestuursperiode(mandatarisId);
  const onafhankelijk = await isOnafhankelijkInPeriod(
    persoonId,
    bestuursperiodeId,
    graph,
  );
  if (onafhankelijk) {
    return onafhankelijk;
  }
  return await copyOnafhankelijkeFractieOfMandataris(mandatarisId, graph);
};

function getValueBindings(mapping) {
  const stringArray: string[] = [];
  mapping.forEach((value, key) => {
    stringArray.push(`(${sparqlEscapeUri(value)} ${sparqlEscapeUri(key)})`);
    stringArray.push(`(${sparqlEscapeUri(key)} ${sparqlEscapeUri(value)})`);
  });
  return stringArray.join('\n');
}

const linkedMandaten = new Map([
  [
    // Gemeenteraadslid - Lid RMW
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000011',
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000015',
  ],
  [
    // Voorzitter Gemeenteraad - Voorzitter RMW
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000012',
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000016',
  ],
  [
    // Schepen - Lid VB
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000014',
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000017',
  ],
  [
    // Burgemeester - Voorzitter VB
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000013',
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000018',
  ],
]);

const linkedBestuurseenheden = new Map([
  [
    // Gemeente - OCMW
    'http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000001',
    'http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000002',
  ],
]);
