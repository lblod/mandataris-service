import { querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import { Quad } from '../util/types';

const STAGING_GRAPH = 'http://mu.semte.ch/graphs/besluiten-consumed';

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

  if (subjectsOfType.results.bindings.length === 0) {
    return [];
  }

  return subjectsOfType.results.bindings.map(
    (binding: Quad) => binding.subject.value,
  );
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

  return resultsInTarget.results.bindings;
}
