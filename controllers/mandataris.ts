import { mandataris } from '../data-access/mandataris';
import { person } from '../data-access/persoon';
import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const mandatarisUsecase = {
  isActive,
  updateCurrentFractie,
};

async function isActive(mandatarisId: string): Promise<boolean> {
  const isMandataris = await mandataris.exists(mandatarisId);
  if (!isMandataris) {
    throw new HttpError(
      `No mandataris found for given id: ${mandatarisId}`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  return mandataris.isActive(mandatarisId);
}

async function updateCurrentFractie(mandatarisId: string): Promise<string> {
  const isMandataris = await mandataris.exists(mandatarisId);
  if (!isMandataris) {
    throw new HttpError(
      `No mandataris found for given id: ${mandatarisId}`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const currentFractie =
    await mandataris.getCurrentFractieForPersonOf(mandatarisId);

  if (!currentFractie.fractieUri) {
    throw new HttpError(
      `No current fractie found for person: ${currentFractie.personUri}`,
      STATUS_CODE.INTERNAL_SERVER_ERROR,
    );
  }

  return await person.updateCurrentFractie(
    currentFractie.personUri,
    currentFractie.fractieUri,
  );
}
