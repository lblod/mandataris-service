import { fractie } from '../data-access/fractie';
import {
  bulkBekrachtigMandatarissen,
  bulkSetPublicationStatusEffectief,
  mandataris,
} from '../data-access/mandataris';
import { persoon } from '../data-access/persoon';
import { saveBulkHistoryItem } from '../data-access/form-queries';

import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';
import { createRangorde } from '../util/rangorde';

import { v4 as uuidv4 } from 'uuid';
import { areIdsValid, isValidId, RDF_TYPE } from '../util/valid-id';

export const mandatarisUsecase = {
  getMandatarisFracties,
  updateCurrentFractie,
  updateCurrentFractieSudo,
  copyOverNonResourceDomainPredicates,
  generateRows,
  setEndDateOfActiveMandatarissen,
};

async function getMandatarisFracties(
  mandatarisId: string,
): Promise<Array<string>> {
  const isMandataris = await isValidId(RDF_TYPE.MANDATARIS, mandatarisId);
  if (!isMandataris) {
    throw new HttpError(
      `Mandataris with id ${mandatarisId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const results = await mandataris.getMandatarisFracties(mandatarisId);

  return results.map((result) => result.fractieId.value);
}

async function updateCurrentFractie(mandatarisId: string): Promise<void> {
  const isMandataris = await isValidId(RDF_TYPE.MANDATARIS, mandatarisId);
  if (!isMandataris) {
    throw new HttpError(
      `Mandataris with id ${mandatarisId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const currentFractieUri =
    await mandataris.findCurrentFractieForPerson(mandatarisId);
  if (!currentFractieUri) {
    return;
  }

  const personAndperiodIds =
    await mandataris.getPersonWithBestuursperiode(mandatarisId);
  const persoonFractieUri = await persoon.getFractie(
    personAndperiodIds.persoonId,
    personAndperiodIds.bestuursperiodeId,
  );
  if (persoonFractieUri) {
    await persoon.removeFractieFromCurrent(
      personAndperiodIds.persoonId,
      persoonFractieUri,
    );
  }

  await fractie.addFractieOnPerson(
    personAndperiodIds.persoonId,
    currentFractieUri,
  );
}

async function updateCurrentFractieSudo(
  mandatarisId: string,
  graph: string,
): Promise<void> {
  const isMandataris = await isValidId(RDF_TYPE.MANDATARIS, mandatarisId, true);
  if (!isMandataris) {
    throw new HttpError(
      `Mandataris with id ${mandatarisId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const currentFractie = await mandataris.findCurrentFractieForPerson(
    mandatarisId,
    graph,
    true,
  );
  if (!currentFractie) {
    return;
  }

  const personAndperiodIds = await mandataris.getPersonWithBestuursperiode(
    mandatarisId,
    true,
  );
  const fractieUri = await persoon.getFractie(
    personAndperiodIds.persoonId,
    personAndperiodIds.bestuursperiodeId,
    true,
  );
  if (fractieUri) {
    await persoon.removeFractieFromCurrentWithGraph(
      personAndperiodIds.persoonId,
      fractieUri,
      graph,
    );
  }
  await fractie.addFractieOnPersonWithGraph(
    personAndperiodIds.persoonId,
    currentFractie,
    graph,
  );
}

async function copyOverNonResourceDomainPredicates(
  mandatarisId: string,
  newMandatarisId: string,
): Promise<{ mandatarisId: string; itemsAdded: number }> {
  const isMandataris = await isValidId(RDF_TYPE.MANDATARIS, mandatarisId);
  if (!isMandataris) {
    throw new HttpError(
      `Mandataris with id ${mandatarisId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }
  const isNewMandataris = await isValidId(RDF_TYPE.MANDATARIS, newMandatarisId);
  if (!isNewMandataris) {
    throw new HttpError(
      `New mandataris with id ${mandatarisId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const nonDomainResourceProperties =
    await mandataris.getNonResourceDomainProperties(mandatarisId);

  if (nonDomainResourceProperties.length === 0) {
    return {
      mandatarisId: newMandatarisId,
      itemsAdded: 0,
    };
  }

  await mandataris.addPredicatesToMandataris(
    newMandatarisId,
    nonDomainResourceProperties,
  );

  return {
    mandatarisId: newMandatarisId,
    itemsAdded: nonDomainResourceProperties.length,
  };
}

export async function handleBulkSetPublicationStatus(
  mandatarissen: string[],
  status: string,
  link?: string,
): Promise<void> {
  if (!mandatarissen || mandatarissen.length == 0) {
    throw new HttpError('No mandatarissen provided', STATUS_CODE.BAD_REQUEST);
  }

  // We just check access to the first mandataris
  const isMandataris = await isValidId(
    RDF_TYPE.MANDATARIS,
    mandatarissen.at(0),
  );
  if (!isMandataris) {
    throw new HttpError('Unauthorized', 401);
  }

  if (status == 'Effectief') {
    await bulkSetPublicationStatusEffectief(mandatarissen);
    return;
  }
  if (status == 'Bekrachtigd') {
    if (!link) {
      throw new HttpError(
        'No link to publication was provided',
        STATUS_CODE.BAD_REQUEST,
      );
    }
    await bulkBekrachtigMandatarissen(mandatarissen, link);
    return;
  }
  throw new HttpError(
    `The provided status: ${status} is not a valid publication status, please provide Effectief or Bekrachtigd.`,
    STATUS_CODE.BAD_REQUEST,
  );
}

async function generateRows(config): Promise<Array<string>> {
  const { count, rangordeStartsAt, rangordeLabel } = config;
  let rangordeNumber = rangordeStartsAt;
  const valuesForQuery = new Array(count).fill(null).map(() => {
    const rangordeState = rangordeNumber;
    rangordeNumber++;
    const uuid = uuidv4();
    const uri: string = `http://data.lblod.info/id/mandatarissen/${uuid}`;

    return {
      uri,
      id: uuid,
      rangorde: createRangorde(rangordeState, rangordeLabel),
    };
  });

  await mandataris.generateMandatarissen(valuesForQuery, config);

  return valuesForQuery.map((value) => value.id);
}

async function setEndDateOfActiveMandatarissen(
  id: string,
  userId: string,
): Promise<void> {
  const isPersoon = await areIdsValid(RDF_TYPE.PERSON, [id]);
  if (!isPersoon) {
    throw new HttpError(
      `Person with id ${id} was not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const activeMandatarisUris =
    await mandataris.getActiveMandatarissenForPerson(id);

  await mandataris.bulkUpdateEndDate(activeMandatarisUris, new Date());
  await saveBulkHistoryItem(
    activeMandatarisUris,
    userId,
    'All person mandatarissen ended by user.',
  );
}
