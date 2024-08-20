import { fractie } from '../data-access/fractie';
import { mandataris } from '../data-access/mandataris';
import { persoon } from '../data-access/persoon';

import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const mandatarisUsecase = {
  updateCurrentFractie,
  createFromMandataris,
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

async function createFromMandataris(mandatarisId: string) {
  const isMandataris = await mandataris.isValidId(mandatarisId);
  if (!isMandataris) {
    throw new HttpError(
      `Mandataris with id ${mandatarisId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  // TODO:
  // 1. Updated Old lidmaatschap
  // 2. End current mandataris
  // 3. Create new lidmaatschap for the mandataris
  // 4. Create new mandataris with with updated properties => take care of the replacement
  // 5. Update current fractie for the person
}
