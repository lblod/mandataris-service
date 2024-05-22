import { querySudo } from '@lblod/mu-auth-sudo';
import {
  query,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';

export const findGraphAndMandate = async (
  dateFrom: string,
  mandateName: string,
) => {
  const mandate = await findMandateByName(mandateName, dateFrom);

  if (!mandate) {
    return { mandate: null, graph: null };
  }

  const q = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

  SELECT ?g ?mandate WHERE {
    GRAPH ?g {
      ?mandate a mandaat:Mandaat .
      VALUES ?mandate {
        ${sparqlEscapeUri(mandate)}
      }
    }
  } LIMIT 1`;
  const result = await querySudo(q);
  if (!result.results.bindings.length) {
    return { mandate: null, graph: null };
  }

  return {
    graph: result.results.bindings[0].g.value,
    mandate: result.results.bindings[0].mandate.value,
  };
};

const findMandateByName = async (name: string, dateFrom: string) => {
  const q = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX org: <http://www.w3.org/ns/org#>

  SELECT ?mandate WHERE {
    ?mandate a mandaat:Mandaat ;
    ^org:hasPost ?orgaanInTijd ;
        org:role / skos:prefLabel ${sparqlEscapeString(name)} .
    ?orgaanInTijd mandaat:bindingStart ?start .
    OPTIONAL {
      ?orgaanInTijd mandaat:bindingEinde ?end .
    }
    FILTER (?start <= ${sparqlEscapeDateTime(dateFrom)})
    FILTER (!BOUND(?end) || ?end >= ${sparqlEscapeDateTime(dateFrom)})
  } ORDER BY ?start LIMIT 1`;
  const result = await query(q);
  if (!result.results.bindings.length) {
    return null;
  }
  return result.results.bindings[0].mandate.value;
};
