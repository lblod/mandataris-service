import { bestuursperiode } from '../data-access/bestuursperiode';
import { person } from '../data-access/persoon';
import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const personUsecase = {
  findOnfhankelijkeFractieUri,
  updateCurrentFractie,
};

async function findOnfhankelijkeFractieUri(
  personId: string,
): Promise<string | null> {
  const isPerson = await person.isExisitingPerson(personId);

  if (!isPerson) {
    throw new HttpError(
      `No person found for given id: ${personId}`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const onafhankelijkerFractieUri =
    await person.findOnafhankelijkeFractieUri(personId);

  return onafhankelijkerFractieUri !== null ? onafhankelijkerFractieUri : null;
}

async function updateCurrentFractie(
  personId: string,
  bestuursperiodeId: string,
): Promise<string> {
  const isPerson = await person.isExisitingPerson(personId);
  if (!isPerson) {
    throw new HttpError(
      `No person found for given id: ${personId}`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const isBestuursperiode = await bestuursperiode.isExisting(bestuursperiodeId);
  if (!isBestuursperiode) {
    throw new HttpError(
      `No bestuursperiode found for given id: ${bestuursperiodeId}`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const currentFractieUriOfPerson = await person.searchCurrentFractie(
    personId,
    bestuursperiodeId,
  );

  if (!currentFractieUriOfPerson) {
    throw new HttpError(
      `No current fractie found for person: ${personId}`,
      STATUS_CODE.INTERNAL_SERVER_ERROR,
    );
  }

  return await person.updateCurrentFractie(personId, currentFractieUriOfPerson);
}
