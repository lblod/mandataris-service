import { HttpError } from '../util/http-error';
import { sparqlEscapeUri } from 'mu';
import {
  canAccessMandataris,
  checkDuplicateMandataris,
  findLinkedMandate,
  copyFractieOfMandataris,
  copyMandataris,
  copyPersonOfMandataris,
  getFractieOfMandatarisInGraph,
  getDestinationGraphLinkedMandataris,
  personOfMandatarisExistsInGraph,
  getDuplicateMandataris,
  correctLinkedMandataris,
  replaceFractieOfMandataris,
  sameFractieName,
  copyExtraValues,
} from '../data-access/linked-mandataris';
import { endExistingMandataris } from '../data-access/mandataris';
import {
  fetchUserIdFromSession,
  saveHistoryItem,
} from '../data-access/form-queries';

export const checkLinkedMandataris = async (req) => {
  const mandatarisId = req.params.id;
  if (!mandatarisId) {
    throw new HttpError('No mandataris id provided', 400);
  }

  const hasAccess = await canAccessMandataris(mandatarisId);
  if (!hasAccess) {
    throw new HttpError('No mandataris with given id found', 404);
  }

  const valueBindings = getValueBindings(linkedMandaten);

  const linkedMandates = await findLinkedMandate(mandatarisId, valueBindings);

  if (!linkedMandates?.duplicateMandate) {
    return linkedMandates;
  }

  const linkedMandatarisExists = await checkDuplicateMandataris(
    mandatarisId,
    valueBindings,
  );

  return {
    ...linkedMandates,
    hasDouble: linkedMandatarisExists,
  };
};

export const createLinkedMandataris = async (req) => {
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

  // Get destination graph
  const destinationGraph = await getDestinationGraphLinkedMandataris(
    mandatarisId,
    getValueBindings(linkedBestuurseenheden),
  );
  if (!destinationGraph) {
    throw new HttpError('No destination graph found', 500);
  }

  // Check if person exists
  const personExists = await personOfMandatarisExistsInGraph(
    mandatarisId,
    destinationGraph,
  );

  // Add person if it does not exist
  if (!personExists) {
    await copyPersonOfMandataris(mandatarisId, destinationGraph);
  }

  // Check if fractie exists
  let fractie = await getFractieOfMandatarisInGraph(
    mandatarisId,
    destinationGraph,
  );

  // Add fractie if it does not exist
  if (!fractie) {
    fractie = await copyFractieOfMandataris(mandatarisId, destinationGraph);
  }

  // Add duplicate mandatee
  const newMandataris = await copyMandataris(
    mandatarisId,
    fractie,
    destinationGraph,
    getValueBindings(linkedMandaten),
  );

  // Add history item
  await saveHistoryItem(
    newMandataris.uri,
    userId,
    `Created as linked mandate for ${mandatarisId}`,
  );

  return newMandataris;
};

export const correctMistakesLinkedMandataris = async (req) => {
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

  const destinationGraph = await getDestinationGraphLinkedMandataris(
    mandatarisId,
    getValueBindings(linkedBestuurseenheden),
  );
  if (!destinationGraph) {
    throw new HttpError('No destination graph found', 500);
  }

  const linkedMandataris = await getDuplicateMandataris(
    mandatarisId,
    destinationGraph,
    getValueBindings(linkedMandaten),
  );
  if (!linkedMandataris) {
    throw new HttpError(
      `No linked mandataris found for id ${mandatarisId}`,
      404,
    );
  }

  // Fractie needs to be handled differently because of the complex relation
  const sameFractie = await sameFractieName(mandatarisId, linkedMandataris);
  if (!sameFractie) {
    let fractie = await getFractieOfMandatarisInGraph(
      mandatarisId,
      destinationGraph,
    );

    if (!fractie) {
      fractie = await copyFractieOfMandataris(mandatarisId, destinationGraph);
    }

    replaceFractieOfMandataris(
      mandatarisId,
      linkedMandataris,
      fractie,
      destinationGraph,
    );
  }

  correctLinkedMandataris(mandatarisId, linkedMandataris);

  // Add history item
  await saveHistoryItem(
    linkedMandataris.value,
    userId,
    `Corrected in linked mandate: ${mandatarisId}`,
  );
};

export const changeStateLinkedMandataris = async (req) => {
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

  const destinationGraph = await getDestinationGraphLinkedMandataris(
    mandatarisId,
    getValueBindings(linkedBestuurseenheden),
  );
  if (!destinationGraph) {
    throw new HttpError('No destination graph found', 500);
  }

  const linkedMandataris = await getDuplicateMandataris(
    mandatarisId,
    destinationGraph,
    getValueBindings(linkedMandaten),
  );
  if (!linkedMandataris) {
    throw new HttpError(
      `No linked mandataris found for id ${mandatarisId}`,
      404,
    );
  }

  // Check if fractie exists
  let fractie = await getFractieOfMandatarisInGraph(
    mandatarisId,
    destinationGraph,
  );

  // Add fractie if it does not exist
  if (!fractie) {
    fractie = await copyFractieOfMandataris(mandatarisId, destinationGraph);
  }

  // Add duplicate mandatee
  const newMandataris = await copyMandataris(
    mandatarisId,
    fractie,
    destinationGraph,
    getValueBindings(linkedMandaten),
  );

  // Copy over values that were in the original linked mandatee but are not set in the new mandatee
  await copyExtraValues(linkedMandataris, newMandataris.uri);

  // Add history item
  await saveHistoryItem(
    linkedMandataris.value,
    userId,
    `Created as update state for linked mandate: ${mandatarisId}`,
  );

  // End original linked mandatee
  const endDate = new Date();
  endExistingMandataris(destinationGraph, linkedMandataris, endDate);
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
