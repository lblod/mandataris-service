import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import {
  query,
  update,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';
import {
  CSVRow,
  CsvUploadState,
  MandateHit,
  Term,
  TermProperty,
} from '../types';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import { PUBLICATION_STATUS } from '../util/constants';
import { sparqlEscapeTermValue } from '../util/sparql-escape';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
  getSparqlResults,
} from '../util/sparql-result';
import { TERM_MANDATARIS_TYPE } from './mandatees-decisions';

export const mandataris = {
  isValidId,
  isOnafhankelijk,
  findCurrentFractieForPerson,
  getPersonWithBestuursperiode,
  getNonResourceDomainProperties,
  addPredicatesToMandataris,
  getMandatarisFracties,
};

async function isValidId(id: string, sudo: boolean = false): Promise<boolean> {
  const askQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    ASK {
      ?mandataris a mandaat:Mandataris;
        mu:uuid ${sparqlEscapeString(id)}.
    }
  `;
  const result = sudo ? await querySudo(askQuery) : await query(askQuery);

  return getBooleanSparqlResult(result);
}

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
): Promise<TermProperty | null> {
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

  return findFirstSparqlResult(sparqlResult);
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
  orgGraph: Term,
  mandaat: Term,
  persoonUri: string,
): Promise<Term | undefined> => {
  const sparql = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT ?mandataris WHERE {
      GRAPH ${sparqlEscapeTermValue(orgGraph)} {
        ?mandataris a mandaat:Mandataris ;
          org:holds ?mandaatUri ;
          mandaat:start ?start ;
          mandaat:isBestuurlijkeAliasVan ${sparqlEscapeUri(persoonUri)}.
      }
      VALUES ?mandaatUri { ${sparqlEscapeTermValue(mandaat)} }

    } ORDER BY DESC(?start) LIMIT 1
  `;

  const result = await querySudo(sparql);
  const sparqlresult = findFirstSparqlResult(result);
  return sparqlresult?.mandataris;
};

export const copyFromPreviousMandataris = async (
  orgGraph: Term,
  existingMandataris: Term,
  date: Date,
  mandate?: Term,
) => {
  const uuid = uuidv4();
  const newMandatarisUri = `http://mu.semte.ch/vocabularies/ext/mandatarissen/${uuid}`;

  const filter = `FILTER (?p NOT IN (mandaat:start, lmb:hasPublicationStatus, mu:uuid
    ${mandate ? ', org:holds' : ''}))`;

  await updateSudo(`
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mps: <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>

    INSERT {
      GRAPH ${sparqlEscapeTermValue(orgGraph)} {
        ${sparqlEscapeUri(newMandatarisUri)} a mandaat:Mandataris ;
          # copy other properties the mandataris might have but not the ones that need editing
          # this is safe because the mandataris is for the same person and mandate
          ?p ?o ;
          ${mandate ? `org:holds ${sparqlEscapeTermValue(mandate)}; \n` : ''}
          mu:uuid ${sparqlEscapeString(uuid)} ;
          mandaat:start ${sparqlEscapeDateTime(date)} ;
          # immediately make this status bekrachtigd
          lmb:hasPublicationStatus mps:9d8fd14d-95d0-4f5e-b3a5-a56a126227b6.
      }
    } WHERE {
      GRAPH ${sparqlEscapeTermValue(orgGraph)} {
        ${sparqlEscapeTermValue(existingMandataris)} a mandaat:Mandataris ;
          ?p ?o .
        ${filter}
      }
    }`);
  return newMandatarisUri;
};

export async function endExistingMandataris(
  graph: Term,
  mandataris: Term,
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
      GRAPH ${sparqlEscapeTermValue(graph)} {
        ?mandataris mandaat:einde ?einde .
      }
    }
    INSERT {
      GRAPH ${sparqlEscapeTermValue(graph)} {
        ?mandataris mandaat:einde ${sparqlEscapeDateTime(endDate)} .
        ${extraTriples}
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeTermValue(graph)} {
        ?mandataris a mandaat:Mandataris .
        VALUES ?mandataris {
          ${sparqlEscapeTermValue(mandataris)}
        }
        OPTIONAL {
          ?mandataris mandaat:einde ?einde .
        }
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
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

   SELECT ?artikel
   WHERE {
      OPTIONAL { ?artikel mandaat:bekrachtigtAanstellingVan ${mandatarisSubject}. }
      OPTIONAL { ?artikel mandaat:bekrachtigtOntslagVan ${mandatarisSubject}. }
    }
  `;

  const result = await updateSudo(besluiteQuery);
  const sparqlresult = findFirstSparqlResult(result);

  if (sparqlresult?.artikel) {
    return sparqlresult.artikel;
  }

  return null;
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
      `|> Updated status to ${status} for mandataris: ${mandataris.value}.`,
    );
  } catch (error) {
    console.log(
      `|> Could not update mandataris: ${mandataris.value} status to ${status}`,
    );
  }
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
