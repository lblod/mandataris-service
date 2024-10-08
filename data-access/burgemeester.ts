import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import {
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
} from '../util/mu';
import { v4 as uuidv4 } from 'uuid';
import { HttpError } from '../util/http-error';
import { storeFile } from './file';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
} from '../util/sparql-result';
import { Term } from '../types';
import { sparqlEscapeTermValue } from '../util/sparql-escape';
import {
  copyFromPreviousMandataris,
  endExistingMandataris,
} from './mandataris';

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
      FILTER NOT EXISTS {
        ?orgGraph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
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
    orgGraph: result.orgGraph,
    burgemeesterMandaat: result.burgemeesterMandaat,
    aangewezenBurgemeesterMandaat: result.aangewezenBurgemeesterMandaat,
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
  date: Date,
  benoeming: string,
  existingMandataris: Term | undefined,
) => {
  if (!existingMandataris) {
    throw new HttpError(
      `No existing mandataris found for burgemeester(${burgemeesterUri})`,
      400,
    );
  }

  await endExistingMandataris(orgGraph, existingMandataris, date, benoeming);

  // TODO: check use case if mandataris is waarnemend -> should something happen to the verhindering?

  const mandatarisUri = sparqlEscapeTermValue(existingMandataris);
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
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX org: <http://www.w3.org/ns/org#>

    INSERT DATA {
      GRAPH ${sparqlEscapeTermValue(orgGraph)} {
        ${sparqlEscapeUri(newMandatarisUri)} a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(uuid)} ;
          org:holds ${sparqlEscapeTermValue(burgemeesterMandaat)} ;
          mandaat:isBestuurlijkeAliasVan ${sparqlEscapeUri(burgemeesterUri)} ;
          mandaat:start ${sparqlEscapeDateTime(date)} ;
          mandaat:status <http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75> ;
          lmb:hasPublicationStatus mps:9d8fd14d-95d0-4f5e-b3a5-a56a126227b6 .
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
  existingMandataris: Term | undefined | null,
) => {
  let newMandatarisUri;
  if (existingMandataris) {
    // we can copy over the existing values for the new burgemeester from the previous mandataris
    newMandatarisUri = await copyFromPreviousMandataris(
      orgGraph,
      existingMandataris,
      date,
      burgemeesterMandaat,
    );

    await endExistingMandataris(orgGraph, existingMandataris, date, benoeming);
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
