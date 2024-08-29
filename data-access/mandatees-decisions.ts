import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import { Quad, Term, TermProperty, Triple } from '../types';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
  getSparqlResults,
} from '../util/sparql-result';
import { TERM_TYPE, sparqlEscapeTermValue } from '../util/sparql-escape';
import { MANDATARIS_STATUS, PUBLICATION_STATUS } from '../util/constants';

export const TERM_STAGING_GRAPH = {
  type: TERM_TYPE.URI,
  value:
    'http://mu.semte.ch/graphs/besluiten-consumed974816591f269bb7d74aa1720922651529f3d3b2a787f5c60b73e5a0384950a4/LoketLB-mandaatGebruiker',
};
export const TERM_MANDATARIS_TYPE = {
  type: TERM_TYPE.URI,
  value: 'http://data.vlaanderen.be/ns/mandaat#Mandataris',
} as Term;

export async function isSubjectOfType(
  rdfType: Term,
  subject: Term,
): Promise<boolean> {
  const queryForType = `
    ASK {
      ${sparqlEscapeTermValue(subject)} a ${sparqlEscapeTermValue(rdfType)} .
    }
  `;

  const isOfSubject = await querySudo(queryForType);

  return getBooleanSparqlResult(isOfSubject);
}

export async function getTriplesOfSubject(
  subject: Term,
  graph: Term,
): Promise<Array<Triple>> {
  const queryForsubject = `
    SELECT ?predicate ?object ?graph
    WHERE {
      GRAPH ${sparqlEscapeTermValue(graph)} {
        ${sparqlEscapeTermValue(subject)} ?predicate ?object .
      }
    }
  `;

  const results = await querySudo(queryForsubject);

  return getSparqlResults(results).map((po) => {
    return {
      subject: subject,
      predicate: po.predicate,
      object: po.object,
    } as Triple;
  });
}

export async function getQuadsInLmbFromTriples(
  triples: Array<Triple>,
): Promise<Array<Quad>> {
  const useAsValues = triples.map((triple: Triple) => {
    return `(${sparqlEscapeTermValue(triple.subject)} ${sparqlEscapeTermValue(
      triple.predicate,
    )}) \n`;
  });
  const query = `
    SELECT ?subject ?predicate ?object ?graph
    WHERE {
      GRAPH ?graph {  
        VALUES (?subject ?predicate) {
            ${useAsValues.join('')}
        }
        OPTIONAL {
          ?subject ?predicate ?object .
        }
        MINUS {
          GRAPH ${sparqlEscapeTermValue(TERM_STAGING_GRAPH)} {
            ?subject ?predicate ?object .
          }
        }
      }
    }
  `;
  const resultsInTarget = await querySudo(query);

  return getSparqlResults(resultsInTarget) as Array<Quad>;
}

export async function findPersoonForMandatarisInGraph(
  subject: Term,
  graph: Term,
): Promise<null | Term> {
  const escaped = {
    graph: sparqlEscapeTermValue(graph),
    mandataris: sparqlEscapeTermValue(subject),
  };

  const queryForPersoon = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

    SELECT ?persoon
    WHERE {
      GRAPH ${escaped.graph}{
        ${escaped.mandataris} mandaat:isBestuurlijkeAliasVan ?persoon .
      }
    }
  `;
  const persoonForMandataris = await querySudo(queryForPersoon);
  const result = findFirstSparqlResult(persoonForMandataris);

  return result?.persoon ?? null;
}

export async function updateDifferencesOfMandataris(
  currentQuads: Array<Quad>,
  incomingTriples: Array<Triple>,
  insertGraph: Term,
): Promise<void> {
  for (const incomingTriple of incomingTriples) {
    const currentQuad = currentQuads.find(
      (quad: Quad) =>
        quad.subject.value == incomingTriple.subject.value &&
        quad.predicate.value == incomingTriple.predicate.value,
    );
    if (currentQuad) {
      if (incomingTriple.object.value !== currentQuad.object.value) {
        console.log(
          `|> Value for predicate (${incomingTriple.predicate.value}) differ. Current: ${currentQuad.object.value} incoming: ${incomingTriple.object.value}. Updating value.`,
        );
        const escaped = {
          subject: sparqlEscapeTermValue(currentQuad.subject),
          predicate: sparqlEscapeTermValue(currentQuad.predicate),
          graph: sparqlEscapeTermValue(insertGraph),
          currentObject:
            currentQuad.object.value ??
            sparqlEscapeTermValue(currentQuad.object),
          incomingObject:
            incomingTriple.object.value ??
            sparqlEscapeTermValue(incomingTriple.object),
        };
        const subjectPredicate = `${escaped.subject} ${escaped.predicate}`;
        const updateObjectValueQuery = `
          DELETE {
            GRAPH ${escaped.graph} {
              ${subjectPredicate} ${escaped.currentObject}
            }
          } INSERT {
            GRAPH ${escaped.graph} {
              ${subjectPredicate} ${escaped.incomingObject} .
            }
          } WHERE {
             GRAPH ${escaped.graph} {
              ${escaped.subject} ${escaped.predicate} ${escaped.currentObject} .
             } 
             MINUS {
              GRAPH ${sparqlEscapeTermValue(TERM_STAGING_GRAPH)} {
                ${subjectPredicate} ${escaped.currentObject}
              }
            }
          }
        `;

        try {
          await updateSudo(updateObjectValueQuery, {}, { mayRetry: true });
          console.log(
            `|> Updated value for predicate (${incomingTriple.predicate.value}) to ${incomingTriple.object.value}.`,
          );
        } catch (error) {
          console.log(`|> Could not update mandataris predicate value: ${subjectPredicate}`);
          continue;
        }
      }
    } else {
      // NOTE: mandatarissen are not validated if they contain all the required fields, this will possibly break the application
      const escaped = {
        subject: sparqlEscapeTermValue(incomingTriple.subject),
        predicate: sparqlEscapeTermValue(incomingTriple.predicate),
        incomingObject: sparqlEscapeTermValue(incomingTriple.object),
        graph: sparqlEscapeTermValue(insertGraph),
      };
      const insertIncomingQuery = `
        INSERT DATA {
          GRAPH ${escaped.graph} {
            ${escaped.subject} ${escaped.predicate} ${escaped.incomingObject} .
          }
        }
      `;
      try {
        await updateSudo(insertIncomingQuery, {}, { mayRetry: true });
        console.log(`|> Inserted triple: ${JSON.stringify(incomingTriple)}`);
      } catch (error) {
        throw Error(
          `Could not insert incoming triple: ${JSON.stringify(incomingTriple)}`,
        );
      }
    }
  }
}

export async function getMandateOfMandataris(
  mandataris: Term,
): Promise<Term | null> {
  const queryForMandatarisMandate = `
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT ?mandaat
    WHERE {
        ${sparqlEscapeTermValue(mandataris)} org:holds ?mandaat .
    }
  `;
  const mandateResult = await querySudo(queryForMandatarisMandate);
  const mandaatQuad = findFirstSparqlResult(mandateResult);

  return mandaatQuad?.mandaat ?? null;
}

export async function findOverlappingMandataris(
  persoon: Term,
  mandaat: Term,
): Promise<Term | null> {
  const queryMandataris = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX org: <http://www.w3.org/ns/org#>

  SELECT DISTINCT ?mandataris
  WHERE {
    VALUES ?status {
      ${sparqlEscapeUri(MANDATARIS_STATUS.EFFECTIEF)}
      ${sparqlEscapeUri(PUBLICATION_STATUS.DRAFT)}
    }
    ?mandataris a ${sparqlEscapeTermValue(TERM_MANDATARIS_TYPE)} ;
      mandaat:status ?status; 
      mandaat:isBestuurlijkeAliasVan ${sparqlEscapeTermValue(persoon)} ;
      org:holds ${sparqlEscapeTermValue(mandaat)} .
  }
  `;

  const mandatarisResult = await querySudo(queryMandataris);

  return findFirstSparqlResult(mandatarisResult)?.mandataris ?? null;
}

export async function findNameOfPersoonFromStaging(
  mandataris: Term,
): Promise<TermProperty | null> {
  const mandatarisUri = sparqlEscapeTermValue(mandataris);
  const queryMandatarisPerson = `
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX persoon: <https://data.vlaanderen.be/ns/persoon#>

    SELECT ?persoonUri ?firstname ?lastname
    WHERE {
      GRAPH ${sparqlEscapeTermValue(TERM_STAGING_GRAPH)} {
        ${mandatarisUri} a ${sparqlEscapeTermValue(TERM_MANDATARIS_TYPE)} .
                      
        ${mandatarisUri} persoon:isBestuurlijkeAliasVan ?persoonUri .
        ${mandatarisUri} persoon:gebruikteVoornaam ?firstname .
        ${mandatarisUri} foaf:familyName ?lastname .
      }
    }
  `;
  const result = await querySudo(queryMandatarisPerson);

  return findFirstSparqlResult(result);
}
