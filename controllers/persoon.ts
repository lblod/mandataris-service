import { bestuursperiode } from '../data-access/bestuursperiode';
import { persoon } from '../data-access/persoon';
import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const persoonUsecase = {
  getFractie,
  getMandatarisFracties,
};

async function getFractie(
  id: string,
  bestuursperiodeId: string,
): Promise<string | null> {
  const isPersoon = await persoon.isValidId(id);
  if (!isPersoon) {
    throw new HttpError(
      `Persoon with id ${id} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const isBestuursperiode = await bestuursperiode.isValidId(bestuursperiodeId);
  if (!isBestuursperiode) {
    throw new HttpError(
      `Bestuursperiode with id ${bestuursperiodeId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const result = await persoon.getFractie(id, bestuursperiodeId);

  return result ? result.fractie.value : null;
}

async function getMandatarisFracties(
  id: string,
  bestuursperiodeId: string,
): Promise<Array<string>> {
  const isPersoon = await persoon.isValidId(id);
  if (!isPersoon) {
    throw new HttpError(
      `Persoon with id ${id} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const isBestuursperiode = await bestuursperiode.isValidId(bestuursperiodeId);
  if (!isBestuursperiode) {
    throw new HttpError(
      `Bestuursperiode with id ${bestuursperiodeId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const results = await persoon.getMandatarisFracties(id, bestuursperiodeId);

  return results.map((result) => result.fractieId.value);
}
