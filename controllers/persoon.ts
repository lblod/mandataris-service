import { person } from '../data-access/persoon';
import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const personUsecase = {
  findOnfhankelijkeFractieUri,
};

async function findOnfhankelijkeFractieUri(
  personId: string,
  bestuursperiodeId: string,
): Promise<string | null> {
  const isPerson = await person.exists(personId);

  if (!isPerson) {
    throw new HttpError(
      `No person found for given id: ${personId}`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  return await person.findOnafhankelijkeFractieUri(personId, bestuursperiodeId);
}
