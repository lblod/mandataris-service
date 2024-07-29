import { query, update, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { v4 as uuidv4 } from 'uuid';
import { Term } from '../types';
import { sparqlEscapeTermValue } from '../util/sparql-escape';
import { TERM_STAGING_GRAPH } from './mandatees-decisions';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
} from '../util/sparql-result';
import { getIdentifierFromPersonUri } from '../util/find-uuid-in-uri';
import { FRACTIE_TYPE } from '../util/constants';

export const person = {
  exists,
  findOnafhankelijkeFractieUri,
  updateCurrentFractie,
};

// note since we use the regular query, not sudo queries, be sure to log in when using this endpoint. E.g. use the vendor login

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

async function exists(personId: string): Promise<boolean> {
  const askIfExists = `
      PREFIX person: <http://www.w3.org/ns/person#>
      PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

      ASK {
        GRAPH ?personGraph {
          ?person a person:Person;
            mu:uuid ${sparqlEscapeString(personId)}.
        }
        FILTER NOT EXISTS {
          ?personGraph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
        }
      }
    `;

  const result = await querySudo(askIfExists);

  return getBooleanSparqlResult(result);
}

async function findOnafhankelijkeFractieUri(
  personId: string,
): Promise<string | null> {
  const onafhankelijkFractieType = sparqlEscapeUri(FRACTIE_TYPE.ONAFHANKELIJK);
  const fractieQuery = `
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?fractie
    WHERE {
      GRAPH ?personGraph {
       ?person a person:Person;
          mu:uuid ${sparqlEscapeString(personId)};
          ^mandaat:isBestuurlijkeAliasVan ?mandataris.
       ?mandataris a mandaat:Mandataris;
            org:hasMembership ?lidmaatschap.
       ?lidmaatschap org:organisation ?fractie.
       ?fractie ext:isFractietype ${onafhankelijkFractieType}.
      }
      FILTER NOT EXISTS {
        ?personGraph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      } 
    }
  `;

  const results = await querySudo(fractieQuery);
  const first = findFirstSparqlResult(results);

  return first ? first.fractie.value : null;
}

async function updateCurrentFractie(
  personUri: string,
  fractieUri: string,
): Promise<string> {
  const escapedFractie = sparqlEscapeUri(fractieUri);
  const updateQuery = `
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    DELETE {
      GRAPH ?graph {
        ${sparqlEscapeUri(personUri)} extlmb:huidigeFractie ?currentFractie.
      }
    }
    INSERT {
      GRAPH ?graph{
        ${sparqlEscapeUri(personUri)} extlmb:huidigeFractie ${escapedFractie} .
      }
    }
    WHERE {
      GRAPH ?graph{
        ${sparqlEscapeUri(personUri)} a person:Person.
        OPTIONAL {
          ${sparqlEscapeUri(personUri)} extlmb:huidigeFractie ?currentFractie .
        }
      }
      FILTER NOT EXISTS {
        ?graph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
    }
  `;

  await updateSudo(updateQuery);

  return fractieUri;
}
