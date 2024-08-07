import { query, update, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { v4 as uuidv4 } from 'uuid';
import { Term, TermProperty } from '../types';
import { sparqlEscapeTermValue } from '../util/sparql-escape';
import { TERM_STAGING_GRAPH } from './mandatees-decisions';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
  getSparqlResults,
} from '../util/sparql-result';
import { getIdentifierFromPersonUri } from '../util/find-uuid-in-uri';

// note since we use the regular query, not sudo queries, be sure to log in when using this endpoint. E.g. use the vendor login

export const persoon = {
  isValidId,
  getFractie,
  getMandatarisFracties,
  removeFractieFromCurrent,
};

async function isValidId(id: string): Promise<boolean> {
  const askQuery = `
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    ASK {
      ?persoon a person:Person;
        mu:uuid ${sparqlEscapeString(id)}.
    }
  `;
  const sparqlResult = await query(askQuery);

  return getBooleanSparqlResult(sparqlResult);
}

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

// All graphs except the staging graph
export async function checkPersonExistsAllGraphs(
  subject: Term,
): Promise<boolean> {
  const escaped = {
    person: sparqlEscapeTermValue(subject),
  };

  const askIfPersoonExists = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

    ASK {
      GRAPH ?g {
        ${escaped.person} ?p ?o.
      }
      FILTER (?g != ${sparqlEscapeTermValue(TERM_STAGING_GRAPH)}).
    }
  `;
  const result = await querySudo(askIfPersoonExists);

  return getBooleanSparqlResult(result);
}

export async function createrPersonFromUri(
  personUri: Term,
  firstname: Term,
  lastname: Term,
  graph: Term,
): Promise<void> {
  const personIdentifier = getIdentifierFromPersonUri(personUri.value);
  const createQuery = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX person: <http://www.w3.org/ns/person#>
  PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  
  INSERT DATA {
      GRAPH ${sparqlEscapeTermValue(graph)} {
        ${sparqlEscapeTermValue(personUri)} a person:Person; 
          mu:uuid ${sparqlEscapeString(personIdentifier)};
          persoon:gebruikteVoornaam ${sparqlEscapeTermValue(firstname)};
          foaf:familyName ${sparqlEscapeTermValue(lastname)}.
        }
    }
  `;
  const baseLogText = `person with uri ${personUri.value} for ${firstname.value} ${lastname.value}`;

  try {
    await updateSudo(createQuery);
    console.log('|> Created ' + baseLogText);
  } catch (error) {
    console.log('|> Could not create ' + baseLogText);
  }
}

export async function copyPerson(subject: Term, graph: Term) {
  const escaped = {
    graph: sparqlEscapeTermValue(graph),
    person: sparqlEscapeTermValue(subject),
  };

  const q = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX person: <http://www.w3.org/ns/person#>
  PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

  INSERT {
    GRAPH ${escaped.graph} {
      ${escaped.person} a person:Person;
          mu:uuid ?uuid;
          persoon:gebruikteVoornaam ?voornaam;
          adms:identifier ?identifier;
          foaf:familyName ?achternaam;
          persoon:geslacht ?geslacht;
          foaf:name ?altName;
          persoon:heeftGeboorte ?geboorte.

      ?identifier a adms:Identifier;
          mu:uuid ?idUuid;
          skos:notation ?rrn.

      ?geboorte a persoon:Geboorte;
          mu:uuid ?geboorteUuid;
          persoon:datum ?geboorteDatum.
    }
  }
  WHERE {
    GRAPH ?g {
      ${escaped.person} a person:Person;
          mu:uuid ?uuid;
          persoon:gebruikteVoornaam ?voornaam;
          adms:identifier ?identifier;
          foaf:familyName ?achternaam.

      ?identifier a adms:Identifier;
          mu:uuid ?idUuid;
          skos:notation ?rrn.
      OPTIONAL {
        ${escaped.person} persoon:geslacht ?geslacht.
      }
      OPTIONAL {
        ${escaped.person} foaf:name ?altName.
      }
      OPTIONAL {
        ${escaped.person} persoon:heeftGeboorte ?geboorte.
        ?geboorte a persoon:Geboorte;
          mu:uuid ?geboorteUuid;
          persoon:datum ?geboorteDatum.
      }
    }
  }`;

  try {
    await updateSudo(q);
    console.log(
      `|> Copied person with uri ${escaped.person} to graph ${escaped.graph}.`,
    );
  } catch (error) {
    throw Error(`Could not copy person with uri: ${escaped.person}`);
  }
}

async function getFractie(
  id: string,
  bestuursperiodeId: string,
): Promise<TermProperty | null> {
  const getQuery = `
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT ?fractie
    WHERE {
      ?persoon a person:Person;
        mu:uuid ${sparqlEscapeString(id)};
        extlmb:currentFracties ?fractie.

      ?bestuursorgaan ext:heeftBestuursperiode ?bestuursperiode.
      ?fractie org:memberOf ?bestuursorgaan. 
      ?bestuursperiode mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.
    }
  `;

  const sparqlResult = await query(getQuery);

  return findFirstSparqlResult(sparqlResult);
}

async function getMandatarisFracties(
  id: string,
  bestuursperiodeId: string,
): Promise<Array<TermProperty>> {
  const getAllQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT DISTINCT ?fractieId
    WHERE {
      ?mandataris a mandaat:Mandataris;
        mandaat:isBestuurlijkeAliasVan ?person;
        org:hasMembership ?member.
      
      ?person mu:uuid ${sparqlEscapeString(id)}.
      ?member org:organisation ?fractie.

      ?bestuursorgaan a besluit:Bestuursorgaan;
        ext:heeftBestuursperiode ?bestuursperiode.
      
      ?fractie org:memberOf ?bestuursorgaan;
        mu:uuid ?fractieId.  

      ?bestuursperiode mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.
    }
  `;
  const results = await query(getAllQuery);

  return getSparqlResults(results);
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
      GRAPH ?graph {
        ?persoon extlmb:currentFracties ${sparqlEscapeUri(fractieUris)}.
      }
    }
    WHERE {
      GRAPH ?graph {
        ?persoon a person:Person;
          mu:uuid ${sparqlEscapeString(persoonId)}.
      }
    }
  `;

  await update(deleteQuery);
}
