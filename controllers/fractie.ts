import { bestuursperiode } from '../data-access/bestuursperiode';
import { fractie } from '../data-access/fractie';
import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const fractieUsecase = {
  forBestuursperiode,
  removeFractieWhenNoLidmaatschap,
};

async function forBestuursperiode(
  bestuursperiodeId: string,
  onafhankelijk: boolean = false,
): Promise<Array<string>> {
  const isBestuursperiode = await bestuursperiode.isValidId(bestuursperiodeId);
  if (!isBestuursperiode) {
    throw new HttpError(
      `Bestuursperiode with id ${bestuursperiodeId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const fractieResult = await fractie.forBestuursperiode(
    bestuursperiodeId,
    onafhankelijk,
  );

  if (fractieResult.length === 0) {
    return [];
  }

  return fractieResult.map((result) => result.fractieId?.value);
}

async function removeFractieWhenNoLidmaatschap(
  bestuursperiodeId: string,
): Promise<Array<string>> {
  const isBestuursperiode = await bestuursperiode.isValidId(bestuursperiodeId);
  if (!isBestuursperiode) {
    throw new HttpError(
      `Bestuursperiode with id ${bestuursperiodeId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  return await fractie.removeFractieWhenNoLidmaatschap(bestuursperiodeId);
}
