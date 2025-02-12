import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';
import { v4 as uuidv4 } from 'uuid';
import { HttpError } from '../util/http-error';
import { storeFile } from './file';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
  getSparqlResults,
} from '../util/sparql-result';
import { BENOEMING_STATUS, PUBLICATION_STATUS } from '../util/constants';
import { createNotification } from '../util/create-notification';

export async function isBestuurseenheidDistrict(
  bestuurseenheidUri: string,
): Promise<boolean> {
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

    ASK {
      GRAPH ?g {
        ${sparqlEscapeUri(bestuurseenheidUri)} a besluit:Bestuurseenheid ;
          besluit:classificatie ?classificatie.
        VALUES ?classificatie {
          <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000003>
        }
      }
    }
  `;
  const result = await querySudo(q);

  return getBooleanSparqlResult(result);
}

export const findBurgemeesterMandates = async (
  bestuurseenheidUri: string,
  date: Date,
) => {
  const sparql = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT ?orgGraph ?burgemeesterMandaat ?aangewezenBurgemeesterMandaat WHERE {
      ?bestuurseenheid a besluit:Bestuurseenheid ;
        ^besluit:bestuurt ?bestuursOrgaan .
      VALUES ?bestuurseenheid { ${sparqlEscapeUri(bestuurseenheidUri)} }
      GRAPH ?orgGraph {
        ?bestuursOrgaan besluit:classificatie ?classificatie .
        VALUES ?classificatie {
          # bestuursorgaan burgemeester
          <http://data.vlaanderen.be/id/concept/BestuursorgaanClassificatieCode/4955bd72cd0e4eb895fdbfab08da0284>
        }
      }
      ?orgGraph ext:ownedBy ?owningEenheid.
      ?bestuursOrgaanIt mandaat:isTijdspecialisatieVan ?bestuursOrgaan .
      ?bestuursOrgaanIt mandaat:bindingStart ?start .
      OPTIONAL { ?bestuursOrgaanIt mandaat:bindingEinde ?einde }
      ?bestuursOrgaanIt org:hasPost ?burgemeesterMandaat .
      ?bestuursOrgaanIt org:hasPost ?aangewezenBurgemeesterMandaat .
      ?burgemeesterMandaat org:role <http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000013> .
      ?aangewezenBurgemeesterMandaat org:role <http://data.vlaanderen.be/id/concept/BestuursfunctieCode/7b038cc40bba10bec833ecfe6f15bc7a>.
      FILTER(
        ?start <= ${sparqlEscapeDateTime(date)} &&
        (!BOUND(?einde) || ?einde > ${sparqlEscapeDateTime(date)})
      )
    }  ORDER BY DESC(?start) LIMIT 1 `;
  const queryResult = await querySudo(sparql);
  const result = findFirstSparqlResult(queryResult);
  if (!result) {
    throw new HttpError(
      `No burgemeester mandaat found for bestuurseenheid (${bestuurseenheidUri})`,
      400,
    );
  }
  return {
    orgGraph: result.orgGraph.value,
    burgemeesterMandaatUri: result.burgemeesterMandaat.value,
    aangewezenBurgemeesterMandaatUri:
      result.aangewezenBurgemeesterMandaat.value,
  };
};

export const createBurgemeesterBenoeming = async (
  bestuurseenheidUri: string,
  burgemeesterUri: string,
  status: string,
  date: Date,
  file,
  orgGraph: string,
) => {
  const fileUri = await storeFile(file, orgGraph);
  const uuid = uuidv4();
  const benoemingUri = `http://mu.semte.ch/vocabularies/ext/burgemeester-benoemingen/${uuid}`;
  await updateSudo(`
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${sparqlEscapeUri(benoemingUri)} a ext:BurgemeesterBenoeming ;
          mu:uuid ${sparqlEscapeString(uuid)} ;
          ext:status ${sparqlEscapeString(status)} ;
          ext:datum ${sparqlEscapeDateTime(date)} ;
          ext:bestuurseenheid ${sparqlEscapeUri(bestuurseenheidUri)} ;
          ext:burgemeester ${sparqlEscapeUri(burgemeesterUri)} ;
          ext:file ${sparqlEscapeUri(fileUri)} .
      }
    }`);

  return benoemingUri;
};

export const createBurgemeesterFromScratch = async (
  orgGraph: string,
  burgemeesterUri: string,
  burgemeesterMandaatUri: string,
  date: Date,
  benoemingUri: string,
) => {
  const uuid = uuidv4();
  const newMandatarisUri = `http://mu.semte.ch/vocabularies/ext/mandatarissen/${uuid}`;
  const formattedNewMandatarisUri = sparqlEscapeUri(newMandatarisUri);
  const escapedBenoemingUri = sparqlEscapeUri(benoemingUri);
  await updateSudo(`
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX mps: <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX org: <http://www.w3.org/ns/org#>

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${sparqlEscapeUri(newMandatarisUri)} a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(uuid)} ;
          org:holds ${sparqlEscapeUri(burgemeesterMandaatUri)} ;
          mandaat:isBestuurlijkeAliasVan ${sparqlEscapeUri(burgemeesterUri)} ;
          mandaat:start ${sparqlEscapeDateTime(date)} ;
          mandaat:status <http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75> ;
          lmb:hasPublicationStatus mps:9d8fd14d-95d0-4f5e-b3a5-a56a126227b6 .
        ${escapedBenoemingUri} ext:approves ${formattedNewMandatarisUri} .
      }
    }`);
  return newMandatarisUri;
};

export const addBenoemingTriple = async (
  orgGraph: string,
  mandatarisUri: string,
  benoemingUri: string,
  action: BENOEMING_STATUS,
) => {
  const escaped = {
    graph: sparqlEscapeUri(orgGraph),
    benoeming: sparqlEscapeUri(benoemingUri),
    mandataris: sparqlEscapeUri(mandatarisUri),
  };
  let triple = '';
  if (action == BENOEMING_STATUS.BENOEMD) {
    triple = `${escaped.benoeming} ext:approves ${escaped.mandataris} .`;
  } else if (action == BENOEMING_STATUS.AFGEWEZEN) {
    triple = `${escaped.benoeming} ext:rejects ${escaped.mandataris} .`;
  }

  await updateSudo(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT DATA {
      GRAPH ${escaped.graph} {
        ${triple}
      }
    }`);
};

export const getPersoonMandaatMandatarissen = async (
  graph: string,
  persoonUri: string,
  mandaatUri: string,
  date: Date,
) => {
  const escaped = {
    graph: sparqlEscapeUri(graph),
    persoonUri: sparqlEscapeUri(persoonUri),
    mandaatUri: sparqlEscapeUri(mandaatUri),
    date: sparqlEscapeDateTime(date),
  };
  const selectQuery = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    SELECT DISTINCT ?mandataris WHERE {
      GRAPH ${escaped.graph} {
        ?mandataris a mandaat:Mandataris ;
          org:holds ?mandaat ;
          mandaat:isBestuurlijkeAliasVan ?persoon ;
          mandaat:start ?start .
        OPTIONAL {
          ?mandataris mandaat:einde ?einde .
        }
        BIND(IF(BOUND(?einde), ?einde, "3000-01-01"^^xsd:dateTime) AS ?safeEinde)
        FILTER(?start <= ${escaped.date} && ?safeEinde > ${escaped.date})
      }
      VALUES ?persoon { ${escaped.persoonUri} }
      VALUES ?mandaat { ${escaped.mandaatUri} }
    }
  `;
  const result = await querySudo(selectQuery);
  return getSparqlResults(result).map((b) => b.mandataris?.value);
};

export const otherPersonHasMandate = async (
  graph: string,
  persoonUri: string,
  mandaatUri: string,
  date: Date,
) => {
  const escaped = {
    graph: sparqlEscapeUri(graph),
    persoonUri: sparqlEscapeUri(persoonUri),
    mandaatUri: sparqlEscapeUri(mandaatUri),
    date: sparqlEscapeDateTime(date),
  };
  const selectQuery = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    SELECT DISTINCT ?mandataris WHERE {
      GRAPH ${escaped.graph} {
        ?mandataris a mandaat:Mandataris ;
          org:holds ?mandaat ;
          mandaat:isBestuurlijkeAliasVan ?otherPersoon ;
          mandaat:start ?start .
        OPTIONAL {
          ?mandataris mandaat:einde ?einde .
        }
        BIND(IF(BOUND(?einde), ?einde, "3000-01-01"^^xsd:dateTime) AS ?safeEinde)
        FILTER (?persoon != ?otherPersoon)
        FILTER(?start <= ${escaped.date} && ?safeEinde > ${escaped.date})
      }
      VALUES ?persoon { ${escaped.persoonUri} }
      VALUES ?mandaat { ${escaped.mandaatUri} }
    }
  `;
  const result = await querySudo(selectQuery);
  return findFirstSparqlResult(result)?.mandataris?.value;
};

export const setPublicationStatusWithDate = async (
  graph: string,
  mandataris: string,
  date: Date,
  status: PUBLICATION_STATUS,
) => {
  const escaped = {
    graph: sparqlEscapeUri(graph),
    mandataris: sparqlEscapeUri(mandataris),
    date: sparqlEscapeDateTime(date),
    status: sparqlEscapeUri(status),
  };
  const updateQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    DELETE {
      GRAPH ${escaped.graph} {
        ?mandataris lmb:hasPublicationStatus ?pStatus .
        ?mandataris mandaat:start ?start .
        ?mandataris dct:modified ?oldModified .
      }
    }
    INSERT {
      GRAPH ${escaped.graph} {
        ?mandataris lmb:hasPublicationStatus ${escaped.status} .
        ?mandataris mandaat:start ${escaped.date} .
        ?mandataris dct:modified ?now .
      }
    }
    WHERE {
      GRAPH ${escaped.graph} {
        ?mandataris a mandaat:Mandataris ;
          mandaat:start ?start .
        OPTIONAL {
          ?mandataris lmb:hasPublicationStatus ?pStatus .
        }
        OPTIONAL {
          ?mandataris dct:modified ?oldModified .
        }
        BIND(NOW() as ?now)
      }
      VALUES ?mandataris { ${escaped.mandataris} }
    }
`;
  await updateSudo(updateQuery);
};

export const createNotificationOtherPersonWithBurgemeesterMandaat = async (
  graph: string,
  mandatarisUri: string,
) => {
  await createNotification({
    title: 'Andere burgemeester gevonden die niet benoemd is',
    description:
      'Bij het benoemen van de burgemeester werd een andere persoon gevonden met het burgemeester mandaat. Gelieve dit na te kijken.',
    type: 'warning',
    graph: graph,
    links: [
      {
        type: 'mandataris',
        uri: mandatarisUri,
      },
    ],
  });
};

export const createNotificationMultipleAangesteldeBurgemeesters = async (
  graph: string,
  mandatarisUris: string[],
) => {
  await createNotification({
    title: 'Meerdere burgemeester werden benoemd',
    description:
      'De benoeming van de burgemeester werd succesvol verwerkt, deze persoon had echter meerdere burgemeester mandaten, dus zijn alle benoemd.',
    type: 'info',
    graph: graph,
    links: mandatarisUris.map((mandataris) => {
      return {
        type: 'mandataris',
        uri: mandataris,
      };
    }),
  });
};

export const createNotificationAangesteldeBurgemeester = async (
  graph: string,
  mandatarisUri: string,
) => {
  await createNotification({
    title: 'Burgemeester werd benoemd',
    description:
      'De benoeming van de burgemeester werd succesvol verwerkt, deze burgemeester is nu bekrachtigd.',
    type: 'info',
    graph: graph,
    links: [
      {
        type: 'mandataris',
        uri: mandatarisUri,
      },
    ],
  });
};

export const createNotificationAfgewezenBurgemeester = async (
  graph: string,
  mandatarisUri: string,
) => {
  await createNotification({
    title: 'Burgemeester werd afgewezen',
    description:
      'De burgemeester werd afgewezen, gelieve een nieuwe burgemeester aan te stellen en deze wijzigingen ook door the voeren in het OCMW.',
    type: 'info',
    graph: graph,
    links: [
      {
        type: 'mandataris',
        uri: mandatarisUri,
      },
    ],
  });
};
