import { PREFIXES } from '../config/custom-dispatching/delta-context-config';
import { findFirstSparqlResult } from './sparql-result';
import { query, sparqlEscapeString } from 'mu';

export async function areIdsValid(
  rdfType: RDF_TYPE,
  ids?: Array<string>,
): Promise<boolean> {
  if (!ids || ids.length === 0) {
    return false;
  }

  const values = ids.map((id) => sparqlEscapeString(id));
  const countOfExisting = `
    ${PREFIXES}

    SELECT (COUNT(DISTINCT ?entity ) as ?count)
    WHERE {
      VALUES ?entityId { ${values.join('\n')} }
        ?entity a ${rdfType}.
        ?entity mu:uuid ?entityId.
    }
  `;
  const sparqlResult = await query(countOfExisting);
  const result = findFirstSparqlResult(sparqlResult);
  if (!result) {
    return false;
  }

  const count = parseInt(result.count?.value);
  return !isNaN(count) && count === ids.length;
}

// Make sure the prefix is available in the PREFIXES array
export enum RDF_TYPE {
  PERSON = 'person:Person',
  FRACTIE = 'mandaat:Fractie',
  BESTUURSORGAAN = 'besluit:Bestuursorgaan',
  BESTUURSFUNCTIE_CODE = 'ext:BestuursfunctieCode',
  BESTUURSPERIODE = 'lmb:Bestuursperiode',
}
