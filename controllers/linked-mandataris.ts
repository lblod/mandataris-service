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
  createNotificationLinkedReplacementAlreadyExists,
} from '../data-access/linked-mandataris';
import {
  endExistingMandataris,
  mandataris,
  hasReplacement,
  addReplacement,
} from '../data-access/mandataris';
import {
  fetchUserIdFromSession,
  saveHistoryItem,
} from '../data-access/form-queries';
import { mandatarisUsecase } from './mandataris';
import { isOnafhankelijkInPeriod } from '../data-access/persoon';
import {
  GEMEENTERAADSLID_FUNCTIE_CODE,
  LID_OCMW_FUNCTIE_CODE,
  LID_VB_FUNCTIE_CODE,
  SCHEPEN_FUNCTIE_CODE,
  VOORZITTER_GEMEENTERAAD_FUNCTIE_CODE,
  VOORZITTER_RMW_CODE,
} from '../util/constants';
import { instanceIdentifiers } from '../types';

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
    hasDouble: linkedMandataris?.id,
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

  await handleCreationNewLinkedMandatarisAndPerson(
    destinationGraph,
    userId,
    mandatarisId,
  );
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
    const fractie = await getOrCreateOCMWFractie(
      mandatarisId,
      destinationGraph,
    );

    await replaceFractieOfMandataris(
      mandatarisId,
      linkedMandataris.uri,
      fractie,
      destinationGraph,
    );

    // Update current fractie on person
    await mandatarisUsecase.updateCurrentFractieSudo(
      linkedMandataris.id,
      destinationGraph,
    );
  }

  await correctLinkedMandataris(mandatarisId, linkedMandataris.uri);

  await saveHistoryItem(
    linkedMandataris.uri,
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

  const oldLinkedMandataris = await findLinkedInstance(oldMandatarisId);
  if (!oldLinkedMandataris) {
    throw new HttpError(
      `No linked mandataris found for id ${oldMandatarisId}`,
      404,
    );
  }

  const newLinkedMandataris = await handleCreationNewLinkedMandataris(
    destinationGraph,
    userId,
    newMandatarisId,
    oldLinkedMandataris,
  );

  // End original linked mandatee
  const endDate = new Date();
  endExistingMandataris(destinationGraph, oldLinkedMandataris.uri, endDate);

  await handleReplacement(
    destinationGraph,
    userId,
    newMandatarisId,
    newLinkedMandataris,
  );
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

export const getOrCreateOCMWFractie = async (
  mandatarisId: string,
  graph: string,
) => {
  const isOnafhankelijk = await mandataris.isOnafhankelijk(mandatarisId);

  let fractie;
  if (isOnafhankelijk) {
    fractie = await getOrCreateOnafhankelijkeFractie(mandatarisId, graph);
  } else {
    fractie = await getFractieOfMandatarisInGraph(mandatarisId, graph);
  }
  return fractie;
};

export const getOrCreateOnafhankelijkeFractie = async (
  mandatarisId: string,
  graph: string,
) => {
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

export const handleCreationNewLinkedMandataris = async (
  destinationGraph: string,
  userId: string,
  newMandatarisId: string,
  oldlinkedMandataris: instanceIdentifiers | null,
) => {
  const fractie = await getOrCreateOCMWFractie(
    newMandatarisId,
    destinationGraph,
  );

  // We are updating state, the linked mandatee needs a new instance for the updated state.
  const newLinkedMandataris = await createNewLinkedMandataris(
    newMandatarisId,
    fractie,
    destinationGraph,
    getValueBindings(linkedMandaten),
  );

  // Copy over values that were in the original linked mandatee but are not set in the new linked mandatee
  if (oldlinkedMandataris) {
    await copyExtraValues(oldlinkedMandataris.uri, newLinkedMandataris.uri);
  }

  // Update current fractie on person
  await mandatarisUsecase.updateCurrentFractieSudo(
    newLinkedMandataris.id,
    destinationGraph,
  );

  await saveHistoryItem(
    newLinkedMandataris.uri,
    userId,
    'created by gemeente - ocmw mirror',
  );

  await linkInstances(newMandatarisId, newLinkedMandataris.id);

  return newLinkedMandataris;
};

export const handleCreationNewLinkedMandatarisAndPerson = async (
  destinationGraph: string,
  userId: string,
  newMandatarisId: string,
) => {
  const personExists = await personOfMandatarisExistsInGraph(
    newMandatarisId,
    destinationGraph,
  );

  if (!personExists) {
    await copyPersonOfMandataris(newMandatarisId, destinationGraph);
  }

  await handleCreationNewLinkedMandataris(
    destinationGraph,
    userId,
    newMandatarisId,
    null,
  );
};

export const handleReplacement = async (
  destinationGraph: string,
  userId: string,
  mandatarisId: string,
  linkedMandataris: resource,
) => {
  // Check if replacement
  const replacement = await hasReplacement(destinationGraph, mandatarisId);
  if (!replacement) {
    return;
  }

  // Check if linked replacement
  const linkedReplacement = await findLinkedInstance(replacement.id);

  // YES: Add replacement relation
  if (linkedReplacement) {
    await addReplacement(destinationGraph, linkedMandataris, linkedReplacement);
    return;
  }

  // NO: split cases update state vs corrigeer fouten
  // Update state:
  // Check if mandataris exists that could be linked
  const linkedReplacementWithoutLink = await linkedMandateAlreadyExists(
    destinationGraph,
    replacement.uri,
    getValueBindings(linkedMandaten),
  );
  // Yes: notification warning
  if (linkedReplacementWithoutLink) {
    await createNotificationLinkedReplacementAlreadyExists(
      destinationGraph,
      linkedMandataris.uri,
    );
    return;
  }

  // NO: create it
  await handleCreationNewLinkedMandatarisAndPerson(
    destinationGraph,
    userId,
    mandatarisId,
  );

  // Corrigeer fouten:
  // Create notification
};

export const getLinkedMandates = () => {
  return getValueBindings(linkedMandaten);
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
  [GEMEENTERAADSLID_FUNCTIE_CODE, LID_OCMW_FUNCTIE_CODE],
  [VOORZITTER_GEMEENTERAAD_FUNCTIE_CODE, VOORZITTER_RMW_CODE],
  [SCHEPEN_FUNCTIE_CODE, LID_VB_FUNCTIE_CODE],
]);

const linkedBestuurseenheden = new Map([
  [
    // Gemeente - OCMW
    'http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000001',
    'http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000002',
  ],
]);
