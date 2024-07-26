import { bestuurseenheid } from '../data-access/bestuurseenheid';
import { bestuursorgaan } from '../data-access/bestuursorgaan';
import { fractie } from '../data-access/fractie';
import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const fractieUsecase = {
  create,
};

async function create(
  bestuursorgaanUrisInTijd: Array<string>,
  bestuurseenheidUri: string,
): Promise<string> {
  const isBestuurseenheid = await bestuurseenheid.exists(bestuurseenheidUri);
  if (!isBestuurseenheid) {
    throw new HttpError(
      `Bestuurseenheid: ${bestuurseenheidUri} does not exist.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  if (bestuursorgaanUrisInTijd.length === 0) {
    throw new HttpError(
      'Bestuursorganen cannot have a length of 0.',
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const isBestuursorganenInTijdExisting = await bestuursorgaan.allExist(
    bestuursorgaanUrisInTijd,
  );
  if (!isBestuursorganenInTijdExisting) {
    throw new HttpError(
      'One of given bestuursorgaan URIs do not exist.',
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const newOnafhankelijkeFractie = await fractie.createOnafhankelijkeFractie(
    bestuursorgaanUrisInTijd,
    bestuurseenheidUri,
  );

  return newOnafhankelijkeFractie;
}
