import { querySudo } from '@lblod/mu-auth-sudo';
import {
  query,
  sparqlEscapeDateTime,
  sparqlEscapeString,
  sparqlEscapeUri,
  update,
} from 'mu';
import { v4 as uuidv4 } from 'uuid';
import { Term, TermProperty } from '../types';
import { sparqlEscapeTermValue } from '../util/sparql-escape';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
} from '../util/sparql-result';

// note since we use the regular query, not sudo queries, be sure to log in when using this endpoint. E.g. use the vendor login

export const persoon = {
  getFractie,
  removeFractieFromCurrent,
  removeFractieFromCurrentWithGraph,
  setEndDateOfActiveMandatarissen,
};

export const findPerson = async (rrn: string) => {
  const q = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX person: <http://www.w3.org/ns/person#>
  PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
  PREFIX adms: <http://www.w3.org/ns/adms#>

  SELECT DISTINCT ?uri ?naam ?voornaam
  WHERE {
      ?identifier skos:notation ${sparqlEscapeString(rrn)}.
      ?uri a person:Person;
          persoon:gebruikteVoornaam ?voornaam;
          foaf:familyName ?naam;
          adms:identifier ?identifier.
  }
  LIMIT 1
  `;

  const result = await query(q);

  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    const uri = binding.uri.value;
    const voornaam = binding.voornaam.value;
    const naam = binding.naam.value;
    return { uri, voornaam, naam };
  } else {
    return null;
  }
};

export const createPerson = async (
  rrn: string,
  fName: string,
  lName: string,
) => {
  const uuid = uuidv4();
  const uri = `http://data.lblod.info/id/personen/${uuid}`;
  const idUuid = uuidv4();
  const idUri = `http://data.lblod.info/id/identificatoren/${idUuid}`;
  const q = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX person: <http://www.w3.org/ns/person#>
  PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/application> {
      ${sparqlEscapeUri(uri)} a person:Person;
          mu:uuid ${sparqlEscapeString(uuid)};
          persoon:gebruikteVoornaam ${sparqlEscapeString(fName)};
          adms:identifier ${sparqlEscapeUri(idUri)};
          foaf:familyName ${sparqlEscapeString(lName)}.

      ${sparqlEscapeUri(idUri)} a adms:Identifier;
          mu:uuid ${sparqlEscapeString(idUuid)};
          skos:notation ${sparqlEscapeString(rrn)}.
    }
  }`;

  await update(q);

  return {
    uri: uri,
    voornaam: fName,
    naam: lName,
  };
};

export const personExistsInGraph = async (
  personUri: string,
  orgGraph: Term,
): Promise<boolean> => {
  const result = await querySudo(`
    ASK {
      GRAPH ${sparqlEscapeTermValue(orgGraph)} {
        ${sparqlEscapeUri(personUri)} a <http://www.w3.org/ns/person#Person> .
      }
    }
  `);
  return getBooleanSparqlResult(result);
};

async function getFractie(
  id: string,
  bestuursperiodeId: string,
  sudo: boolean = false,
): Promise<TermProperty | null> {
  const getQuery = `
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    SELECT DISTINCT ?fractie
    WHERE {
      ?persoon a person:Person;
        mu:uuid ${sparqlEscapeString(id)};
        extlmb:currentFracties ?fractie.

      ?bestuursorgaan lmb:heeftBestuursperiode ?bestuursperiode.
      ?fractie org:memberOf ?bestuursorgaan.
      ?bestuursperiode mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.
    }
  `;

  const sparqlResult = sudo ? await querySudo(getQuery) : await query(getQuery);

  return findFirstSparqlResult(sparqlResult);
}

export async function isOnafhankelijkInPeriod(
  id: string,
  bestuursperiodeId: string,
  graph: Term,
): Promise<string | undefined> {
  const q = `
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT ?fractie {
      GRAPH ${sparqlEscapeTermValue(graph)}{
        ?persoon a person:Person ;
          mu:uuid ${sparqlEscapeString(id)} ;
          extlmb:currentFracties ?fractie .
        ?bestuursorgaan lmb:heeftBestuursperiode ?bestuursperiode .
        ?fractie org:memberOf ?bestuursorgaan ;
          ext:isFractietype <http://data.vlaanderen.be/id/concept/Fractietype/Onafhankelijk> .
      }
      ?bestuursperiode mu:uuid ${sparqlEscapeString(bestuursperiodeId)} .
    }
    LIMIT 1
  `;

  const queryResult = await querySudo(q);

  const result = findFirstSparqlResult(queryResult);
  return result?.fractie.value;
}

async function removeFractieFromCurrent(
  persoonId: string,
  fractieUris: string,
): Promise<void> {
  const deleteQuery = `
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    DELETE {
      ?persoon extlmb:currentFracties ${sparqlEscapeUri(fractieUris)}.
    }
    WHERE {
      ?persoon a person:Person;
        mu:uuid ${sparqlEscapeString(persoonId)}.
    }
  `;

  await update(deleteQuery);
}

async function removeFractieFromCurrentWithGraph(
  persoonId: string,
  fractieUris: string,
  graph: Term,
): Promise<void> {
  const deleteQuery = `
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    DELETE {
      GRAPH ${sparqlEscapeTermValue(graph)} {
        ?persoon extlmb:currentFracties ${sparqlEscapeUri(fractieUris)}.
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeTermValue(graph)} {
        ?persoon a person:Person;
          mu:uuid ${sparqlEscapeString(persoonId)}.
      }
    }
  `;

  await updateSudo(deleteQuery);
}

async function setEndDateOfActiveMandatarissen(
  id: string,
  endDate: Date,
): Promise<void> {
  const escaped = {
    persoonId: sparqlEscapeString(id),
    endDate: sparqlEscapeDateTime(endDate),
    dateNow: sparqlEscapeDateTime(new Date()),
  };
  const updateQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    DELETE {
      ?mandataris mandaat:einde ?endDate.
    }
    INSERT {
      ?mandataris mandaat:einde ${escaped.endDate}.
    }
    WHERE {
      ?mandataris a mandaat:Mandataris ;
        mandaat:isBestuurlijkeAliasVan ?persoon;
        mandaat:start ?startDate;
        mandaat:status ?mandatarisStatus.
      ?persoon mu:uuid ${escaped.persoonId}.
      OPTIONAL {
        ?mandataris mandaat:einde ?endDate.
      }
      FILTER (
          ${escaped.dateNow} >= xsd:dateTime(?startDate) &&
          ${escaped.dateNow} <= ?safeEnd
      )
      BIND(IF(BOUND(?endDate), ?endDate,  ${escaped.dateNow}) as ?safeEnd )
    }
  `;
  await query(updateQuery);
}
