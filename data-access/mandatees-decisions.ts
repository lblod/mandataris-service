import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import { Quad, Term, TermProperty } from '../types';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
  getSparqlResults,
} from '../util/sparql-result';
import { TERM_TYPE, sparqlEscapeTermValue } from '../util/sparql-escape';
import { MANDATARIS_STATUS } from '../util/constants';

const STAGING_GRAPH = 'http://mu.semte.ch/graphs/besluiten-consumed';
export const TERM_MANDATARIS_TYPE = {
  type: TERM_TYPE.URI,
  value: 'http://data.vlaanderen.be/ns/mandaat#Mandataris',
} as Term;

export async function getSubjectsOfType(
  rdfType: Term,
  triples: Array<Quad>,
): Promise<Term[]> {
  const uniqueSubjects = Array.from(
    new Set(triples.map((quad: Quad) => sparqlEscapeUri(quad.subject.value))),
  );
  const queryForType = `
    SELECT ?subject 
      WHERE {
        GRAPH ${sparqlEscapeUri(STAGING_GRAPH)} {
          VALUES ?subject {
            ${uniqueSubjects.join('\n')}
          }
          ?subject a ${sparqlEscapeTermValue(rdfType)}.
      }
    }
  `;

  const subjectsOfType = await querySudo(queryForType);
  const results = getSparqlResults(subjectsOfType);
  if (results.length === 0) {
    return [];
  }

  return results.map((binding: TermProperty) => binding.subject);
}

export async function getValuesForSubjectPredicateInTarget(
  quads: Array<Quad>,
): Promise<Array<Quad>> {
  const useAsValues = quads.map((quad: Quad) => {
    return `(${sparqlEscapeTermValue(quad.subject)} ${sparqlEscapeTermValue(
      quad.predicate,
    )}) \n`;
  });
  const query = `
    SELECT ?subject ?predicate ?object ?graph
    WHERE {
      GRAPH ?graph {  
        VALUES (?subject ?predicate) {
            ${useAsValues.join('')}
        }
        ?subject ?predicate ?object .
        MINUS {
          GRAPH ${sparqlEscapeUri(STAGING_GRAPH)} {
            ?subject ?predicate ?object .
          }
        }
      }
    }
  `;
  const resultsInTarget = await querySudo(query);

  return getSparqlResults(resultsInTarget) as Array<Quad>;
}

export async function isMandatarisInTarget(subject: Term) {
  const mandatarisType = sparqlEscapeTermValue(TERM_MANDATARIS_TYPE);
  const askIfMandataris = `
    ASK {
      ${sparqlEscapeTermValue(subject)} a ${mandatarisType} .
      MINUS {
        GRAPH ${sparqlEscapeUri(STAGING_GRAPH)} {
          ${sparqlEscapeTermValue(subject)} a ${mandatarisType} .
        }
      }
    }
  `;
  const result = await querySudo(askIfMandataris);

  return getBooleanSparqlResult(result);
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
  incomingQuads: Array<Quad>,
): Promise<void> {
  for (const incomingQuad of incomingQuads) {
    const currentQuad = currentQuads.find(
      (quad: Quad) =>
        quad.subject.value == incomingQuad.subject.value &&
        quad.predicate.value == incomingQuad.predicate.value,
    );
    if (currentQuad) {
      if (incomingQuad.object.value !== currentQuad.object.value) {
        console.log(
          `|> Value for predicate (${incomingQuad.predicate.value}) differ. Current: ${currentQuad.object.value} incoming: ${incomingQuad.object.value}. Updating value.`,
        );
        const escaped = {
          subject: sparqlEscapeTermValue(currentQuad.subject),
          predicate: sparqlEscapeTermValue(currentQuad.predicate),
          graph: sparqlEscapeTermValue(currentQuad.graph),
          currentObject:
            currentQuad.object.value ??
            sparqlEscapeTermValue(currentQuad.object),
          incomingObject:
            incomingQuad.object.value ??
            sparqlEscapeTermValue(incomingQuad.object),
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
              GRAPH ${sparqlEscapeUri(STAGING_GRAPH)} {
                ${subjectPredicate} ${escaped.currentObject}
              }
            }
          }
        `;

        try {
          await updateSudo(updateObjectValueQuery, {}, { mayRetry: true });
          console.log(
            `|> Updated value for predicate (${incomingQuad.predicate.value}) to ${incomingQuad.object.value}.`,
          );
        } catch (error) {
          throw Error(
            `Could not update mandataris predicate value: ${subjectPredicate}`,
          );
        }
      }
    } else {
      const escaped = {
        subject: sparqlEscapeTermValue(incomingQuad.subject),
        predicate: sparqlEscapeTermValue(incomingQuad.predicate),
        incomingObject: sparqlEscapeTermValue(incomingQuad.object),
        graph: sparqlEscapeTermValue(incomingQuad.graph),
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
        console.log(`|> Inserted triple: ${JSON.stringify(incomingQuad)}`);
      } catch (error) {
        throw Error(
          `Could not insert incoming triple: ${JSON.stringify(incomingQuad)}`,
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
      ${sparqlEscapeUri(MANDATARIS_STATUS.DRAFT)}
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

export async function insertQuadsInGraph(
  quads: Array<Quad>,
  graph: Term,
): Promise<void> {
  if (quads.length === 0) {
    return;
  }

  const insertTriples = quads.map((quad: Quad) => {
    const subject = sparqlEscapeTermValue(quad.subject);
    const predicate = sparqlEscapeTermValue(quad.predicate);
    const object = sparqlEscapeTermValue(quad.object);

    return `${subject} ${predicate} ${object} .`;
  });

  const insertQuery = `
    INSERT DATA {
      GRAPH ${sparqlEscapeTermValue(graph)} {
        ${insertTriples.join('\n')}
      }
    }
  `;

  try {
    await updateSudo(insertQuery, {}, { mayRetry: true });
    console.log(
      `|> Inserted new mandataris quads (${quads.length}) in graph (${graph.value}).`,
    );
  } catch (error) {
    throw Error(
      `Could not insert ${quads.length} quads in graph (${graph.value}).`,
    );
  }
}
