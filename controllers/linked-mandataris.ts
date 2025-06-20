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
  findLinkedInstance,
  linkInstances,
  copyOnafhankelijkeFractieOfMandataris,
  unlinkInstance,
  linkedMandateAlreadyExists,
  createNotificationLinkedReplacementAlreadyExists,
  createNotificationLinkedReplacementCorrectMistakes,
} from '../data-access/linked-mandataris';
import {
  endExistingMandataris,
  mandataris,
  getReplacements,
  addReplacement,
  removeReplacements,
  getMandatarisEndDate,
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

  const [userId, destinationGraph] = await Promise.all([
    preliminaryChecksLinkedMandataris(req),
    getDestinationGraphLinkedMandataris(
      mandatarisId,
      getValueBindings(linkedBestuurseenheden),
    ),
  ]);
  if (!destinationGraph) {
    throw new HttpError('No destination graph found', 500);
  }

  // no need to check for an existing mandate in ocmw (duplicate) the frontend already does so
  // AND validations will catch it

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

  await handleReplacementCorrectMistakes(
    destinationGraph,
    mandatarisId,
    linkedMandataris,
  );

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
  );

  const endDate = await getMandatarisEndDate(oldMandatarisId);
  // End original linked mandatee
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
) => {
  const fractie = await getOrCreateOCMWFractie(
    newMandatarisId,
    destinationGraph,
  );

  const newLinkedMandataris = await createNewLinkedMandataris(
    newMandatarisId,
    fractie,
    destinationGraph,
    getValueBindings(linkedMandaten),
  );

  const promises = [linkInstances(newMandatarisId, newLinkedMandataris.id)];

  if (fractie) {
    promises.push(
      mandatarisUsecase.updateCurrentFractieSudo(
        newLinkedMandataris.id,
        destinationGraph,
      ),
    );
  }

  await Promise.all(promises);

  await saveHistoryItem(
    newLinkedMandataris.uri,
    userId,
    'created by gemeente - ocmw mirror',
  );

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

  const newLinkedMandataris = await handleCreationNewLinkedMandataris(
    destinationGraph,
    userId,
    newMandatarisId,
  );
  return newLinkedMandataris;
};

export const addSimpleReplacement = async (req) => {
  const mandatarisId = req.params.id;

  const userId = await preliminaryChecksLinkedMandataris(req);

  const destinationGraph = await getDestinationGraphLinkedMandataris(
    mandatarisId,
    getValueBindings(linkedBestuurseenheden),
  );

  const linkedMandataris = await findLinkedInstance(mandatarisId);
  if (!linkedMandataris) {
    throw new HttpError(
      `No linked mandataris found for id ${mandatarisId}`,
      404,
    );
  }

  if (!destinationGraph) {
    throw new HttpError('No destination graph found', 500);
  }
  const replacements = await getReplacements(mandatarisId);
  if (!replacements) {
    throw new HttpError('No replacement found', 404);
  }
  const replacement = replacements.at(0);

  const linkedReplacement = await findLinkedInstance(replacement.id);

  if (linkedReplacement) {
    await addReplacement(destinationGraph, linkedMandataris, linkedReplacement);
    return;
  }

  const linkedReplacementWithoutLink = await linkedMandateAlreadyExists(
    destinationGraph,
    replacement.id,
    getValueBindings(linkedMandaten),
  );

  if (linkedReplacementWithoutLink) {
    await createNotificationLinkedReplacementAlreadyExists(
      destinationGraph,
      linkedMandataris.uri,
    );
    throw new HttpError(
      'Vervanger kon niet toegevoegd worden aan corresponderende mandataris',
      500,
    );
  }

  const newLinkedReplacement = await handleCreationNewLinkedMandatarisAndPerson(
    destinationGraph,
    userId,
    replacement.id,
  );

  await addReplacement(
    destinationGraph,
    linkedMandataris,
    newLinkedReplacement,
  );

  await saveHistoryItem(
    linkedMandataris.uri,
    userId,
    'Corrected by gemeente - ocmw mirror',
  );
};

export const handleReplacement = async (
  destinationGraph: string,
  userId: string,
  mandatarisId: string,
  linkedMandataris: instanceIdentifiers,
) => {
  const replacements = await getReplacements(mandatarisId);
  if (!replacements) {
    return;
  }
  const replacement = replacements.at(0);

  const linkedReplacement = await findLinkedInstance(replacement.id);

  if (linkedReplacement) {
    await addReplacement(destinationGraph, linkedMandataris, linkedReplacement);
    return;
  }

  const linkedReplacementWithoutLink = await linkedMandateAlreadyExists(
    destinationGraph,
    replacement.id,
    getValueBindings(linkedMandaten),
  );

  if (linkedReplacementWithoutLink) {
    await createNotificationLinkedReplacementAlreadyExists(
      destinationGraph,
      linkedMandataris.uri,
    );
    return;
  }

  const newLinkedReplacement = await handleCreationNewLinkedMandatarisAndPerson(
    destinationGraph,
    userId,
    replacement.id,
  );
  await addReplacement(
    destinationGraph,
    linkedMandataris,
    newLinkedReplacement,
  );
};

export const handleReplacementCorrectMistakes = async (
  destinationGraph: string,
  mandatarisId: string,
  linkedMandataris: instanceIdentifiers,
) => {
  const replacements = await getReplacements(mandatarisId);
  if (!replacements) {
    return;
  }

  const linkedReplacements = await Promise.all(
    replacements.map(async (replacement) => {
      return await findLinkedInstance(replacement.id);
    }),
  );

  if (
    linkedReplacements.every((linkedReplacement) => {
      return linkedReplacement;
    })
  ) {
    await removeReplacements(destinationGraph, linkedMandataris);
    for (const linkedReplacement of linkedReplacements) {
      await addReplacement(
        destinationGraph,
        linkedMandataris,
        linkedReplacement,
      );
    }
  } else {
    await createNotificationLinkedReplacementCorrectMistakes(
      destinationGraph,
      linkedMandataris,
    );
  }
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
