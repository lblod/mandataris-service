import { person } from '../data-access/persoon';
import { HttpError } from '../util/http-error';

export const personUsecase = {
  findOnfhankelijkeFractieUri,
};

async function findOnfhankelijkeFractieUri(
  personId: string,
): Promise<string | null> {
  const isPerson = await person.isExisitingPerson(personId);
  console.log(`is person: ${isPerson}`);

  if (!isPerson) {
    throw new HttpError(`No person found for given id: ${personId}`, 404);
  }

  const onafhankelijkerFractieUri =
    await person.findOnafhankelijkeFractieUri(personId);

  return onafhankelijkerFractieUri !== null ? onafhankelijkerFractieUri : null;
}
