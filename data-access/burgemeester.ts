import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import {
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
} from '../util/mu';
import { v4 as uuidv4 } from 'uuid';
import { HttpError } from '../util/http-error';
import { storeFile } from './file';
import { findFirstSparqlResult } from '../util/sparql-result';
import { Term } from '../types';
import { sparqlEscapeTermValue } from '../util/sparql-escape';
import { copyFromPreviousMandataris } from './mandataris';

export const findBurgemeesterMandaat = async (
  bestuurseenheidUri: string,
  date: Date,
) => {
  const sparql = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

    SELECT DISTINCT ?orgGraph ?mandaatUri WHERE {
      ?bestuurseenheid a besluit:Bestuurseenheid ;
        ^besluit:bestuurt ?bestuursOrgaan .
      VALUES ?bestuurseenheid { ${sparqlEscapeUri(bestuurseenheidUri)} }
      GRAPH ?orgGraph {
        ?bestuursOrgaan besluit:classificatie ?classificatie .
        VALUES ?classificatie {
          # districtsburgemeester
          <http://lblod.data.gift/concept-schemes/0887b850-b810-40d4-be0f-cafd01d3259b>
          # burgemeester
          <http://data.vlaanderen.be/id/concept/BestuursorgaanClassificatieCode/4955bd72cd0e4eb895fdbfab08da0284>
        }
      }
      FILTER NOT EXISTS {
        ?orgGraph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
      ?bestuursOrgaanIt mandaat:isTijdspecialisatieVan ?bestuursOrgaan .
      ?bestuursOrgaanIt mandaat:bindingStart ?start .
      OPTIONAL { ?bestuursOrgaanIt mandaat:bindingEinde ?einde }
      ?bestuursOrgaanIt org:hasPost ?mandaatUri .
      ?mandaatUri <http://www.w3.org/ns/org#role> ?code.
      VALUES ?code {
        # TODO there is also the 'aangewezen burgemeester' mandate. I believe this should be a status.
        # if not we probably need to use only that one, but what happens to districtsburgemeesters then?
        # so many questions
        # burgemeester
        <http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000013>
        # districtsburgemeester
        <http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e00001d>
      }
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
    orgGraph: result.orgGraph,
    mandaatUri: result.mandaatUri,
  };
};

export const createBurgemeesterBenoeming = async (
  bestuurseenheidUri: string,
  burgemeesterUri: string,
  status: string,
  date: Date,
  file,
  orgGraph: Term,
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
      GRAPH ${sparqlEscapeTermValue(orgGraph)} {
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

export const markCurrentBurgemeesterAsRejected = async (
  orgGraph: Term,
  burgemeesterUri: string,
  burgemeesterMandaat: Term,
  benoeming: string,
) => {
  const result = await querySudo(`
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT ?mandataris WHERE {
      ?mandataris a mandaat:Mandataris ;
        org:holds ${sparqlEscapeTermValue(burgemeesterMandaat)} ;
        mandaat:isBestuurlijkeAliasVan ${sparqlEscapeUri(burgemeesterUri)} ;
        mandaat:start ?start .

    } ORDER BY DESC(?start) LIMIT 1
  `);

  if (!result.results.bindings.length) {
    throw new HttpError(
      `No existing mandataris found for burgemeester(${burgemeesterUri})`,
      400,
    );
  }
  const mandataris = result.results.bindings[0].mandataris.value;
  const mandatarisUri = sparqlEscapeUri(mandataris);
  const benoemingUri = sparqlEscapeUri(benoeming);

  const sparql = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT DATA {
      GRAPH ${sparqlEscapeTermValue(orgGraph)} {
        ${benoemingUri} ext:rejects ${mandatarisUri} .
      }
    }`;
  await updateSudo(sparql);
};

export const createBurgemeesterFromScratch = async (
  orgGraph: Term,
  burgemeesterUri: string,
  burgemeesterMandaat: Term,
  date: Date,
  benoeming: string,
) => {
  const uuid = uuidv4();
  const newMandatarisUri = `http://mu.semte.ch/vocabularies/ext/mandatarissen/${uuid}`;
  const formattedNewMandatarisUri = sparqlEscapeUri(newMandatarisUri);
  const benoemingUri = sparqlEscapeUri(benoeming);
  await updateSudo(`
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX mps: <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/>
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX org: <http://www.w3.org/ns/org#>

    INSERT DATA {
      GRAPH ${sparqlEscapeTermValue(orgGraph)} {
        ${sparqlEscapeUri(newMandatarisUri)} a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(uuid)} ;
          org:holds ${sparqlEscapeTermValue(burgemeesterMandaat)} ;
          mandaat:isBestuurlijkeAliasVan ${sparqlEscapeUri(burgemeesterUri)} ;
          mandaat:start ${sparqlEscapeDateTime(date)} ;
          mandaat:status <http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75> ;
          extlmb:hasPublicationStatus mps:9d8fd14d-95d0-4f5e-b3a5-a56a126227b6 .
        ${benoemingUri} ext:approves ${formattedNewMandatarisUri} .
      }
    }`);
  return newMandatarisUri;
};

export const benoemBurgemeester = async (
  orgGraph: Term,
  burgemeesterUri: string,
  burgemeesterMandaat: Term,
  date: Date,
  benoeming: string,
  existingMandataris: string | undefined,
  existingPersoon: string | undefined,
) => {
  let newMandatarisUri;
  if (existingPersoon === burgemeesterUri && existingMandataris) {
    // we can copy over the existing values for the new burgemeester from the previous mandataris
    newMandatarisUri = await copyFromPreviousMandataris(
      orgGraph,
      existingMandataris,
      date,
    );
  } else {
    // we need to create a new mandataris from scratch
    newMandatarisUri = await createBurgemeesterFromScratch(
      orgGraph,
      burgemeesterUri,
      burgemeesterMandaat,
      date,
      benoeming,
    );
  }
  const benoemingUri = sparqlEscapeUri(benoeming);
  await updateSudo(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT DATA {
      GRAPH ${sparqlEscapeTermValue(orgGraph)} {
        ${benoemingUri} ext:approves ${sparqlEscapeUri(newMandatarisUri)} .
      }
    }`);
};
