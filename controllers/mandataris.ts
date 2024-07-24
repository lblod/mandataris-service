import { mandataris } from '../data-access/mandataris';
import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const mandatarisUsecase = {
  isActive,
  getBestuursperiode,
};

async function isActive(mandatarisId: string): Promise<boolean> {
  const isMandataris = await mandataris.isExisting(mandatarisId);
  if (!isMandataris) {
    throw new HttpError(
      `No mandataris found for given id: ${mandatarisId}`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  return mandataris.isActive(mandatarisId);
}

async function getBestuursperiode(mandatarisId: string): Promise<string> {
  const isMandataris = await mandataris.isExisting(mandatarisId);
  if (!isMandataris) {
    throw new HttpError(
      `No mandataris found for given id: ${mandatarisId}`,
      STATUS_CODE.BAD_REQUEST,
    );
  }
  return await mandataris.getBestuursperiode(mandatarisId);
}
