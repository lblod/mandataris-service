import { HttpError } from '../util/http-error';
import { sparqlEscapeUri } from 'mu';
import {
  canAccessMandataris,
  checkDuplicateMandataris,
  checkLinkedMandate,
  copyFractieOfMandataris,
  copyMandataris,
  copyPersonOfMandataris,
  fractieOfMandatarisExistsInGraph,
  getDestinationGraphLinkedMandataris,
  personOfMandatarisExistsInGraph,
} from '../data-access/linked-mandataris';

export const checkLinkedMandataris = async (req) => {
  const mandatarisId = req.params.id;
  if (!mandatarisId) {
    throw new HttpError('No mandataris id provided', 400);
  }

  const hasAccess = await canAccessMandataris(mandatarisId);
  if (!hasAccess) {
    throw new HttpError('No mandataris with given id found', 404);
  }

  const valueBindings = getLinkedMandaten();

  const linkedMandateExists = await checkLinkedMandate(
    mandatarisId,
    valueBindings,
  );

  if (!linkedMandateExists) {
    return null;
  }

  const linkedMandatarisExists = await checkDuplicateMandataris(
    mandatarisId,
    valueBindings,
  );

  return {
    ...linkedMandateExists,
    hasDouble: linkedMandatarisExists,
  };
};

export const createLinkedMandataris = async (req) => {
  const mandatarisId = req.params.id;
  if (!mandatarisId) {
    throw new HttpError('No mandataris id provided', 400);
  }

  const hasAccess = await canAccessMandataris(mandatarisId);
  if (!hasAccess) {
    throw new HttpError('No mandataris with given id found', 404);
  }

  // Get destination graph
  const destinationGraph =
    await getDestinationGraphLinkedMandataris(mandatarisId);
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
  const fractieExists = await fractieOfMandatarisExistsInGraph(
    mandatarisId,
    destinationGraph,
  );

  // Add fractie if it does not exist
  if (!fractieExists) {
    await copyFractieOfMandataris(mandatarisId, destinationGraph);
  }

  // Add duplicate mandatee
  copyMandataris(mandatarisId, destinationGraph, getLinkedMandaten());
};

function getLinkedMandaten() {
  const linkedMandatenArray: string[] = [];
  linkedMandaten.forEach((value, key) => {
    linkedMandatenArray.push(
      `(${sparqlEscapeUri(value)} ${sparqlEscapeUri(key)})`,
    );
    linkedMandatenArray.push(
      `(${sparqlEscapeUri(key)} ${sparqlEscapeUri(value)})`,
    );
  });
  return linkedMandatenArray.join('\n');
}

const linkedMandaten = new Map([
  [
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000011',
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000015',
  ],
  [
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000012',
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000016',
  ],
  [
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000014',
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000017',
  ],
  [
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000013',
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000018',
  ],
]);
