import { fractie } from '../data-access/fractie';
import {
  bulkBekrachtigMandatarissen,
  findDecisionForMandataris,
  mandataris,
} from '../data-access/mandataris';
import { persoon } from '../data-access/persoon';
import { Term } from '../types';

import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const mandatarisUsecase = {
  getMandatarisFracties,
  updateCurrentFractie,
  updateCurrentFractieSudo,
  copyOverNonResourceDomainPredicates,
  findDecision,
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

export async function handleBulkBekrachtiging(
  mandatarissen: string[],
  link: string,
): Promise<void> {
  // Check access rights

  // Add besluit link
  await bulkBekrachtigMandatarissen(mandatarissen, link);

  // Check if successful?
}
