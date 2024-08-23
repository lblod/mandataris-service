import { fractie } from '../data-access/fractie';
import { mandataris } from '../data-access/mandataris';
import { persoon } from '../data-access/persoon';

import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const mandatarisUsecase = {
  updateCurrentFractie,
  copyOverNonResourceDomainPredicates,
};

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
