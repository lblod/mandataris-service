import { person } from '../data-access/persoon';
import { HttpError } from '../util/http-error';

export const personUsecase = {
  getOnfhankelijkeFractieUri,
};

async function getOnfhankelijkeFractieUri(personId: string): Promise<string> {
  const isPerson = await person.isExisitingPerson(personId);
  console.log(`is person: ${isPerson}`);

  if (!isPerson) {
    throw new HttpError(`No person found for given id: ${personId}`, 404);
  }

  const onafhankelijkerFractieUri =
    await person.findOnafhankelijkeFractieUri(personId);

  if (onafhankelijkerFractieUri === null) {
    return 'not created yet';
  }

  return onafhankelijkerFractieUri;
}
