import { mandataris } from '../data-access/mandataris';
import { bestuursperiode } from '../data-access/bestuursperiode';
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

async function updateCurrentFractie(
  mandatarisId: string,
): Promise<string | null> {
  const isMandataris = await mandataris.exists(mandatarisId);
  if (!isMandataris) {
    throw new HttpError(
      `No mandataris found for given id: ${mandatarisId}`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const activeBestuursperiode = await bestuursperiode.findActive();
  const currentFractieUri = await mandataris.findCurrentFractieInPeriod(
    mandatarisId,
    activeBestuursperiode,
  );

  if (!currentFractieUri) {
    return null;
  }

  const personUri = await mandataris.findPerson(mandatarisId);
  if (!personUri) {
    throw new HttpError(
      `No person found for mandataris with id: ${mandataris}`,
      STATUS_CODE.INTERNAL_SERVER_ERROR,
    );
  }

  return await person.updateCurrentFractie(personUri, currentFractieUri);
}
