import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import { MandatarisBesluitLookup, Term, Triple } from '../types';
import {
  createNotification,
  getMandatarisNotificationGraph,
} from '../util/create-notification';
import { TERM_TYPE, sparqlEscapeTermValue } from '../util/sparql-escape';
import {
  getBooleanSparqlResult,
  getSparqlResults,
} from '../util/sparql-result';

export const BESLUIT_STAGING_GRAPH =
  process.env.BESLUIT_STAGING_GRAPH ||
  'http://mu.semte.ch/graphs/besluiten-consumed';

export const TERM_STAGING_GRAPH = {
  type: TERM_TYPE.URI,
  value: 'http://mu.semte.ch/graphs/besluiten-consumed',
};
export const TERM_MANDATARIS_TYPE = {
  type: TERM_TYPE.URI,
  value: 'http://data.vlaanderen.be/ns/mandaat#Mandataris',
} as Term;

export async function isSubjectOfType(
  rdfType: string,
  subject: string,
): Promise<boolean> {
  const queryForType = `
    ASK {
      ${sparqlEscapeUri(subject)} a ${sparqlEscapeUri(rdfType)} .
    }
  `;

  const isOfSubject = await querySudo(queryForType);

  return getBooleanSparqlResult(isOfSubject);
}

export async function insertTriplesInGraph(
  triples: Array<Triple>,
  graph: string,
): Promise<void> {
  if (triples.length === 0) {
    return;
  }

  const insertTriples = triples.map((triple: Triple) => {
    const subject = sparqlEscapeTermValue(triple.subject);
    const predicate = sparqlEscapeTermValue(triple.predicate);
    const object = sparqlEscapeTermValue(triple.object);

    return `${subject} ${predicate} ${object} .`;
  });

  const insertQuery = `
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(graph)} {
        ${insertTriples.join('\n')}
      }
    }
  `;

  try {
    await updateSudo(insertQuery, {}, { mayRetry: true });
    console.log(
      `|> Inserted ${triples.length} new triples in graph (${graph}).`,
    );
  } catch (error) {
    throw Error(
      `Could not insert ${triples.length} triples in graph (${graph}).`,
    );
  }
}

export async function checkIfMinimalMandatarisInfoAvailable(
  mandatarisBesluitInfo: MandatarisBesluitLookup,
) {
  const mandataris = mandatarisBesluitInfo.mandatarisUri;
  const besluitUri = mandatarisBesluitInfo.besluitUri;

  const query = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX person: <http://www.w3.org/ns/person#>

    SELECT * {
      GRAPH ${sparqlEscapeUri(BESLUIT_STAGING_GRAPH)} {
        ${sparqlEscapeUri(mandataris)} a mandaat:Mandataris ;
          mandaat:start ?start ;
          mandaat:isBestuurlijkeAliasVan ?person ;
          org:holds ?mandaat.
        FILTER NOT EXISTS {
          ${sparqlEscapeUri(mandataris)} org:holds ?otherMandaat.
          FILTER (?otherMandaat != ?mandaat)
        }
      }
      # person can be in any graph, either provided, public or bestuurseenheid graph
      ?person a person:Person ;
        foaf:familyName ?familyName ;
        persoon:gebruikteVoornaam ?firstName .
      GRAPH ?bestuurseenheidGraph {
        ?mandaat a mandaat:Mandaat .
      }
      ?bestuurseenheidGraph ext:ownedBy ?bestuurseenheid.
    } LIMIT 1
  `;
  const result = await querySudo(query);
  const typedResult = getSparqlResults(result);
  if (typedResult.length) {
    return {
      minimalInfoAvailable: true,
      graph: typedResult[0].bestuurseenheidGraph.value,
    };
  } else {
    const graph = await getMandatarisNotificationGraph(mandataris);
    await createNotification({
      title: 'Besluit met Mandataris zonder minimale info',
      description: `Een Mandataris uit het Besluit heeft niet alle minimale informatie. Een Mandataris in een Besluit moet minstens een startdatum, een persson en een mandaat bevatten. Het mandaat moet gekend zijn bij ABB.`,
      type: 'error',
      graph,
      links: [
        {
          type: 'mandataris',
          uri: mandataris,
        },
        {
          type: 'besluit',
          uri: besluitUri,
        },
      ],
    });
    return { minimalInfoAvailable: false, graph: null };
  }
}

export async function checkIfMandatarisExists(mandatarisUri) {
  const safeMandatarisUri = sparqlEscapeUri(mandatarisUri);
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    ASK {
      GRAPH ?g {
        ${safeMandatarisUri} a <http://data.vlaanderen.be/ns/mandaat#Mandataris> .
      }
      ?g ext:ownedBy ?bestuurseenheid.
    }
  `;
  const result = await querySudo(query);
  return getBooleanSparqlResult(result);
}

export async function getGraphsWhereInstanceExists(instanceUri) {
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT ?graph WHERE {
      GRAPH ?graph {
        ${sparqlEscapeUri(instanceUri)} a ?thing.
      }
      OPTIONAL {
        ?graph ext:ownedBy ?bestuurseenheid.
      }
      FILTER(?graph = <http://mu.semte.ch/graphs/public> || BOUND(?bestuurseenheid))
    }
  `;
  const result = await querySudo(query);
  return getSparqlResults(result);
}

export async function getMandatarisTriplesInStagingGraph(
  mandatarisUri,
): Promise<Triple[]> {
  // note: not asking for uuid, keep ours, not asking for membership: done when handling fracties
  const query = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT ?subject ?predicate ?object WHERE {
      VALUES ?subject {
        ${sparqlEscapeUri(mandatarisUri)}
      }
      VALUES ?predicate {
        mandaat:start
        mandaat:einde
        mandaat:rangorde
        mandaat:beleidsdomein
        mandaat:isBestuurlijkeAliasVan
        mandaat:status
        org:holds
      }
      GRAPH ${sparqlEscapeUri(BESLUIT_STAGING_GRAPH)} {
        ${sparqlEscapeUri(mandatarisUri)} ?predicate ?object .
      }

    }
  `;
  const result = await querySudo(query);
  return getSparqlResults(result) as Triple[];
}

export async function getPersonTriplesInStagingGraph(
  personUri,
): Promise<Triple[]> {
  const query = `
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>

    SELECT ?subject ?predicate ?object WHERE {
      VALUES ?subject {
        ${sparqlEscapeUri(personUri)}
      }
      VALUES ?predicate {
        foaf:familyName
        foaf:name
        persoon:gebruikteVoornaam
      }
      GRAPH ${sparqlEscapeUri(BESLUIT_STAGING_GRAPH)} {
        ${sparqlEscapeUri(personUri)} ?predicate ?object .
      }

    }
  `;
  const result = await querySudo(query);
  return getSparqlResults(result) as Triple[];
}

export async function getBeleidsdomeinTriplesInStagingGraph(
  beleidsdomeinUri,
): Promise<Triple[]> {
  const query = `
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT ?subject ?predicate ?object WHERE {
      VALUES ?subject {
        ${sparqlEscapeUri(beleidsdomeinUri)}
      }
      VALUES ?predicate {
        skos:prefLabel
      }
      GRAPH ${sparqlEscapeUri(BESLUIT_STAGING_GRAPH)} {
        ${sparqlEscapeUri(beleidsdomeinUri)} ?predicate ?object .
      }

    }
  `;
  const result = await querySudo(query);
  return getSparqlResults(result) as Triple[];
}

export async function replacePropertiesOnInstance(
  subject: string,
  triples: Triple[],
  graph: string,
) {
  // just some safety in case someone passes us triples with a different subject
  const subjectTriples = triples.filter((t) => t.subject.value == subject);
  // This only removes the properties that are in the staging graph and keeps the old ones
  // That way we don't accidentally delete information that we want to keep if they are
  // not specified in the staging graph like beleidsdomeinen
  const predicates = subjectTriples.map((triple) => triple.predicate);
  const newData = subjectTriples
    .map((triple) => {
      return `${sparqlEscapeUri(subject)} ${sparqlEscapeUri(
        triple.predicate.value,
      )} ${sparqlEscapeTermValue(triple.object)} .`;
    })
    .join('\n');
  const query = `
    DELETE {
      GRAPH ${sparqlEscapeUri(graph)} {
        ${sparqlEscapeUri(subject)} ?p ?o .
      }
    } INSERT {
      GRAPH ${sparqlEscapeUri(graph)} {
        ${newData}
      }
    } WHERE {
      GRAPH ${sparqlEscapeUri(graph)} {
        ${sparqlEscapeUri(subject)} ?p ?o .
        VALUES ?p {
          ${predicates.map((p) => sparqlEscapeUri(p.value)).join(' ')}
        }
      }
    }
  `;

  await updateSudo(query);
}

export async function checkIfAllPropertiesAccountedFor(
  subject: string,
  triples: Triple[],
  graph,
) {
  // just some safety in case someone passes us triples with a different subject
  const subjectTriples = triples.filter((t) => t.subject.value == subject);
  const predicates = subjectTriples.map((triple) => triple.predicate);

  const query = `
    SELECT ?p ?o WHERE {
      GRAPH ${sparqlEscapeUri(graph)} {
        ${sparqlEscapeUri(subject)} ?p ?o .
        VALUES ?p {
          ${predicates.map((p) => sparqlEscapeUri(p.value)).join(' ')}
        }
      }
    }`;
  const result = await querySudo(query);
  const results = getSparqlResults(result);

  const differentLength = results.length !== subjectTriples.length;
  if (differentLength) {
    return false;
  }
  const originValueMap = {};
  subjectTriples.forEach((t) => {
    originValueMap[t.predicate.value] = originValueMap[t.predicate.value] || [];
    originValueMap[t.predicate.value].push(t.object.value);
  });

  let missingResult = false;
  results.forEach((r) => {
    if (
      !originValueMap[r.p.value] ||
      !originValueMap[r.p.value].includes(r.o.value)
    ) {
      missingResult = true;
    }
  });
  return !missingResult;
}

export async function copyPersonToGraph(personUri: string, graph: string) {
  const safePersonUri = sparqlEscapeUri(personUri);
  const query = `
  PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  INSERT {
    GRAPH ${sparqlEscapeUri(graph)} {
      ${safePersonUri} ?p ?o .
      ${safePersonUri} persoon:heeftGeboorte ?geboorte .
        ?geboorte ?geboorteP ?geboorteO.
      ${safePersonUri} adms:identifier ?identifier .
        ?identifier ?idP ?idO.
    }
  } WHERE {
    GRAPH ?g {
      ${safePersonUri} ?p ?o .
      OPTIONAL {
        ${safePersonUri} persoon:heeftGeboorte ?geboorte .
        ?geboorte ?geboorteP ?geboorteO.
      }
      OPTIONAL {
        ${safePersonUri} adms:identifier ?identifier .
        ?identifier ?idP ?idO.
      }
    }
    ?g ext:ownedBy ?bestuurseenheid.
    FILTER (?g = <http://mu.semte.ch/graphs/public> || BOUND(?bestuurseenheid))
  }`;
  await updateSudo(query);
}

export async function copySimpleInstanceToGraph(
  instanceUri: string,
  graph: string,
) {
  const safeInstanceUri = sparqlEscapeUri(instanceUri);
  const query = `
  PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  INSERT {
    GRAPH ${sparqlEscapeUri(graph)} {
      ${safeInstanceUri} ?p ?o .
    }
  } WHERE {
    GRAPH ?g {
      ${safeInstanceUri} ?p ?o .
    }
    ?g ext:ownedBy ?bestuurseenheid.
    FILTER (?g = <http://mu.semte.ch/graphs/public> || BOUND(?bestuurseenheid))
  }`;
  await updateSudo(query);
}
