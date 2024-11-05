import { bestuursperiode } from '../data-access/bestuursperiode';
import { persoon } from '../data-access/persoon';

import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const persoonUsecase = {
  getFractie,
  setEndDateOfActiveMandatarissen,
};

async function getFractie(
  id: string,
  bestuursperiodeId: string,
): Promise<string | null> {
  const isPersoon = await persoon.areIdsValid([id]);
  if (!isPersoon) {
    throw new HttpError(
      `Person with id ${id} was not found.`,
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

async function setEndDateOfActiveMandatarissen(id: string): Promise<void> {
  const isPersoon = await persoon.areIdsValid([id]);
  if (!isPersoon) {
    throw new HttpError(
      `Person with id ${id} was not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  await persoon.setEndDateOfActiveMandatarissen(id, new Date());
}
