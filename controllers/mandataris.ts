import { fractie } from '../data-access/fractie';
import { mandataris } from '../data-access/mandataris';
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

  const current = await mandataris.findCurrentFractieForPerson(mandatarisId);
  if (!current) {
    return;
  }

  const hasCurrentFractieForBestuursperiode = false;
  if (hasCurrentFractieForBestuursperiode) {
    //TODO: remove old fractie for bestuursperiode
  }

  await fractie.addFractieOnPerson(
    current.persoon.value,
    current.fractie.value,
  );
}
