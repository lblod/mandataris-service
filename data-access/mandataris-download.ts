import { query, sparqlEscapeString } from 'mu';
import { getSparqlResults } from '../util/sparql-result';
import { sparqlEscapeDateTime, sparqlEscapeUri } from '../util/mu';

export const downloadMandatarissen = {
  getWithFilters,
  getPropertiesOfMandatarissen,
};

async function getWithFilters(filters) {
  const {
    bestuursperiodeId,
    bestuursorgaanId,
    persoonIds,
    bestuursFunctieCodeIds,
  } = filters;
  let bestuursorgaanInTijdFilter: string | null = null;
  let onlyActiveFilter: string | null = null;
  let persoonFilter: string | null = null;
  let mandaatTypeFilter: string | null = null;

  if (bestuursorgaanId) {
    bestuursorgaanInTijdFilter = `
      ?mandaat ^org:hasPost ?bestuursorgaanInTijd.
      ?bestuursorgaanInTijd mu:uuid ${sparqlEscapeString(bestuursorgaanId)}.
    `;
  }
  if (filters.onlyShowActive == 'true') {
    const escapedTodaysDate = sparqlEscapeDateTime(new Date());
    onlyActiveFilter = `
      ?mandataris mandaat:einde ?einde.

      ?bestuursorgaanInTijd mandaat:bindingStart ?startBestuursorgaan. 
      ?bestuursorgaanInTijd mandaat:bindingEinde ?eindeBestuursorgaan. 

      FILTER (
        ?einde <= ?eindeBestuursorgaan &&
        ?einde >= ?startBestuursorgaan &&
        ?einde >= ${escapedTodaysDate}
      )
    `;
  }

  if (persoonIds.length >= 1) {
    const idValues = persoonIds.map((id) => sparqlEscapeString(id)).join('\n');
    persoonFilter = `
      VALUES ?persoonId { ${idValues} }

      ?mandataris mandaat:isBestuurlijkeAliasVan ?persoon.
      ?persoon mu:uuid ?persoonId.
    `;
  }

  if (bestuursFunctieCodeIds.length >= 1) {
    const idValues = bestuursFunctieCodeIds
      .map((id) => sparqlEscapeString(id))
      .join('\n');
    mandaatTypeFilter = `
      VALUES ?functieCode { ${idValues} }
      ?mandaat org:role ?bestuursfunctieCode .
      ?bestuursfunctieCode mu:uuid ?functieCode.
    `;
  }

  const queryString = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX fractieType: <http://data.vlaanderen.be/id/concept/Fractietype/>


    SELECT DISTINCT ?mandataris
    WHERE {
      ?mandataris a mandaat:Mandataris.
      ?mandataris org:holds ?mandaat.

      ?bestuursorgaan lmb:heeftBestuursperiode ?bestuursperiode.
      ?bestuursperiode mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.

      ${bestuursorgaanInTijdFilter ?? ''}
      ${onlyActiveFilter ?? ''}
      ${persoonFilter ?? ''}
      ${getFractieFilters(filters)}
      ${mandaatTypeFilter ?? ''}
    }
  `;

  const sparqlResult = await query(queryString);

  return getSparqlResults(sparqlResult).map((res) => res.mandataris.value);
}

function getFractieFilters(filters): string {
  const { fractieIds, hasFilterOnOnafhankelijkeFractie } = filters;
  const idValues = fractieIds.map((id) => sparqlEscapeString(id)).join('\n');
  const filterOnafhankelijk =
    '?fractie ext:isFractietype fractieType:Onafhankelijk.';
  const isOptional =
    fractieIds.length === 0 && !hasFilterOnOnafhankelijkeFractie;

  return `
      {
        ${fractieIds.length >= 1 ? `VALUES ?fractieId {\n ${idValues} }` : ''}
        ${isOptional ? 'OPTIONAL {\n' : ''}
          ?mandataris org:hasMembership ?lidmaatschap.
          ?lidmaatschap org:organisation ?fractie.
        ${isOptional ? '}' : ''}
        ${fractieIds.length >= 1 ? '?fractie mu:uuid ?fractieId.' : ''}
      } UNION {
        ${isOptional ? 'OPTIONAL {\n' : ''}
          ?mandataris org:hasMembership ?lidmaatschap.
          ?lidmaatschap org:organisation ?fractie.
          ${fractieIds.length >= 1 ? '?fractie mu:uuid ?fractieId.' : ''}
        ${isOptional ? '}' : ''}
        ${hasFilterOnOnafhankelijkeFractie == 'true' ? filterOnafhankelijk : ''}
      } 
    `;
}

async function getPropertiesOfMandatarissen(
  mandatarisUris: Array<string>,
  bestuursorgaanInTijdId: string | null,
  sort: { ascOrDesc: 'ASC' | 'DESC'; filterProperty: string } | null,
  withFilterNietBeschikbaar: boolean,
): Promise<Array<{ [key: string]: string }>> {
  let sortFilter: string | null = null;
  let bestuursorgaanInTijdFilter: string | null = null;
  let nietBeschikbaarFilter: string | null = null;

  if (sort) {
    sortFilter = `
      ORDER BY ${sort.ascOrDesc}(${sort.filterProperty})
    `;
  }

  if (withFilterNietBeschikbaar) {
    nietBeschikbaarFilter = 'FILTER(!BOUND(?lidmaatschap) || !BOUND(?fractie))';
  }

  if (bestuursorgaanInTijdId) {
    bestuursorgaanInTijdFilter = `?bestuursorgaanInTijd mu:uuid ${sparqlEscapeString(
      bestuursorgaanInTijdId,
    )}.`;
  }

  const escapedUriValues = mandatarisUris
    .map((uri) => sparqlEscapeUri(uri))
    .join('\n');
  const queryString = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>

    SELECT DISTINCT ?mandataris ?mandaatLabel ?publicatieStatusLabel ?rangorde (GROUP_CONCAT(DISTINCT ?beleidsdomeinLabel; SEPARATOR="; ") AS ?beleidsdomeinen) ?statusLabel ?fName ?lName ?start ?einde ?fractieLabel ?bestuursorgaanLabel
    WHERE {
      VALUES ?mandataris { ${escapedUriValues} }
      ?mandataris a mandaat:Mandataris.
      ?mandataris org:holds ?mandaat.
      ?mandataris mandaat:status ?status.
      ?mandataris mandaat:start ?start.

      ?status skos:prefLabel ?statusLabel.

      ?mandaat org:role ?bestuursfunctie.
      ?bestuursfunctie skos:prefLabel ?mandaatLabel.

      ?mandaat ^org:hasPost ?bestuursorgaanInTijd.
      ?bestuursorgaanInTijd mandaat:isTijdspecialisatieVan ?bestuursorgaan. 
      ${bestuursorgaanInTijdFilter ?? ''}
      ?bestuursorgaan skos:prefLabel ?bestuursorgaanLabel.

      ?mandataris mandaat:isBestuurlijkeAliasVan ?persoon.

      OPTIONAL {
        ?mandataris lmb:hasPublicationStatus ?publicatieStatusCode.
        ?publicatieStatusCode skos:prefLabel ?publicatieStatusLabel.
      }
      
      OPTIONAL {
        ?mandataris mandaat:rangorde ?rangorde.
      }
    
      OPTIONAL {
        ?mandataris mandaat:beleidsdomein ?beleidsdomeinCode.
        ?beleidsdomeinCode skos:prefLabel ?beleidsdomeinLabel.
      }

      OPTIONAL {
        ?persoon persoon:gebruikteVoornaam ?fName.
      }
      OPTIONAL {
        ?persoon foaf:familyName ?lName.
      }

      OPTIONAL {
        ?mandataris org:hasMembership ?lidmaatschap.
        ?lidmaatschap org:organisation ?fractie.
        ?fractie regorg:legalName ?fractieLabel.
      }
      OPTIONAL {
        ?mandataris mandaat:einde ?einde.
      }
      ${nietBeschikbaarFilter ?? ''}
    }
    ${sortFilter ?? ''}
  `;

  const sparqlResult = await query(queryString);

  return getSparqlResults(sparqlResult).map((result) => {
    return {
      voornaam: result.fName?.value ?? '',
      naam: result.lName?.value ?? '',
      fractie: result.fractieLabel?.value ?? '',
      mandaat: result.mandaatLabel?.value ?? '',
      status: result.statusLabel?.value ?? '',
      orgaan: result.bestuursorgaanLabel?.value ?? '',
      startMandaat: result.start?.value ?? '',
      eindeMandaat: result.einde?.value ?? '',
      publicatieStatus: result.publicatieStatusLabel?.value ?? '',
      rangorde: result.rangorde?.value ?? '',
      beleidsdomeinen: result.beleidsdomeinen?.value ?? '',
    };
  });
}
