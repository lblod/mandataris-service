import { query as mu_query, update as mu_update } from 'mu';
import {
  querySudo as mu_querySudo,
  updateSudo as mu_updateSudo,
} from '@lblod/mu-auth-sudo';

import { getPrefixesForQuery } from './prefixes';

export async function query(sparqlQuery: string) {
  return await mu_query(getQueryWithPrefixes(sparqlQuery));
}

export async function update(sparqlQuery: string) {
  return await mu_update(getQueryWithPrefixes(sparqlQuery));
}
export async function querySudo(sparqlQuery: string) {
  return await mu_querySudo(getQueryWithPrefixes(sparqlQuery));
}

export async function updateSudo(sparqlQuery: string) {
  return await mu_updateSudo(getQueryWithPrefixes(sparqlQuery));
}

function getQueryWithPrefixes(sparqlQuery) {
  const startTime = performance.now();
  const prefixes = getPrefixesForQuery(sparqlQuery);
  console.log(
    `\n\n\tPERFORMANCE: getting the prefixes took: ${
      performance.now() - startTime
    } ms \n\n`,
  );
  return `
    # generated prefixes
    ${prefixes.join('\n')}
    # end generated prefixes
    ${sparqlQuery}
  `;
}
