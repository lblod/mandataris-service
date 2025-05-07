import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import { Term } from '../types';
import {
  getBooleanSparqlResult,
  getSparqlResults,
} from '../util/sparql-result';

export const BESLUIT_STAGING_GRAPH =
  process.env.BESLUIT_STAGING_GRAPH ||
  'http://mu.semte.ch/graphs/besluiten-consumed';

export const TERM_MANDATARIS_TYPE = {
  type: 'uri',
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

export async function getGraphsWhereInstanceExists(instanceUri) {
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT ?graph WHERE {
      GRAPH ?graph {
        ${sparqlEscapeUri(instanceUri)} a ?thing.
      }
      ?graph ext:ownedBy ?bestuurseenheid.
    }
  `;
  const result = await querySudo(query);

  return getSparqlResults(result).map((b) => b.graph.value);
}

export async function addBesluitToMandataris(
  mandatarisUri: string,
  besluitUri: string,
  link: string,
  graphs: Array<string>,
) {
  if (graphs.length === 0) {
    console.log(
      `|> No graphs found to insert mandataris: ${mandatarisUri} with besluit: ${besluitUri}`,
    );
    return;
  }

  const escaped = {
    mandataris: sparqlEscapeUri(mandatarisUri),
    link: sparqlEscapeUri(link),
    besluit: sparqlEscapeUri(besluitUri),
  };
  const insertString = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

    INSERT {
      GRAPH ?g {
        ${escaped.mandataris} ${escaped.link} ${escaped.besluit} .
      }
    } WHERE {
      VALUES ?g { ${graphs.map((g) => sparqlEscapeUri(g))} }
      GRAPH ?g {
        ${escaped.mandataris} a mandaat:Mandataris .
      }
      ?g ext:ownedBy ?bestuurseenheid . 
    }
  `;

  await updateSudo(insertString, graphs);
}
