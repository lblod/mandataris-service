import { bestuurseenheid } from '../data-access/bestuurseenheid';
import { fractie } from '../data-access/fractie';
import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const fractieUsecase = {
  create,
};

async function create(
  bestuursorganenInTijd: Array<string>,
  bestuurseenheidUri: string,
): Promise<string> {
  // TODO: check the bestuursorganen

  const isBestuurseenheid =
    await bestuurseenheid.isExisiting(bestuurseenheidUri);

  if (!isBestuurseenheid) {
    throw new HttpError(
      `Bestuurseenheid: ${bestuurseenheidUri} does not exist.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const newOnafhankelijkeFractie = await fractie.createOnafhankelijkeFractie(
    bestuursorganenInTijd,
    bestuurseenheidUri,
  );

  return newOnafhankelijkeFractie;
}
