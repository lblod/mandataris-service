import {
  sparqlEscapeString,
  sparqlEscapeUri,
  sparqlEscapeDateTime,
  query,
  update,
} from 'mu';

import { getSparqlResults } from '../util/sparql-result';
import { TermProperty } from '../types';
import { FRACTIE_TYPE } from '../util/constants';

export const fractie = {
  forBestuursperiode,
  addFractieOnPerson,
  removeFractieWhenNoLidmaatschap,
};

async function forBestuursperiode(
  bestuursperiodeId: string,
  onafhankelijk: boolean = false,
): Promise<Array<TermProperty>> {
  const type = onafhankelijk
    ? FRACTIE_TYPE.ONAFHANKELIJK
    : FRACTIE_TYPE.SAMENWERKING;
  const getQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    SELECT DISTINCT ?fractieId
    WHERE {
      ?bestuursperiode a lmb:Bestuursperiode;
        mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.
      ?bestuursorgaan a besluit:Bestuursorgaan;
        lmb:heeftBestuursperiode ?bestuursperiode.
      ?fractie a mandaat:Fractie;
        mu:uuid ?fractieId;
        org:memberOf ?bestuursorgaan ;
        ext:isFractietype ${sparqlEscapeUri(type)} .
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
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    SELECT DISTINCT ?fractie
    WHERE {
      ?bestuursperiode a lmb:Bestuursperiode;
        mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.
      ?bestuursorgaan a besluit:Bestuursorgaan;
        lmb:heeftBestuursperiode ?bestuursperiode.
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
      PREFIX astreams: <http://www.w3.org/ns/activitystreams#>

      DELETE {
        ?fractie ?p ?o.
      }
      INSERT {
        ?fractie a astreams:Tombstone ;
          astreams:deleted ${sparqlEscapeDateTime(new Date())} ;
          astreams:formerType mandaat:Fractie .
      }
      WHERE {
        VALUES ?fractie { ${escaped} }
        ?fractie a mandaat:Fractie;
          ?p  ?o.
      }
    `;
    await query(deleteFractie);
  }

  return fractieUris;
}
