import { fractie } from '../data-access/fractie';
import { mandataris } from '../data-access/mandataris';
import { persoon } from '../data-access/persoon';

import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const mandatarisUsecase = {
  updateCurrentFractie,
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
  const fractieInBestuursperiode = await persoon.getFractie(
    personAndperiodIds.persoonId,
    personAndperiodIds.bestuursperiodeId,
  );
  if (fractieInBestuursperiode?.fractie) {
    await persoon.removeFractieFromCurrent(
      personAndperiodIds.persoonId,
      fractieInBestuursperiode.fractie.value,
    );
  }

  await fractie.addFractieOnPerson(
    personAndperiodIds.persoonId,
    currentFractie.fractie.value,
  );
}
