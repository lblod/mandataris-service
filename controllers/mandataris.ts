import { fractie } from '../data-access/fractie';
import {
  bulkBekrachtigMandatarissen,
  bulkSetPublicationStatusEffectief,
  findDecisionForMandataris,
  mandataris,
} from '../data-access/mandataris';
import { persoon } from '../data-access/persoon';

import { Term } from '../types';

import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';
import { createRangorde } from '../util/rangorde';

import { v4 as uuidv4 } from 'uuid';

export const mandatarisUsecase = {
  getMandatarisFracties,
  updateCurrentFractie,
  updateCurrentFractieSudo,
  copyOverNonResourceDomainPredicates,
  findDecision,
  generateRows,
};

async function getMandatarisFracties(
  mandatarisId: string,
): Promise<Array<string>> {
  const isMandataris = await mandataris.isValidId(mandatarisId);
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
  const isMandataris = await mandataris.isValidId(mandatarisId);
  if (!isMandataris) {
    throw new HttpError(
      `Mandataris with id ${mandatarisId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const currentFractie =
    await mandataris.findCurrentFractieForPerson(mandatarisId);
  if (!currentFractie) {
    return;
  }

  const personAndperiodIds =
    await mandataris.getPersonWithBestuursperiode(mandatarisId);
  const existingFractieInBestuursperiode = await persoon.getFractie(
    personAndperiodIds.persoonId,
    personAndperiodIds.bestuursperiodeId,
  );
  if (existingFractieInBestuursperiode?.fractie) {
    await persoon.removeFractieFromCurrent(
      personAndperiodIds.persoonId,
      existingFractieInBestuursperiode.fractie.value,
    );
  }

  await fractie.addFractieOnPerson(
    personAndperiodIds.persoonId,
    currentFractie.fractie.value,
  );
}

async function updateCurrentFractieSudo(
  mandatarisId: string,
  graph: Term,
): Promise<void> {
  const isMandataris = await mandataris.isValidId(mandatarisId, true);
  if (!isMandataris) {
    throw new HttpError(
      `Mandataris with id ${mandatarisId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const currentFractie = await mandataris.findCurrentFractieForPerson(
    mandatarisId,
    graph.value,
    true,
  );
  if (!currentFractie) {
    return;
  }

  const personAndperiodIds = await mandataris.getPersonWithBestuursperiode(
    mandatarisId,
    true,
  );
  const existingFractieInBestuursperiode = await persoon.getFractie(
    personAndperiodIds.persoonId,
    personAndperiodIds.bestuursperiodeId,
    true,
  );
  if (existingFractieInBestuursperiode?.fractie) {
    await persoon.removeFractieFromCurrentWithGraph(
      personAndperiodIds.persoonId,
      existingFractieInBestuursperiode.fractie.value,
      graph,
    );
  }
  await fractie.addFractieOnPersonWithGraph(
    personAndperiodIds.persoonId,
    currentFractie.fractie.value,
    graph,
  );
}

async function copyOverNonResourceDomainPredicates(
  mandatarisId: string,
  newMandatarisId: string,
): Promise<{ mandatarisId: string; itemsAdded: number }> {
  const isMandataris = await mandataris.isValidId(mandatarisId);
  if (!isMandataris) {
    throw new HttpError(
      `Mandataris with id ${mandatarisId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }
  const isNewMandataris = await mandataris.isValidId(newMandatarisId);
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

async function findDecision(mandatarisId: string): Promise<string | null> {
  const isMandataris = await mandataris.isValidId(mandatarisId);
  if (!isMandataris) {
    throw new HttpError(
      `Mandataris with id ${mandatarisId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }
  const decision = await findDecisionForMandataris({
    type: 'uri',
    value: mandatarisId,
  } as Term);

  return decision ? decision.value : null;
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
  const isMandataris = await mandataris.isValidId(mandatarissen.at(0));
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
