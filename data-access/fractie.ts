import {
  sparqlEscapeString,
  sparqlEscapeUri,
  sparqlEscapeDateTime,
  query,
  update,
} from 'mu';
import { updateSudo, querySudo } from '@lblod/mu-auth-sudo';
import { v4 as uuidv4 } from 'uuid';

import { getSparqlResults } from '../util/sparql-result';
import { FRACTIE_TYPE } from '../util/constants';
import { TermProperty } from '../types';
import moment from 'moment';

export const fractie = {
  forBestuursperiode,
  addFractieOnPerson,
  addFractieOnPersonWithGraph,
  removeFractieWhenNoLidmaatschap,
  canReplaceFractie,
  isReplacementStartDateAfterCurrentStart,
  replaceFractie,
};

async function forBestuursperiode(
  bestuursperiodeId: string,
  onafhankelijk,
): Promise<Array<TermProperty>> {
  const type = onafhankelijk
    ? FRACTIE_TYPE.ONAFHANKELIJK
    : FRACTIE_TYPE.SAMENWERKING;
  const getQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

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

async function addFractieOnPersonWithGraph(
  personId: string,
  fractieUri: string,
  graph: string,
): Promise<void> {
  const escapedFractie = sparqlEscapeUri(fractieUri);
  const insertQuery = `
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    INSERT {
      GRAPH ${sparqlEscapeUri(graph)} {
        ?persoon extlmb:currentFracties ${escapedFractie} .
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(graph)} {
        ?persoon a person:Person;
          mu:uuid ${sparqlEscapeString(personId)}.
      }
    }
  `;

  await updateSudo(insertQuery);
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
    const now = sparqlEscapeDateTime(new Date());
    const deleteFractie = `
      PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
      PREFIX astreams: <http://www.w3.org/ns/activitystreams#>
      PREFIX dct: <http://purl.org/dc/terms/>

      DELETE {
        ?fractie ?p ?o.
      }
      INSERT {
        ?fractie a astreams:Tombstone ;
          dct:modified ${now} ;
          astreams:deleted ${now} ;
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

async function canReplaceFractie(fractieId: string): Promise<boolean> {
  const result = await query(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>

    SELECT ?endDate
    WHERE {
      ?fractie mu:uuid ${sparqlEscapeString(fractieId)} .
      ?fractie ext:endDate ?endDate .
     } LIMIT 1
  `);
  const endDate = result.results.bindings[0]?.endDate?.value;

  return endDate ? false : true;
}

async function isReplacementStartDateAfterCurrentStart(
  currentFractieId: string,
  startDate: Date,
): Promise<boolean> {
  const result = await query(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>

    SELECT ?startDate
    WHERE {
      ?fractie mu:uuid ${sparqlEscapeString(currentFractieId)} .
      ?fractie ext:startDate ?startDate .
      ?fractie dct:replaces ?replacement .
    } LIMIT 1
  `);
  const start = result.results.bindings[0]?.startDate?.value;

  if (!start) {
    return true;
  }

  return moment(startDate).isAfter(start);
}
async function getGraphsOfFractie(fractieId: string): Promise<Array<string>> {
  const escapedId = sparqlEscapeString(fractieId);
  const result = await querySudo(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT DISTINCT ?graph
    WHERE {
     GRAPH ?graph {
       ?fractie a mandaat:Fractie .
       ?fractie mu:uuid ${escapedId} .
     }
     ?graph ext:ownedBy ?eenheid .
    }
  `);

  return result.results.bindings.map((b: TermProperty) => b.graph?.value);
}

async function replaceFractie(
  currentFractieId: string,
  label: string,
  endDate: Date,
): Promise<string> {
  const fractieUpdateGraphs = await getGraphsOfFractie(currentFractieId);
  const replacementFractieId = uuidv4();
  const replacementUri = `http://data.lblod.info/id/fracties/${replacementFractieId}`;
  const replacement = sparqlEscapeUri(replacementUri);
  const replacementLabel = sparqlEscapeString(label);

  await updateSudo(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>

    DELETE {
      GRAPH ?g {
        ?currentFractie dct:modified ?modified .
      }
    }
    INSERT {
      GRAPH ?g {
        ?currentFractie ext:endDate ${sparqlEscapeDateTime(endDate)} .
        ${replacement} dct:replaces ?currentFractie .
        ${replacement} ext:startDate ${sparqlEscapeDateTime(endDate)} .

        ${replacement} a ?type .
        ${replacement} mu:uuid ${sparqlEscapeString(replacementFractieId)} .
        ${replacement} regorg:legalName ${replacementLabel} .
        ${replacement} org:memberOf ?bestuursorgaan .
        ${replacement} org:linkedTo ?bestuurseenheid .
        ${replacement} ext:isFractietype ?fractieType.

        ${replacement} dct:modified ?now .
        ?currentFractie dct:modified ?now .
      }
    }
    WHERE {
      VALUES ?g {
        ${fractieUpdateGraphs.map((g) => sparqlEscapeUri(g)).join('\n')}
      }
      GRAPH ?g {
        ?currentFractie a ?type .
        ?currentFractie mu:uuid ${sparqlEscapeString(currentFractieId)} .
        ?currentFractie org:memberOf ?bestuursorgaan .
        ?currentFractie org:linkedTo ?gemeente .
        ?currentFractie ext:isFractietype ?fractieType .
        OPTIONAL {
          ?currentFractie dct:modified ?modified .
        }
      }
      BIND(NOW() as ?now)
    }
  `);

  return replacementUri;
}
