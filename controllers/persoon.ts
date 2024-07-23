import { person } from '../data-access/persoon';
import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const personUsecase = {
  findOnfhankelijkeFractieUri,
};

async function findOnfhankelijkeFractieUri(
  personId: string,
): Promise<string | null> {
  const isPerson = await person.isExisitingPerson(personId);

  if (!isPerson) {
    throw new HttpError(
      `No person found for given id: ${personId}`,
      STATUS_CODE.NOT_FOUND,
    );
  }

  const onafhankelijkerFractieUri =
    await person.findOnafhankelijkeFractieUri(personId);

  return onafhankelijkerFractieUri !== null ? onafhankelijkerFractieUri : null;
}
