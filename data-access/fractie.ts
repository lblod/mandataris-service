import { sparqlEscapeString, sparqlEscapeUri, query, update } from 'mu';

import { getSparqlResults } from '../util/sparql-result';
import { TermProperty } from '../types';

export const fractie = {
  forBestuursperiode,
  addFractieOnPerson,
  removeFractieWhenNoLidmaatschap,
};

async function forBestuursperiode(
  bestuursperiodeId: string,
): Promise<Array<TermProperty>> {
  const getQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT DISTINCT ?fractieId
    WHERE {
      ?bestuursperiode a ext:Bestuursperiode;
        mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.
      ?bestuursorgaan a besluit:Bestuursorgaan;
        ext:heeftBestuursperiode ?bestuursperiode.
      ?fractie a mandaat:Fractie;
        mu:uuid ?fractieId;
        org:memberOf ?bestuursorgaan.
    }
  `;

  const sparqlResult = await query(getQuery);

  return getSparqlResults(sparqlResult);
}

async function addFractieOnPerson(
  personId: string,
  fractieUri: string,
): Promise<void> {
  const escapedFractie = sparqlEscapeUri(fractieUri);
  const insertQuery = `
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    INSERT {
      ?persoon extlmb:currentFracties ${escapedFractie} .
    }
    WHERE {
      ?persoon a person:Person;
        mu:uuid ${sparqlEscapeString(personId)}.
    }
  `;

  await update(insertQuery);
}

async function removeFractieWhenNoLidmaatschap(
  bestuursperiodeId: string,
): Promise<Array<string>> {
  const getFractiesQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT DISTINCT ?fractie
    WHERE {
      ?bestuursperiode a ext:Bestuursperiode;
        mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.
      ?bestuursorgaan a besluit:Bestuursorgaan;
        ext:heeftBestuursperiode ?bestuursperiode.
      ?fractie a mandaat:Fractie;
        org:memberOf ?bestuursorgaan;
        ext:isFractietype <http://data.vlaanderen.be/id/concept/Fractietype/Onafhankelijk>.
    
      FILTER NOT EXISTS {
        ?lidmaatschap a org:Membership;
          org:organisation ?fractie.
      }
    }
  `;
  const sparqlResult = await query(getFractiesQuery);
  const results = getSparqlResults(sparqlResult);
  const fractieUris = results.map((f) => f.fractie?.value).filter((f) => f);
  const escaped = fractieUris.map((uri) => sparqlEscapeUri(uri)).join(' ');
  if (results.length >= 1) {
    const deleteFractie = `
      PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

      DELETE {
        GRAPH ?graph {
          ?fractie ?p ?o.
        }
      }
      WHERE {
        VALUES ?fractie { ${escaped} }
        GRAPH ?graph {
          ?fractie a mandaat:Fractie;
            ?p  ?o.
        }
      }
    `;
    await update(deleteFractie);
  }

  return fractieUris;
}
