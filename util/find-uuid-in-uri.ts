import { v4 as uuidv4 } from 'uuid';

export function getIdentifierFromPersonUri(uri: string) {
  const personBaseUri = 'http://data.lblod.info/id/personen/';
  if (!uri.includes(personBaseUri)) {
    return uuidv4();
  }

  return uri.replace(personBaseUri, '').trim();
}
