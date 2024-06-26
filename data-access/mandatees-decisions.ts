import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import { Quad } from '../util/types';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
  getSparqlResults,
} from '../util/sparql-result';

const STAGING_GRAPH = 'http://mu.semte.ch/graphs/besluiten-consumed';
export const MANDATARIS_TYPE_URI =
  'http://data.vlaanderen.be/ns/mandaat#Mandataris';

export async function getSubjectsOfType(
  typeUri: string,
  triples: Array<Quad>,
): Promise<string[]> {
  const uniqueSubjects = Array.from(
    new Set(triples.map((t) => sparqlEscapeUri(t.subject.value))),
  );
  const queryForType = `
    SELECT ?subject 
      WHERE {
        GRAPH ${sparqlEscapeUri(STAGING_GRAPH)} {
          VALUES ?subject {
            ${uniqueSubjects.join('\n')}
          }
          ?subject a ${sparqlEscapeUri(typeUri)}.
      }
    }
  `;

  const subjectsOfType = await querySudo(queryForType);
  const results = getSparqlResults(subjectsOfType);
  if (results.length === 0) {
    return [];
  }

  return results.map((binding: Quad) => binding.subject.value);
}

export async function getValuesForSubjectPredicateInTarget(
  quads: Array<Quad>,
): Promise<Array<Quad>> {
  const useAsValues = quads.map((quad: Quad) => {
    return `(${sparqlEscapeUri(quad.subject.value)} ${sparqlEscapeUri(
      quad.predicate.value,
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

  return getSparqlResults(resultsInTarget);
}

export async function isMandatarisInTarget(subjectUri: string) {
  const escapedMandatarisUri = sparqlEscapeUri(MANDATARIS_TYPE_URI);
  const askIfMandataris = `
    ASK {
      ${sparqlEscapeUri(subjectUri)} a ${escapedMandatarisUri} .
      MINUS {
        GRAPH ${sparqlEscapeUri(STAGING_GRAPH)} {
          ${sparqlEscapeUri(subjectUri)} a ${escapedMandatarisUri} .
        }
      }
    }
  `;
  const result = await querySudo(askIfMandataris);

  return getBooleanSparqlResult(result);
}

export async function findPersoonForMandataris(
  subjectUri: string,
): Promise<null | string> {
  const escapedSubjectUri = sparqlEscapeUri(subjectUri);
  const queryForPersoon = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

    SELECT ?object
    WHERE {
      ${escapedSubjectUri} mandaat:isBestuurlijkeAliasVan ?object .
    }
  `;
  const persoonForMandataris = await querySudo(queryForPersoon);
  const persoon = findFirstSparqlResult(persoonForMandataris);
  if (!persoon) {
    return null;
  }

  return persoon.object.value;
}

export async function updateDifferencesOfMandataris(
  currentQuads: Array<Quad>,
  incomingQuads: Array<Quad>,
  toGraph: string,
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
          subject: sparqlEscapeUri(currentQuad.subject.value),
          predicate: sparqlEscapeUri(currentQuad.predicate.value),
          graph: sparqlEscapeUri(currentQuad.graph.value),
          currentObject:
            currentQuad.object.value ??
            sparqlEscapeUri(currentQuad.object.value),
          incomingObject:
            incomingQuad.object.value ??
            sparqlEscapeUri(incomingQuad.object.value),
        };
        const subjectPredicate = `${escaped.subject} ${escaped.predicate}`;
        const updateObjectValueQuery = `
          DELETE {
            GRAPH ?graph {
              ${subjectPredicate} ${escaped.currentObject}
            }
          } INSERT {
            GRAPH ${escaped.graph} {
              ${subjectPredicate} ${escaped.incomingObject} .
            }
          } WHERE {
             GRAPH ?graph {
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
        subject: sparqlEscapeUri(incomingQuad.subject.value),
        predicate: sparqlEscapeUri(incomingQuad.predicate.value),
        incomingObject: sparqlEscapeUri(incomingQuad.object.value),
        graph: sparqlEscapeUri(toGraph),
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

export async function findGraphOfType(typeUri: string): Promise<string> {
  const escapedTypeUri = sparqlEscapeUri(typeUri);
  const queryForGraph = `
    SELECT ?graph
    WHERE {
      GRAPH ?graph {
      ?subject a ${escapedTypeUri} .
      }
      MINUS {
        GRAPH ${sparqlEscapeUri(STAGING_GRAPH)} {
          ?subject a ${escapedTypeUri} .
        }
      }
    }  
  `;
  const graphQueryResult = await querySudo(queryForGraph);
  const graphResult = findFirstSparqlResult(graphQueryResult);
  if (!graphResult) {
    // Hard error as we do not want data to be inserted in an unknown graph
    throw Error(`Could not find graph for type: ${typeUri}`);
  }

  return graphResult.graph.value;
}

export async function getMandateOfMandataris(
  mandatarisUri: string,
): Promise<string> {
  const queryForMandatarisMandate = `
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT ?object
    WHERE {
      ?subject a ${sparqlEscapeUri(MANDATARIS_TYPE_URI)} .
      ?subject org:holds ?object .
      MINUS {
        GRAPH ${sparqlEscapeUri(STAGING_GRAPH)} {
          ?subject a ${sparqlEscapeUri(MANDATARIS_TYPE_URI)} .
        }
      }
    }
  `;
  const mandateResult = await querySudo(queryForMandatarisMandate);
  const mandaatQuad = findFirstSparqlResult(mandateResult);
  if (!mandaatQuad) {
    throw Error(`No mandaat found for mandataris uri ${mandatarisUri}`);
  }

  return mandaatQuad.object.value;
}

export async function hasOverlappingMandaat(
  persoonUri: string,
  mandaatUri: string,
): Promise<boolean> {
  const askQuery = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX org: <http://www.w3.org/ns/org#>

  ASK {
    ?mandataris a ${sparqlEscapeUri(MANDATARIS_TYPE_URI)} ;
      mandaat:isBestuurlijkeAliasVan ${sparqlEscapeUri(persoonUri)} ;
      org:holds ${sparqlEscapeUri(mandaatUri)} .
  }
  `;

  const isOverlappingResult = await querySudo(askQuery);

  return getBooleanSparqlResult(isOverlappingResult);
}
