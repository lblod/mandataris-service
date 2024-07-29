import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import {
  query,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';
import { CSVRow, CsvUploadState, MandateHit, Term } from '../types';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import {
  MANDATARIS_STATUS,
  PUBLICATION_STATUS,
  STATUS_CODE,
} from '../util/constants';
import { sparqlEscapeTermValue } from '../util/sparql-escape';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
  getSparqlResults,
} from '../util/sparql-result';
import { TERM_MANDATARIS_TYPE } from './mandatees-decisions';
import { HttpError } from '../util/http-error';
import { bestuursperiode } from './bestuursperiode';

export const mandataris = {
  isActive,
  exists,
  findPerson,
  getCurrentFractieForPerson,
};

async function exists(mandatarisId: string): Promise<boolean> {
  const askIfExists = `
      PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
      PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

      ASK {
        GRAPH ?mandatarisGraph {
          ?mandataris a mandaat:Mandataris;
            mu:uuid ${sparqlEscapeString(mandatarisId)}.
        }
        FILTER NOT EXISTS {
          ?mandatarisGraph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
        }
      }
    `;

  const result = await querySudo(askIfExists);

  return getBooleanSparqlResult(result);
}

async function isActive(mandatarisId: string | undefined): Promise<boolean> {
  if (!mandatarisId) {
    throw new HttpError(
      'Cannot check active status of mandataris on id of undefined.',
      STATUS_CODE.INTERNAL_SERVER_ERROR,
    );
  }

  const datetimeNow = new Date();
  const escapedDateNow = sparqlEscapeDateTime(datetimeNow);
  const escapedBeeindigdStatus = sparqlEscapeUri(MANDATARIS_STATUS.BEEINDIGD);
  const booleanQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    ASK {
      GRAPH ?mandatarisGraph {
        ?mandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)};
          mandaat:start ?startDate;
          mandaat:status ?mandatarisStatus.

          OPTIONAL {
            ?mandataris mandaat:einde ?endDate.
          }
      }

      FILTER (
          ${escapedDateNow} >= xsd:dateTime(?startDate) &&
          ${escapedDateNow} <= ?safeEnd &&
          ?mandatarisStatus != ${escapedBeeindigdStatus}
      )
      FILTER NOT EXISTS {
        ?mandatarisGraph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }

      BIND(IF(BOUND(?endDate), ?endDate,  ${escapedDateNow}) as ?safeEnd )
    }
  `;

  const results = await querySudo(booleanQuery);

  return getBooleanSparqlResult(results);
}

export const findGraphAndMandates = async (row: CSVRow) => {
  const mandates = await findMandatesByName(row);

  if (mandates.length === 0) {
    return { mandates: [], graph: null };
  }

  const q = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

  SELECT ?g ?mandate WHERE {
    GRAPH ?g {
      ?mandate a mandaat:Mandaat .
      VALUES ?mandate {
        ${sparqlEscapeUri(mandates[0].mandateUri)}
      }
    }
  } LIMIT 1`;
  const result = await querySudo(q);
  if (!result.results.bindings.length) {
    return { mandates: [], graph: null };
  }

  return {
    graph: result.results.bindings[0].g.value as string,
    mandates: mandates,
  };
};

const findMandatesByName = async (row: CSVRow) => {
  const { mandateName, startDateTime, endDateTime, fractieName } = row.data;
  const from = sparqlEscapeDateTime(startDateTime);
  const to = endDateTime
    ? sparqlEscapeDateTime(endDateTime)
    : new Date('3000-01-01').toISOString();
  const safeFractionName = fractieName
    ? sparqlEscapeString(fractieName)
    : 'mu:doesNotExist';

  const q = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX regorg: <https://www.w3.org/ns/regorg#>

  SELECT ?mandate ?fraction ?start ?end WHERE {
    ?mandate a mandaat:Mandaat ;
    ^org:hasPost ?orgaanInTijd ;
        org:role / skos:prefLabel ${sparqlEscapeString(mandateName)} .
    ?orgaanInTijd mandaat:bindingStart ?start .
    OPTIONAL {
      ?orgaanInTijd mandaat:bindingEinde ?end .
    }
    OPTIONAL {
      ?orgaanInTijd ^org:memberOf ?fraction .
      ?fraction regorg:legalName ${safeFractionName} .
    }
    BIND(IF(BOUND(?end), ?end,  "3000-01-01T12:00:00.000Z"^^xsd:dateTime) as ?safeEnd)
    FILTER ((?start <= ${from} && ${from} <= ?safeEnd) ||
            (?start <= ${to} && ${to} <= ?safeEnd) ||
            (${from} <= ?start && ?safeEnd <= ${to}))
  }`;
  const result = await query(q);
  if (!result.results.bindings.length) {
    return [];
  }
  const items: MandateHit[] = result.results.bindings.map((binding) => {
    return {
      mandateUri: binding.mandate.value,
      fractionUri: binding.fraction?.value,
      start: binding.start.value,
      end: binding.end?.value,
    };
  });
  items.sort((a, b) => {
    return new Date(b.start).getTime() - new Date(a.start).getTime();
  });
  return items;
};

export const createMandatarisInstance = async (
  persoonUri: string,
  mandate: MandateHit,
  startDateTime: string,
  endDateTime: string | null,
  rangordeString: string | null,
  beleidsdomeinNames: string | null,
  uploadState: CsvUploadState,
) => {
  const rangorde = rangordeString ? rangordeString : null;
  const beleidsdomeinen = beleidsdomeinNames
    ? beleidsdomeinNames.split('|')
    : [];
  const beleidsDomeinUris = beleidsdomeinen.map((name) => {
    return uploadState.beleidsDomeinMapping[name];
  });

  // the start of this mandataris is the minimum of the beleidsorgaan start date
  // and the start date from the excel, as we will create one for every overlapping mandate we found
  const mandatarisStart = moment
    .max(moment(startDateTime), moment(mandate.start))
    .toISOString();
  let mandatarisEnd = moment(mandate.end).toISOString();
  if (endDateTime) {
    if (mandate.end) {
      mandatarisEnd = moment
        .min(moment(endDateTime), moment(mandate.end))
        .toISOString();
    } else {
      mandatarisEnd = moment(endDateTime).toISOString();
    }
  }

  const uuid = uuidv4();
  const uri = `http://data.lblod.info/id/mandatarissen/${uuid}`;
  const membershipUuid = uuidv4();
  const membershipUri = `http://data.lblod.info/id/lidmaatschappen/${membershipUuid}`;
  const timeframeUuid = uuidv4();
  const timeframeUri = `http://data.lblod.info/id/tijdsintervallen/${timeframeUuid}`;

  let mandatarisBeleidsDomeinen = '';
  if (beleidsDomeinUris.length > 0) {
    mandatarisBeleidsDomeinen = `mandaat:beleidsdomein ${beleidsDomeinUris
      .map((uri) => sparqlEscapeUri(uri))
      .join(', ')} ;`;
  }
  let mandatarisRangorde = '';
  if (rangorde) {
    mandatarisRangorde = `mandaat:rangorde ${sparqlEscapeString(rangorde)} ;`;
  }

  let membershipTriples = '';
  const safeUri = sparqlEscapeUri(uri);
  const safeMembershipUri = sparqlEscapeUri(membershipUri);
  const safeTimeframeUri = sparqlEscapeUri(timeframeUri);
  if (mandate.fractionUri) {
    membershipTriples = `
    ${safeMembershipUri} a org:Membership ;
      mu:uuid ${sparqlEscapeString(membershipUuid)} ;
      org:organisation ${sparqlEscapeUri(mandate.fractionUri)} ;
      org:memberDuring ${safeTimeframeUri} .

    ${safeUri} org:hasMembership ${safeMembershipUri} .

    ${safeTimeframeUri} a dct:PeriodOfTime ;
      mu:uuid ${sparqlEscapeString(timeframeUuid)} ;
      generiek:start ${sparqlEscapeDateTime(mandatarisStart)} ;
      generiek:einde ${sparqlEscapeDateTime(mandatarisEnd)} .
    `;
  }

  const q = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
  PREFIX extlmb:  <http://mu.semte.ch/vocabularies/ext/lmb/>
  PREFIX mps: <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX generiek: <http://data.vlaanderen.be/ns/generiek#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/application> {
      ${safeUri} a mandaat:Mandataris ;
        mu:uuid ${sparqlEscapeString(uuid)} ;
        mandaat:isBestuurlijkeAliasVan ${sparqlEscapeUri(persoonUri)} ;
        ${mandatarisRangorde}
        ${mandatarisBeleidsDomeinen}
        mandaat:start ${sparqlEscapeDateTime(mandatarisStart)} ;
        mandaat:einde ${sparqlEscapeDateTime(mandatarisEnd)} ;
        org:holds ${sparqlEscapeUri(mandate.mandateUri)} ;
        # effectief
        mandaat:status <http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75> ;
        # bekrachtigd
        extlmb:hasPublicationStatus mps:9d8fd14d-95d0-4f5e-b3a5-a56a126227b6 .

        ${membershipTriples}
    }
  }`;

  await query(q);
  uploadState.mandatarissenCreated++;
};

export const validateNoOverlappingMandate = async (
  row: CSVRow,
  persoonUri: string,
  mandates: MandateHit[],
  uploadState: CsvUploadState,
) => {
  const q = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX org: <http://www.w3.org/ns/org#>

  ASK {
    ?mandataris a mandaat:Mandataris ;
      mandaat:isBestuurlijkeAliasVan ${sparqlEscapeUri(persoonUri)} ;
      org:holds ?mandate .
    VALUES ?mandate {
      ${mandates.map((m) => sparqlEscapeUri(m.mandateUri)).join(' ')}
    }
  }`;
  const result = await query(q);
  if (result.boolean) {
    uploadState.errors.push(
      `[line ${row.lineNumber}] Mandate with same type found in same period for person ${persoonUri}`,
    );
    return true;
  }
  return false;
};

export async function terminateMandataris(
  mandataris: Term,
  endDate: Date,
): Promise<void> {
  if (!endDate) {
    throw Error(
      `|> End date not set! Mandataris with uri "${mandataris.value}" will not be terminated.`,
    );
  }

  const statusBeeindigd = sparqlEscapeUri(MANDATARIS_STATUS.BEEINDIGD);
  const datumBeeindigd = sparqlEscapeDateTime(endDate);
  const terminateQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

    DELETE {
      GRAPH ?graph {
      ${sparqlEscapeTermValue(mandataris)}
        mandaat:status ?status ;
        mandaat:einde ?einde .
      }
    }
    INSERT {
      GRAPH ?graph {
        ${sparqlEscapeTermValue(mandataris)}
          mandaat:status ${statusBeeindigd} ;
          mandaat:einde ${datumBeeindigd} .
      }
    }
    WHERE {
      GRAPH ?graph {
        ${sparqlEscapeTermValue(mandataris)}
          mandaat:status ?status ;
          mandaat:einde ?einde .
      }
    }
  `;

  try {
    await updateSudo(terminateQuery, {}, { mayRetry: true });
    console.log(`|> Terminated mandataris with uri: ${mandataris.value}.`);
  } catch (error) {
    throw Error(`Could not terminate mandataris with uri: ${mandataris.value}`);
  }
}

export async function findStartDateOfMandataris(
  mandataris: Term,
): Promise<Date | null> {
  const startDateQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

    SELECT ?startDate
    WHERE {
      ${sparqlEscapeTermValue(mandataris)} mandaat:start ?startDate .
    }
  `;

  const dateResult = await querySudo(startDateQuery);
  const result = findFirstSparqlResult(dateResult);

  if (result) {
    return new Date(result.startDate.value);
  }

  return null;
}

export async function findDecisionForMandataris(
  mandataris: Term,
): Promise<Term | null> {
  const mandatarisSubject = sparqlEscapeTermValue(mandataris);
  const besluiteQuery = `
   PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
   PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
   PREFIX ext: <http://mu.semte.ch/vocabularies/ext/> 
   
   SELECT ?artikel WHERE {
      ?artikel ext:bekrachtigtAanstellingVan ${mandatarisSubject}.
    }
  `;

  const result = await updateSudo(besluiteQuery);
  const sparqlresult = findFirstSparqlResult(result);

  if (sparqlresult?.artikel) {
    return sparqlresult.artikel;
  }

  return null;
}

export async function addLinkToDecisionDocumentToMandataris(
  mandataris: Term,
  linkToDocument: Term,
): Promise<void> {
  const escaped = {
    mandataris: sparqlEscapeTermValue(mandataris),
    link: sparqlEscapeTermValue(linkToDocument),
    mandatarisType: sparqlEscapeTermValue(TERM_MANDATARIS_TYPE),
  };
  const addQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    DELETE {
      GRAPH ?graph {
        ${escaped.mandataris} ext:linkToBesluit ?link.
      }
    }
    INSERT {
      GRAPH ?graph {
        ${escaped.mandataris} ext:linkToBesluit ${escaped.link}.
      }
    }
    WHERE {
      GRAPH ?graph {
        ${escaped.mandataris} a ${escaped.mandatarisType}.
        OPTIONAL {
          ${escaped.mandataris} ext:linkToBesluit ?link.
        }
      }
    }
  `;

  try {
    await updateSudo(addQuery);
    console.log(
      `|> Added decision document link: ${linkToDocument.value} to mandataris: ${mandataris.value}`,
    );
  } catch (error) {
    console.log(
      `|> Something went wrongwhen adding the decision document link: ${linkToDocument.value} to the mandataris: ${mandataris.value}`,
    );
  }
}

export async function updatePublicationStatusOfMandataris(
  mandataris: Term,
  status: PUBLICATION_STATUS,
): Promise<void> {
  const escaped = {
    mandataris: sparqlEscapeTermValue(mandataris),
    status: sparqlEscapeUri(status),
    mandatarisType: sparqlEscapeTermValue(TERM_MANDATARIS_TYPE),
  };
  const updateStatusQuery = `
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>

    DELETE {
      GRAPH ?graph {
        ${escaped.mandataris} extlmb:hasPublicationStatus ?status.
      }
    }
    INSERT {
      GRAPH ?graph {
        ${escaped.mandataris} extlmb:hasPublicationStatus ${escaped.status}.
      }
    }
    WHERE {
      GRAPH ?graph {
        ${escaped.mandataris} a ${escaped.mandatarisType}.
        OPTIONAL {
          ${escaped.mandataris} extlmb:hasPublicationStatus ?status.
        }
      }
    }
  `;

  try {
    await updateSudo(updateStatusQuery);
    console.log(
      `|> Updated status to ${status} for mandataris: ${mandataris.value}.`,
    );
  } catch (error) {
    console.log(
      `|> Could not update mandataris: ${mandataris.value} status to ${status}`,
    );
  }
}

async function findPerson(mandatarisId: string): Promise<string | undefined> {
  const searchQuery = `
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

    SELECT DISTINCT ?person
    WHERE {
      GRAPH ?graph {
        ?mandataris a mandaat:Mandataris;
            mu:uuid ${sparqlEscapeString(mandatarisId)};
            mandaat:isBestuurlijkeAliasVan ?person.
      }

      FILTER NOT EXISTS {
        ?graph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      } 
    }
  `;

  const results = await querySudo(searchQuery);
  const first = findFirstSparqlResult(results);

  return first?.person.value;
}

async function getCurrentFractieForPerson(
  mandatarisId: string,
): Promise<string | null> {
  const escapedBeeindigdState = sparqlEscapeUri(MANDATARIS_STATUS.BEEINDIGD);
  const activeBestuursperiode = await bestuursperiode.findActive();
  const period = sparqlEscapeUri(activeBestuursperiode);
  const searchQuery = `
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

    SELECT DISTINCT ?fractie
    WHERE {
      GRAPH ?graph {
        ?mandataris a mandaat:Mandataris;
            mu:uuid ${sparqlEscapeString(mandatarisId)};
            mandaat:isBestuurlijkeAliasVan ?person;
            org:hasMembership ?member;
            org:holds ?mandaat;
            dct:modified ?lastModified;
            mandaat:status ?mandatarisStatus.
        ?member org:organisation ?fractie.
        ?mandaat ^org:hasPost ?bestuurorgaanInTijd.
        ?bestuursorgaanInTijd ext:heeftBestuursperiode ${period}.

        OPTIONAL {
          ?mandataris mandaat:einde ?endDate.
        }
      }

      FILTER ( 
        ?mandatarisStatus != ${escapedBeeindigdState} &&
        ?lastModified <= ?safeEnd
      )
      FILTER NOT EXISTS {
        ?graph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      } 
      BIND(IF(BOUND(?endDate), ?endDate,  ?lastModified) as ?safeEnd)
    }
  `;

  const results = await querySudo(searchQuery);
  const fracties = getSparqlResults(results);
  if (fracties.length === 0 || !fracties[0].fractie) {
    return null;
  }

  return fracties[0].fractie.value;
}
