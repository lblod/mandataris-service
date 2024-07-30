import { bestuurseenheid } from '../data-access/bestuurseenheid';
import { bestuursorgaan } from '../data-access/bestuursorgaan';
import { fractie } from '../data-access/fractie';
import { person } from '../data-access/persoon';
import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const fractieUsecase = {
  create,
  getAllForPerson,
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

  const nonExistingBestuursorganenInTijd: Array<string> = [];
  for (const bestuursorgaanUri of bestuursorgaanUrisInTijd) {
    const isExisting = await bestuursorgaan.exists(bestuursorgaanUri);

    if (!isExisting) {
      nonExistingBestuursorganenInTijd.push(bestuursorgaanUri);
    }
  }

  if (nonExistingBestuursorganenInTijd.length >= 1) {
    throw new HttpError(
      `The following bestuursorgaan URIs do not exist: ${nonExistingBestuursorganenInTijd.join(
        ', ',
      )}`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const newOnafhankelijkeFractie = await fractie.createOnafhankelijkeFractie(
    bestuursorgaanUrisInTijd,
    bestuurseenheidUri,
  );

  return newOnafhankelijkeFractie;
}

async function getAllForPerson(
  persoonId: string,
  mandaatUri: string,
): Promise<Array<string>> {
  const isPersoon = await person.exists(persoonId);
  if (!isPersoon) {
    throw new HttpError(
      `Persoon with id: ${persoonId} does not exist.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  return await fractie.getForPerson(persoonId, mandaatUri);
}
