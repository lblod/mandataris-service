import { fractie } from '../data-access/fractie';
import {
  bulkBekrachtigMandatarissen,
  checkMandatarisOwnershipQuery,
  bulkSetPublicationStatusNietBekrachtigd,
  mandataris,
} from '../data-access/mandataris';
import { persoon } from '../data-access/persoon';
import { saveBulkHistoryItem } from '../data-access/form-queries';

import { PUBLICATION_STATUS, STATUS_CODE } from '../util/constants';
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
  checkMandatarisOwnership,
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
  statusUri: string,
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

  if (statusUri === PUBLICATION_STATUS.NIET_BEKRACHTIGD) {
    await bulkSetPublicationStatusNietBekrachtigd(mandatarissen);
    return;
  }
  if (statusUri === PUBLICATION_STATUS.BEKRACHTIGD) {
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
    `The provided status: ${statusUri} is not a valid publication status, please provide a correct publication status uri.`,
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
  userId: string,
  persoonId: string,
  date: Date,
  bestuursPeriod: string,
): Promise<void> {
  const isPersoon = await areIdsValid(RDF_TYPE.PERSON, [persoonId]);
  if (!isPersoon) {
    throw new HttpError(
      `Person with id ${persoonId} was not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const activeMandatarisUris = await mandataris.getActiveMandatarissenForPerson(
    persoonId,
    bestuursPeriod,
    date,
  );

  await mandataris.bulkUpdateEndDate(activeMandatarisUris, date);
  await saveBulkHistoryItem(
    activeMandatarisUris,
    userId,
    `Mandatarissen voor persoon(${persoonId}) beëindigd door gebruiker`,
  );
}

async function checkMandatarisOwnership(mandatarisIds: string[]) {
  return checkMandatarisOwnershipQuery(mandatarisIds);
}
