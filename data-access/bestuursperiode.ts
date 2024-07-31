import { querySudo } from '@lblod/mu-auth-sudo';
import { findFirstSparqlResult } from '../util/sparql-result';

export const bestuursperiode = {
  findActive,
};

async function findActive(): Promise<string | undefined> {
  const currentYear = new Date().getFullYear();
  const getQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT ?bestuursperiode
    WHERE {
      ?bestuursperiode a ext:Bestuursperiode;
        ext:startYear ?startYear.        
      OPTIONAL {
        ?bestuursperiode ext:endYear ?endYear.
      }

      FILTER ( ?startYear < ${currentYear} && ${currentYear} <= ?safeEnd )
      BIND(IF(BOUND(?endYear), ?endYear,  ${currentYear} ) as ?safeEnd)
    }
  `;

  const results = await querySudo(getQuery);

  return findFirstSparqlResult(results)?.bestuursperiode?.value;
}
