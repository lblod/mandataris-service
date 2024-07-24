import { bestuursperiode } from '../data-access/bestuursperiode';
import { mandataris } from '../data-access/mandataris';
import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const mandatarisUsecase = {
  isActive,
  getBestuursperiode,
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

async function getBestuursperiode(
  mandatarisId: string,
): Promise<{ uri: string; id: string }> {
  const isMandataris = await mandataris.exists(mandatarisId);
  if (!isMandataris) {
    throw new HttpError(
      `No mandataris found for given id: ${mandatarisId}`,
      STATUS_CODE.BAD_REQUEST,
    );
  }
  const bestuursperiodeUri = await mandataris.getBestuursperiode(mandatarisId);
  const bestuursperiodeId =
    await bestuursperiode.getIdForUri(bestuursperiodeUri);

  return {
    id: bestuursperiodeId,
    uri: bestuursperiodeUri,
  };
}
