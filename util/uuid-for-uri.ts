import { v4 as uuidv4 } from 'uuid';
import { sparqlEscapeUri } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';

function getIdentifierFromUri(uri: string) {
  const uuid = uri.split('/').pop();
  if (
    uuid &&
    uuid
      .toLocaleLowerCase()
      .match(
        '(^[a-f0-9]{8}(-)?[a-f0-9]{4}(-)?[a-f0-9]{4}(-)?[a-f0-9]{4}(-)?[a-f0-9]{12}$)',
      )
  ) {
    return uuid;
  } else {
    return null;
  }
}

export async function getUuidForUri(
  uri: string,
  options?: {
    allowCheckingUri: boolean;
    allowGenerateUuid: boolean;
  },
) {
  const query = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?uuid WHERE {
      ${sparqlEscapeUri(uri)} mu:uuid ?uuid .
    } LIMIT 1`;

  const result = await querySudo(query);
  if (result.results.bindings.length == 1) {
    return result.results.bindings[0].uuid.value;
  }
  if (!options?.allowCheckingUri && !options?.allowGenerateUuid) {
    return null;
  }

  let id: string | null = null;
  if (options?.allowCheckingUri) {
    id = getIdentifierFromUri(uri);
  }
  if (!id && options?.allowGenerateUuid) {
    id = uuidv4();
  }
  return id;
}
