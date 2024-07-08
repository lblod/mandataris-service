import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import {
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
} from '../util/mu';
import { v4 as uuidv4 } from 'uuid';
import { HttpError } from '../util/http-error';

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
  const result = await querySudo(sparql);
  if (result.results.bindings.length === 0) {
    throw new HttpError(
      `No burgemeester mandaat found for bestuurseenheid (${bestuurseenheidUri})`,
      400,
    );
  }
  return {
    orgGraph: result.results.bindings[0].orgGraph.value as string,
    mandaatUri: result.results.bindings[0].mandaatUri.value as string,
  };
};

export const findExistingMandataris = async (
  orgGraph: string,
  mandaatUri: string,
) => {
  const sparql = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT ?mandataris ?persoon WHERE {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ?mandataris org:holds ?mandaatUri ;
          mandaat:start ?start ;
          mandaat:isBestuurlijkeAliasVan ?persoon.

      }
      VALUES ?mandaatUri { ${sparqlEscapeUri(mandaatUri)} }

    } ORDER BY DESC(?start) LIMIT 1`;
  const result = await querySudo(sparql);
  if (result.results.bindings.length === 0) {
    return null;
  }
  return {
    mandataris: result.results.bindings[0].mandataris.value,
    persoon: result.results.bindings[0].persoon.value,
  };
};

export const endExistingMandataris = async (
  orgGraph: string,
  mandatarisUri: string,
  benoemingUri: string,
  date: Date,
) => {
  await updateSudo(`
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    DELETE {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ?mandataris mandaat:einde ?einde .
      }
    } INSERT {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ?mandataris mandaat:einde ${sparqlEscapeDateTime(date)} .
        ?mandataris ext:beeindigdDoor ${sparqlEscapeUri(benoemingUri)} .
      }
    } WHERE {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ?mandataris a mandaat:Mandataris .
        VALUES ?mandataris {
          ${sparqlEscapeUri(mandatarisUri)}
        }
        OPTIONAL {
          ?mandataris mandaat:einde ?einde .
        }
      }
    }`);
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
  burgemeesterMandaat: string,
  benoeming: string,
) => {
  const result = await querySudo(`
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT ?mandataris WHERE {
      ?mandataris a mandaat:Mandataris ;
        org:holds ${sparqlEscapeUri(burgemeesterMandaat)} ;
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
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${benoemingUri} ext:rejects ${mandatarisUri} .
      }
    }`;
  await updateSudo(sparql);
};

export const copyFromPreviousMandataris = async (
  orgGraph: string,
  existingMandataris: string,
  date: Date,
) => {
  const uuid = uuidv4();
  const newMandatarisUri = `http://mu.semte.ch/vocabularies/ext/mandatarissen/${uuid}`;
  await updateSudo(`
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mps: <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/>
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    INSERT {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${sparqlEscapeUri(newMandatarisUri)} a mandaat:Mandataris ;
          # copy other properties the mandataris might have but not the ones that need editing
          # this is safe because the mandataris is for the same person and mandate
          ?p ?o ;
          mu:uuid ${sparqlEscapeString(uuid)} ;
          mandaat:start ${sparqlEscapeDateTime(date)} ;
          # effectief
          mandaat:status <http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75> ;
          # immediately make this status bekrachtigd
          extlmb:hasPublicationStatus mps:9d8fd14d-95d0-4f5e-b3a5-a56a126227b6.
      }
    } WHERE {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${sparqlEscapeUri(existingMandataris)} a mandaat:Mandataris ;
          ?p ?o .
          FILTER (?p NOT IN (mandaat:start, mandaat:status, extlmb:hasPublicationStatus, mu:uuid) )
      }
    }`);
  return newMandatarisUri;
};

export const createBurgemeesterFromScratch = async (
  orgGraph: string,
  burgemeesterUri: string,
  burgemeesterMandaat: string,
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
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${sparqlEscapeUri(newMandatarisUri)} a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(uuid)} ;
          org:holds ${sparqlEscapeUri(burgemeesterMandaat)} ;
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
  orgGraph: string,
  burgemeesterUri: string,
  burgemeesterMandaat: string,
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
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${benoemingUri} ext:approves ${sparqlEscapeUri(newMandatarisUri)} .
      }
    }`);
};

export const confirmKnownPerson = async (
  orgGraph: string,
  personUri: string,
) => {
  const result = await querySudo(`
    ASK {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${sparqlEscapeUri(personUri)} a <http://www.w3.org/ns/person#Person> .
      }
    }
  `);
  if (!result.boolean) {
    throw new HttpError(`Person with uri ${personUri} not found`, 400);
  }
};
