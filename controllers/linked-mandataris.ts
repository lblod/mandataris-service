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
  copyMandataris(
    mandatarisId,
    fractie,
    destinationGraph,
    getValueBindings(linkedMandaten),
  );
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
