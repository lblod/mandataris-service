import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';
import { v4 as uuidv4 } from 'uuid';

import {
  copyFromPreviousMandataris,
  endExistingMandataris,
} from './mandataris';
import { storeFile } from './file';
import { HttpError } from '../util/http-error';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
} from '../util/sparql-result';
import {
  CLASSIFICATIE_CODE,
  FUNCTIE_CODE,
  MANDATARIS_STATUS,
} from '../util/constants';

export async function isBestuurseenheidDistrict(
  bestuurseenheidUri: string,
): Promise<boolean> {
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

    ASK {
      GRAPH ?g {
        ${sparqlEscapeUri(bestuurseenheidUri)} a besluit:Bestuurseenheid ;
          besluit:classificatie ${sparqlEscapeUri(CLASSIFICATIE_CODE.DISTRICT)}.
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
  const e = {
    burgemeesterF: sparqlEscapeUri(FUNCTIE_CODE.BURGEMEESTER),
    burgemeesterC: sparqlEscapeUri(CLASSIFICATIE_CODE.BURGEMEESTER),
    aangewezenBurgemeesterF: sparqlEscapeUri(
      FUNCTIE_CODE.AANGEWEZEN_BURGEMEESTER,
    ),
  };
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
        ?bestuursOrgaan besluit:classificatie ${e.burgemeesterC} .
      }
      ?orgGraph ext:ownedBy ?owningEenheid.
      ?bestuursOrgaanIt mandaat:isTijdspecialisatieVan ?bestuursOrgaan .
      ?bestuursOrgaanIt mandaat:bindingStart ?start .
      OPTIONAL { ?bestuursOrgaanIt mandaat:bindingEinde ?einde }
      ?bestuursOrgaanIt org:hasPost ?burgemeesterMandaat .
      ?bestuursOrgaanIt org:hasPost ?aangewezenBurgemeesterMandaat .
      ?burgemeesterMandaat org:role ${e.burgemeesterF} .
      ?aangewezenBurgemeesterMandaat org:role ${e.aangewezenBurgemeesterF}.
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

export const markCurrentBurgemeesterAsRejected = async (
  orgGraph: string,
  burgemeesterUri: string,
  date: Date,
  benoeming: string,
  existingMandatarisUri: string | undefined,
) => {
  if (!existingMandatarisUri) {
    throw new HttpError(
      `No existing mandataris found for burgemeester(${burgemeesterUri})`,
      400,
    );
  }

  await endExistingMandataris(orgGraph, existingMandatarisUri, date, benoeming);

  // TODO: check use case if mandataris is waarnemend -> should something happen to the verhindering?

  const mandatarisUri = sparqlEscapeUri(existingMandatarisUri);
  const benoemingUri = sparqlEscapeUri(benoeming);

  const sparql = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${benoemingUri} ext:rejects ${mandatarisUri} .
      }
    }`;
  await updateSudo(sparql);
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
          mandaat:status ${sparqlEscapeUri(MANDATARIS_STATUS.EFFECTIEF)} ;
          lmb:hasPublicationStatus mps:9d8fd14d-95d0-4f5e-b3a5-a56a126227b6 .
        ${escapedBenoemingUri} ext:approves ${formattedNewMandatarisUri} .
      }
    }`);
  return newMandatarisUri;
};

export const benoemBurgemeester = async (
  orgGraph: string,
  burgemeesterUri: string,
  burgemeesterMandaatUri: string,
  date: Date,
  benoemingUri: string,
  existingMandataris: string | undefined | null,
) => {
  let newMandatarisUri;
  if (existingMandataris) {
    // we can copy over the existing values for the new burgemeester from the previous mandataris
    newMandatarisUri = await copyFromPreviousMandataris(
      orgGraph,
      existingMandataris,
      date,
      burgemeesterMandaatUri,
    );

    await endExistingMandataris(
      orgGraph,
      existingMandataris,
      date,
      benoemingUri,
    );
  } else {
    // we need to create a new mandataris from scratch
    newMandatarisUri = await createBurgemeesterFromScratch(
      orgGraph,
      burgemeesterUri,
      burgemeesterMandaatUri,
      date,
      benoemingUri,
    );
  }
  const benoeming = sparqlEscapeUri(benoemingUri);
  await updateSudo(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${benoeming} ext:approves ${sparqlEscapeUri(newMandatarisUri)} .
      }
    }`);
};
