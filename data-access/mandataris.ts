import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import {
  query,
  update,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';

import {
  CSVRow,
  CsvUploadState,
  MandateHit,
  instanceIdentifiers,
  TermProperty,
} from '../types';

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
import { HttpError } from '../util/http-error';

import {
  BESLUIT_STAGING_GRAPH,
  TERM_MANDATARIS_TYPE,
} from './mandatees-decisions';

export const mandataris = {
  isOnafhankelijk,
  findCurrentFractieForPerson,
  getPersonWithBestuursperiode,
  getNonResourceDomainProperties,
  addPredicatesToMandataris,
  getMandatarisFracties,
  generateMandatarissen,
  getActiveMandatarissenForPerson,
  bulkUpdateEndDate,
};

async function isOnafhankelijk(mandatarisId: string): Promise<boolean> {
  const getQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    ASK {
      ?currentMandataris a mandaat:Mandataris ;
        mu:uuid ${sparqlEscapeString(mandatarisId)} ;
        org:hasMembership ?lidmaatschap .
        ?lidmaatschap org:organisation ?fractie .
        ?fractie ext:isFractietype <http://data.vlaanderen.be/id/concept/Fractietype/Onafhankelijk> .
    }
  `;

  const sparqlResult = await query(getQuery);

  return getBooleanSparqlResult(sparqlResult);
}

async function findCurrentFractieForPerson(
  mandatarisId: string,
  graph?: string,
  sudo: boolean = false,
): Promise<string | undefined> {
  const graphInsert = graph ? `GRAPH ${sparqlEscapeUri(graph)} {` : '';
  const getQuery = `
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    SELECT DISTINCT ?fractie
    WHERE {
      ${graphInsert}
        ?mandataris a mandaat:Mandataris;
          mu:uuid ${sparqlEscapeString(mandatarisId)};
          mandaat:isBestuurlijkeAliasVan ?persoon;
          org:holds ?mandaat.
        ?mandaat ^org:hasPost ?bestuursorgaan.
        ?bestuursorgaan lmb:heeftBestuursperiode ?bestuursperiode.

        # Get mandataris in bestuursperiode for that person
        ?mandatarisOfPerson a mandaat:Mandataris;
          mandaat:isBestuurlijkeAliasVan ?persoon;
          org:holds ?mandaatOfPersonMandataris;
          mandaat:start ?mandatarisStart;
          mandaat:status ?mandatarisStatus.

        ?mandaatOfPersonMandataris ^org:hasPost ?bestuursorgaanOfPersonMandataris.
        ?bestuursorgaanOfPersonMandataris lmb:heeftBestuursperiode ?bestuursperiode.

        ?mandatarisOfPerson org:hasMembership ?member.
        ?member org:organisation ?fractie.
      ${graph ? '}' : ''}
    } ORDER BY DESC ( ?mandatarisStart ) LIMIT 1
  `;
  const sparqlResult = sudo ? await querySudo(getQuery) : await query(getQuery);

  return findFirstSparqlResult(sparqlResult)?.fractie?.value;
}

export async function findOnafhankelijkeFractieForPerson(
  personUri: string,
  mandateUris: string[],
) {
  const getQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT DISTINCT ?fractie WHERE {
      ?fractie a mandaat:Fractie .
      ?fractie ext:isFractietype <http://data.vlaanderen.be/id/concept/Fractietype/Onafhankelijk> .
      ?fractie org:memberOf ?bestuursorgaan.

      ?bestuursorgaan org:hasPost ?mandate.

      VALUES ?mandate {
        ${mandateUris.map((uri) => sparqlEscapeUri(uri)).join(' ')}
      }

      ?lidmaatschap org:organisation ?fractie.
      ?mandataris org:hasMembership ?lidmaatschap.

      ?mandataris mandaat:isBestuurlijkeAliasVan ${sparqlEscapeUri(personUri)}.
    } LIMIT 1`;

  const result = await query(getQuery);

  return findFirstSparqlResult(result)?.fractie?.value;
}

export async function createOnafhankelijkeFractie(mandateUris: string[]) {
  const uuid = uuidv4();
  const uri = `http://data.lblod.info/id/fracties/${uuid}`;

  const updateQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

    INSERT {
      GRAPH ?g {
        ${sparqlEscapeUri(uri)} a mandaat:Fractie ;
          ext:isFractietype <http://data.vlaanderen.be/id/concept/Fractietype/Onafhankelijk> ;
          regorg:legalName "Onafhankelijk" ;
          mu:uuid ${sparqlEscapeString(uuid)} ;
          org:linkedTo ?bestuurseenheid ;
          org:memberOf ?bestuursorgaan .
      }
    } WHERE {
      GRAPH ?g {
        ?bestuursorgaan org:hasPost ?mandate.
        ?bestuursorgaan mandaat:isTijdspecialisatieVan ?org.
        VALUES ?mandate {
          ${mandateUris.map((uri) => sparqlEscapeUri(uri)).join('\n')}
        }
      }
      ?org besluit:bestuurt ?bestuurseenheid.
    }
  `;
  await updateSudo(updateQuery);
  return uri;
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

  let fractionFilter = `?fraction regorg:legalName ${safeFractionName} .`;
  if (!fractieName || fractieName.toLowerCase() === 'onafhankelijk') {
    // in case of onafhankelijk, don't fetch the fractions, there will be many different matches
    fractionFilter = '?fraction ext:doesNotExist ext:doesNotExist . ';
  }

  const q = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX regorg: <https://www.w3.org/ns/regorg#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  SELECT DISTINCT ?mandate ?fraction ?start ?end WHERE {
    ?mandate a mandaat:Mandaat ;
    ^org:hasPost ?orgaanInTijd ;
        org:role / skos:prefLabel ${sparqlEscapeString(mandateName)} .
    ?orgaanInTijd mandaat:bindingStart ?start .
    OPTIONAL {
      ?orgaanInTijd mandaat:bindingEinde ?end .
    }
    OPTIONAL {
      ?orgaanInTijd ^org:memberOf ?fraction .
      ${fractionFilter}
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
  if (mandate.fractionUri) {
    membershipTriples = `
    ${safeMembershipUri} a org:Membership ;
      mu:uuid ${sparqlEscapeString(membershipUuid)} ;
      org:organisation ${sparqlEscapeUri(mandate.fractionUri)} .

    ${safeUri} org:hasMembership ${safeMembershipUri} .
    `;
  }

  const q = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
  PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
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
        lmb:hasPublicationStatus mps:9d8fd14d-95d0-4f5e-b3a5-a56a126227b6 .

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

export const findExistingMandatarisOfPerson = async (
  orgGraph: string,
  mandaatUri: string,
  persoonUri: string,
): Promise<string | undefined> => {
  const sparql = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT ?mandataris WHERE {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ?mandataris a mandaat:Mandataris ;
          org:holds ?mandaatUri ;
          mandaat:start ?start ;
          mandaat:isBestuurlijkeAliasVan ${sparqlEscapeUri(persoonUri)}.
      }
      VALUES ?mandaatUri { ${sparqlEscapeUri(mandaatUri)} }

    } ORDER BY DESC(?start) LIMIT 1
  `;

  const result = await querySudo(sparql);

  return findFirstSparqlResult(result)?.mandataris?.value;
};

export const copyFromPreviousMandataris = async (
  orgGraph: string,
  existingMandatarisUri: string,
  date: Date,
  mandateUri?: string,
) => {
  const uuid = uuidv4();
  const newMandatarisUri = `http://mu.semte.ch/vocabularies/ext/mandatarissen/${uuid}`;

  const filter = `FILTER (?p NOT IN (mandaat:start, lmb:hasPublicationStatus, mu:uuid
    ${mandateUri ? ', org:holds' : ''}))`;

  await updateSudo(`
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mps: <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>

    INSERT {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${sparqlEscapeUri(newMandatarisUri)} a mandaat:Mandataris ;
          # copy other properties the mandataris might have but not the ones that need editing
          # this is safe because the mandataris is for the same person and mandate
          ?p ?o ;
          ${mandateUri ? `org:holds ${sparqlEscapeUri(mandateUri)}; \n` : ''}
          mu:uuid ${sparqlEscapeString(uuid)} ;
          mandaat:start ${sparqlEscapeDateTime(date)} ;
          # immediately make this status bekrachtigd
          lmb:hasPublicationStatus mps:9d8fd14d-95d0-4f5e-b3a5-a56a126227b6.
      }
    } WHERE {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${sparqlEscapeUri(existingMandatarisUri)} a mandaat:Mandataris ;
          ?p ?o .
        ${filter}
      }
    }`);
  return newMandatarisUri;
};

export async function endExistingMandataris(
  graph: string,
  mandatarisUri: string,
  endDate: Date,
  benoemingUri?: string,
): Promise<void> {
  let extraTriples = '';
  if (benoemingUri) {
    extraTriples = `
        ?mandataris ext:beeindigdDoor ${sparqlEscapeUri(benoemingUri)}. \n `;
  }

  const terminateQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    DELETE {
      GRAPH ${sparqlEscapeUri(graph)} {
        ?mandataris mandaat:einde ?einde .
      }
    }
    INSERT {
      GRAPH ${sparqlEscapeUri(graph)} {
        ?mandataris mandaat:einde ${sparqlEscapeDateTime(endDate)} .
        ${extraTriples}
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(graph)} {
        ?mandataris a mandaat:Mandataris .
        VALUES ?mandataris {
          ${sparqlEscapeUri(mandatarisUri)}
        }
        OPTIONAL {
          ?mandataris mandaat:einde ?einde .
        }
      }
    }
  `;

  try {
    await updateSudo(terminateQuery, {}, { mayRetry: true });
    console.log(`|> Terminated mandataris with uri: ${mandatarisUri}.`);
  } catch (error) {
    throw Error(`Could not terminate mandataris with uri: ${mandatarisUri}`);
  }
}

export async function findDecisionAndLinkForMandataris(
  mandatarisUri: string,
): Promise<{ besluit: string | undefined; link: string | undefined }> {
  const mandatarisSubject = sparqlEscapeUri(mandatarisUri);
  const besluiteQuery = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

   SELECT ?artikel ?link
   WHERE {
      GRAPH ?g {
        VALUES ?link {
          mandaat:bekrachtigtAanstellingVan
          mandaat:bekrachtigtOntslagVan
        }
        ?artikel ?link ${mandatarisSubject}.
      }
      OPTIONAL {
        ?g ext:ownedBy ?eenheid.
      }
      FILTER(BOUND(?eenheid) || ?g = ${sparqlEscapeUri(BESLUIT_STAGING_GRAPH)})
    }
  `;

  const result = await querySudo(besluiteQuery);
  const sparqlResult = findFirstSparqlResult(result);

  return {
    besluit: sparqlResult?.artikel?.value,
    link: sparqlResult?.link?.value,
  };
}

export async function updatePublicationStatusOfMandataris(
  mandataris: string,
  status: PUBLICATION_STATUS,
): Promise<void> {
  const escaped = {
    mandataris: sparqlEscapeUri(mandataris),
    status: sparqlEscapeUri(status),
    mandatarisType: sparqlEscapeTermValue(TERM_MANDATARIS_TYPE),
  };
  const updateStatusQuery = `
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    DELETE {
      GRAPH ?graph {
        ${escaped.mandataris} lmb:hasPublicationStatus ?status.
      }
    }
    INSERT {
      GRAPH ?graph {
        ${escaped.mandataris} lmb:hasPublicationStatus ${escaped.status}.
      }
    }
    WHERE {
      GRAPH ?graph {
        ${escaped.mandataris} a ${escaped.mandatarisType}.
        OPTIONAL {
          ${escaped.mandataris} lmb:hasPublicationStatus ?status.
        }
      }
    }
  `;

  try {
    await updateSudo(updateStatusQuery);
    console.log(
      `|> Updated status to ${status} for mandataris: ${mandataris}.`,
    );
  } catch (error) {
    console.log(
      `|> Could not update mandataris: ${mandataris} status to ${status}`,
    );
  }
}

export async function bulkSetPublicationStatusEffectief(
  mandatarissen: string[],
): Promise<void> {
  const escaped = {
    mandatarissenUuids: mandatarissen
      .map((uri) => sparqlEscapeString(uri))
      .join(' '),
    effectief: sparqlEscapeUri(PUBLICATION_STATUS.EFFECTIEF),
    bekrachtigd: sparqlEscapeUri(PUBLICATION_STATUS.BEKRACHTIGD),
    todaysDate: sparqlEscapeDateTime(new Date()),
  };
  const query = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    DELETE {
      GRAPH ?graph {
        ?mandataris lmb:hasPublicationStatus ?status .
        ?mandataris lmb:effectiefAt ?effectiefAt .
      }
    }
    INSERT {
      GRAPH ?graph {
        ?mandataris lmb:hasPublicationStatus ${escaped.effectief} .
        ?mandataris lmb:effectiefAt ${escaped.todaysDate} .
      }
    }
    WHERE {
      GRAPH ?graph {
        ?mandataris a mandaat:Mandataris ;
          mu:uuid ?uuid .
        OPTIONAL {
          ?mandataris lmb:hasPublicationStatus ?status .
        }
        OPTIONAL {
          ?mandataris lmb:effectiefAt ?effectiefAt .
        }
        VALUES ?uuid { ${escaped.mandatarissenUuids} }
        FILTER (!BOUND(?status) || ?status NOT IN (${escaped.bekrachtigd}))
      }
    }
  `;

  await updateSudo(query);
}

export async function bulkBekrachtigMandatarissen(
  mandatarissen: string[],
  link: string,
): Promise<void> {
  const escaped = {
    mandatarissenUuids: mandatarissen
      .map((uri) => sparqlEscapeString(uri))
      .join(' '),
    bekrachtigd: sparqlEscapeUri(PUBLICATION_STATUS.BEKRACHTIGD),
    link: sparqlEscapeString(link),
  };
  const query = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    DELETE {
      GRAPH ?graph {
        ?mandataris lmb:hasPublicationStatus ?status .
      }
    }
    INSERT {
      GRAPH ?graph {
        ?mandataris lmb:hasPublicationStatus ${escaped.bekrachtigd} ;
          lmb:linkToBesluit ${escaped.link} .
      }
    }
    WHERE {
      GRAPH ?graph {
        ?mandataris a mandaat:Mandataris ;
          mu:uuid ?uuid .
        OPTIONAL {
          ?mandataris lmb:hasPublicationStatus ?status .
        }
        VALUES ?uuid { ${escaped.mandatarissenUuids} }
      }
    }
  `;

  await updateSudo(query);
}

async function getPersonWithBestuursperiode(
  mandatarisId: string,
  sudo: boolean = false,
): Promise<{ persoonId: string; bestuursperiodeId: string }> {
  const getQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    SELECT DISTINCT ?persoonId ?bestuursperiodeId
    WHERE {
      ?mandataris a mandaat:Mandataris;
        mu:uuid ${sparqlEscapeString(mandatarisId)};
        mandaat:isBestuurlijkeAliasVan ?persoon;
        org:holds ?mandaat.

      ?persoon mu:uuid ?persoonId.
      ?mandaat ^org:hasPost ?bestuursorgaan.
      ?bestuursorgaan lmb:heeftBestuursperiode ?bestuursperiode.
      ?bestuursperiode mu:uuid ?bestuursperiodeId.
    }
  `;

  const sparqlResult = sudo ? await querySudo(getQuery) : await query(getQuery);
  const first = findFirstSparqlResult(sparqlResult);

  return {
    persoonId: first?.persoonId.value as string,
    bestuursperiodeId: first?.bestuursperiodeId.value as string,
  };
}

async function getNonResourceDomainProperties(
  mandatarisId: string,
): Promise<Array<TermProperty>> {
  const getQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX owl: <http://www.w3.org/2002/07/owl#>
    PREFIX schema: <http://schema.org/>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    SELECT ?predicate ?object
    WHERE {
      ?mandataris a mandaat:Mandataris;
        mu:uuid ${sparqlEscapeString(mandatarisId)};
        ?predicate ?object.

      FILTER (
        ?predicate != mu:uuid &&
        ?predicate != rdf:type &&
        ?predicate != mandaat:rangorde &&
        ?predicate != mandaat:start &&
        ?predicate != mandaat:einde &&
        ?predicate != ext:datumEedaflegging &&
        ?predicate != ext:datumMinistrieelBesluit &&
        ?predicate != ext:generatedFrom &&
        ?predicate != skos:changeNote &&
        ?predicate != lmb:linkToBesluit &&
        ?predicate != dct:modified &&
        ?predicate != mandaat:isTijdelijkVervangenDoor &&
        ?predicate != schema:contactPoint &&
        ?predicate != mandaat:beleidsdomein &&
        ?predicate != org:holds &&
        ?predicate != org:hasMembership &&
        ?predicate != mandaat:isBestuurlijkeAliasVan &&
        ?predicate != mandaat:status &&
        ?predicate != owl:sameAs &&
        ?predicate != lmb:hasPublicationStatus
      )
    }
  `;

  const sparqlResult = await query(getQuery);

  return getSparqlResults(sparqlResult);
}

async function addPredicatesToMandataris(
  mandatarisId: string,
  termProperties: Array<TermProperty>,
): Promise<void> {
  const mapPredicateObject = termProperties.map((tp) => {
    return {
      predicate: sparqlEscapeUri(tp.predicate.value),
      object: sparqlEscapeTermValue(tp.object),
    };
  });
  const queryValues = mapPredicateObject.map(
    (po: { predicate: string; object: string }) =>
      `( ${po.predicate} ${po.object} )`,
  );
  console.log({ termProperties });
  const updateQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    INSERT {
      ?mandataris ?predicate ?object.
    }
    WHERE {
      VALUES (?predicate ?object) { ${queryValues.join(' ')} }
      ?mandataris a mandaat:Mandataris;
        mu:uuid ${sparqlEscapeString(mandatarisId)}.
    }
  `;

  await update(updateQuery);
}

async function getMandatarisFracties(
  mandatarisId: string,
): Promise<Array<TermProperty>> {
  const q = `
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    SELECT DISTINCT ?fractieId
    WHERE {
      ?mandatarisOG a mandaat:Mandataris ;
        mu:uuid ${sparqlEscapeString(mandatarisId)} ;
        mandaat:isBestuurlijkeAliasVan ?person ;
        org:holds ?mandaat .

      ?mandataris a mandaat:Mandataris ;
        mandaat:isBestuurlijkeAliasVan ?person ;
        org:holds ?mandaat ;
        org:hasMembership / org:organisation / mu:uuid ?fractieId .
    }
  `;
  const results = await query(q);

  return getSparqlResults(results);
}

async function generateMandatarissen(
  sparqlValues: Array<{ id: string; uri: string; rangorde: string }>,
  parameters,
) {
  const { count, startDate, endDate, mandaatUri } = parameters;
  const uriAndIdValues = sparqlValues
    .map((item) => {
      const values = [
        sparqlEscapeUri(item.uri),
        sparqlEscapeString(item.id),
        sparqlEscapeString(item.rangorde),
      ];

      return `( ${values.join(' ')} )`;
    })
    .join('\n');

  const escapedCommon = {
    startDate: sparqlEscapeDateTime(startDate),
    endDate: sparqlEscapeDateTime(endDate),
    mandaat: sparqlEscapeUri(mandaatUri),
    effectief: sparqlEscapeUri(MANDATARIS_STATUS.EFFECTIEF),
    publication: sparqlEscapeUri(PUBLICATION_STATUS.DRAFT),
  };

  const createQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX mps: <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX generiek: <http://data.vlaanderen.be/ns/generiek#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    INSERT {
      GRAPH <http://mu.semte.ch/graphs/application> {
        ?uri a mandaat:Mandataris ;
          mu:uuid ?id ;
          mandaat:rangorde ?rangorde ;
          mandaat:start ${escapedCommon.startDate} ;
          ${endDate ? `mandaat:einde ${escapedCommon.endDate};` : ''}
          org:holds ${escapedCommon.mandaat} ;
          mandaat:status ${escapedCommon.effectief} ;
          lmb:hasPublicationStatus ${escapedCommon.publication} .
      }
    }
    WHERE {
      VALUES ( ?uri ?id ?rangorde ) { ${uriAndIdValues} }
    }
    `;

  try {
    await query(createQuery);
  } catch (error) {
    throw new HttpError(
      `Could not generate ${count} mandataris(sen).`,
      STATUS_CODE.INTERNAL_SERVER_ERROR,
    );
  }
}

async function getActiveMandatarissenForPerson(persoonId: string) {
  const escaped = {
    persoonId: sparqlEscapeString(persoonId),
    dateNow: sparqlEscapeDateTime(new Date()),
  };
  const updateQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT DISTINCT ?mandataris
    WHERE {
      ?mandataris a mandaat:Mandataris ;
        mandaat:isBestuurlijkeAliasVan ?persoon;
        mandaat:start ?startDate;
        mandaat:status ?mandatarisStatus.
      ?persoon mu:uuid ${escaped.persoonId}.
      OPTIONAL {
        ?mandataris mandaat:einde ?endDate.
      }
      FILTER (
          ${escaped.dateNow} >= xsd:dateTime(?startDate) &&
          ${escaped.dateNow} <= ?safeEnd
      )
      BIND(IF(BOUND(?endDate), ?endDate,  ${escaped.dateNow}) as ?safeEnd )
    }
  `;
  const sparqlResult = await query(updateQuery);

  return getSparqlResults(sparqlResult).map((b) => b.mandataris?.value);
}

async function bulkUpdateEndDate(mandatarisUris: Array<string>, endDate: Date) {
  if (mandatarisUris.length === 0) {
    return;
  }

  const escaped = {
    endDate: sparqlEscapeDateTime(endDate),
    dateNow: sparqlEscapeDateTime(new Date()),
  };
  const updateQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    DELETE {
      ?mandataris mandaat:einde ?endDate.
    }
    INSERT {
      ?mandataris mandaat:einde ${escaped.endDate}.
    }
    WHERE {
        VALUES ?mandataris {
          ${mandatarisUris.map((uri) => sparqlEscapeUri(uri)).join('\n')}
        }

        ?mandataris a mandaat:Mandataris.

        OPTIONAL {
          ?mandataris mandaat:einde ?endDate.
      }
      BIND(IF(BOUND(?endDate), ?endDate,  ${escaped.dateNow}) as ?safeEnd )
    }
  `;
  await update(updateQuery);
}

export async function hasReplacement(
  mandatarisId: string,
): Promise<instanceIdentifiers[]> {
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT ?vervanger ?vervangerId {
      GRAPH ?g {
        ?mandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          mandaat:isTijdelijkVervangenDoor ?vervanger .
        ?vervanger mu:uuid ?vervangerId
      }
    }
  `;

  const result = await query(q);
  if (result.results.bindings.length == 0) {
    return null;
  }
  return result.bindings.map((binding) => {
    return {
      uri: binding.vervanger.value as string,
      id: binding.vervangerId.value as string,
    };
  });
}

export async function addReplacement(
  graph: string,
  mandataris: instanceIdentifiers,
  replacementMandataris: instanceIdentifiers,
) {
  const escaped = {
    graph: sparqlEscapeUri(graph),
    mandataris: sparqlEscapeUri(mandataris.uri),
    replacement: sparqlEscapeUri(replacementMandataris.uri),
  };
  const query = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX dct: <http://purl.org/dc/terms/>

    DELETE {
      GRAPH ${escaped.graph} {
        ?mandataris dct:modified ?oldModified .
      }
    }
    INSERT {
      GRAPH ${escaped.graph} {
        ?mandataris mandaat:isTijdelijkVervangenDoor ${escaped.replacement} .
        ?mandataris dct:modified ?now .
      }
    }
    WHERE {
      GRAPH ${escaped.graph} {
        ?mandataris a mandaat:Mandataris .
        OPTIONAL {
          ?mandataris dct:modified ?oldModified .
        }
        VALUES ?mandataris { ${escaped.mandataris} }
        BIND(NOW() AS ?now)
      }
    }
  `;
  await updateSudo(query);
}
