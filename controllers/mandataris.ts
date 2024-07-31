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

  const current = await mandataris.findCurrentFractieForPerson(mandatarisId);
  if (!current) {
    return;
  }

  // Parameter of method should actually be a bestuursperiodeId or uri not a mandatarisId
  const fractieInBestuursperiode =
    await persoon.findFractieForBestuursperiode(mandatarisId);
  if (fractieInBestuursperiode?.fractie) {
    await persoon.removeFractieFromCurrent(
      current.persoon.value,
      fractieInBestuursperiode.fractie.value,
    );
  }

  await fractie.addFractieOnPerson(
    current.persoon.value,
    current.fractie.value,
  );
}
