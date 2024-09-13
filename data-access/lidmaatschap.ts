import { v4 as uuidv4 } from 'uuid';
import { sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { updateSudo } from '@lblod/mu-auth-sudo';

export async function fixLidmaatschapTijdsinterval(
  mandatarisUri: string,
  graph: string,
) {
  const id = uuidv4();
  const intervalUri = `http://data.lblod.info/id/tijdsintervallen//${id}`;
  const safeMandatarisUri = sparqlEscapeUri(mandatarisUri);
  const safeGraph = sparqlEscapeUri(graph);
  const safeIntervalUri = sparqlEscapeUri(intervalUri);

  const query = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX generiek: <http://data.vlaanderen.be/ns/generiek#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

    DELETE {
      GRAPH ${safeGraph} {
        ?membership org:memberDuring ?interval.
        ?interval ?p ?o.
      }
    }
    INSERT {
      GRAPH ${safeGraph} {
        ?membership org:memberDuring ${safeIntervalUri}.
        ${safeIntervalUri} a dct:PeriodOfTime ;
          mu:uuid ${sparqlEscapeString(id)} ;
          generiek:begin ?start ;
          generiek:einde ?end .
      }
    }
    WHERE {
      GRAPH ${safeGraph} {
        ${safeMandatarisUri} org:hasMembership ?membership ;
          mandaat:start ?start .
        OPTIONAL {
          ${safeMandatarisUri} mandaat:einde ?end .
        }
        OPTIONAL {
          ?membership org:memberDuring ?interval.
          ?interval ?p ?o.
        }
      }
    }`;
  await updateSudo(query);
}
