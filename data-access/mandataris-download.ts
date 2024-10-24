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
    fractieIds,
    bestuursFunctieCodeIds,
  } = filters;
  let bestuursorgaanFilter: string | null = null;
  let onlyActiveFilter: string | null = null;
  let persoonFilter: string | null = null;
  let fractieFilter: string | null = null;
  let mandaatTypeFilter: string | null = null;

  if (bestuursorgaanId) {
    bestuursorgaanFilter = `
      ?mandaat ^org:hasPost ?bestuursorgaan.
      ?bestuursorgaan mu:uuid ${sparqlEscapeString(bestuursorgaanId)}.
    `;
  }
  if (filters.onlyShowActive) {
    const escapedTodaysDate = sparqlEscapeDateTime(new Date());
    onlyActiveFilter = `
      ?mandataris mandaat:einde ?einde.

      ?bestuursorgaan mandaat:bindingStart ?startBestuursorgaan. 
      ?bestuursorgaan mandaat:bindingEinde ?eindeBestuursorgaan. 

      FILTER (
        ?einde <= ?eindeBestuursorgaan &&
        ?einde >= ?startBestuursorgaan &&
        ?einde >= ${escapedTodaysDate}
      )
    `;
  }

  if (persoonIds.length >= 1) {
    const idValues = persoonIds.map((id) => sparqlEscapeString(id)).join(' ');
    persoonFilter = `
      VALUES ?persoonId { ${idValues} }

      ?mandataris mandaat:isBestuurlijkeAliasVan ?persoon.
      ?persoon mu:uuid ?persoonId.
    `;
  }

  if (fractieIds.length >= 1) {
    const idValues = fractieIds.map((id) => sparqlEscapeString(id)).join(' ');
    fractieFilter = `
      VALUES ?fractieId { ${idValues} }

      ?mandataris org:hasMembership ?lidmaatschap.
      ?lidmaatschap org:organisation ?fractie.
      ?fractie mu:uuid ?fractieId.
    `;
  }

  if (bestuursFunctieCodeIds.length >= 1) {
    const idValues = bestuursFunctieCodeIds
      .map((id) => sparqlEscapeString(id))
      .join(' ');
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


    SELECT DISTINCT ?mandataris
    WHERE {
      ?mandataris a mandaat:Mandataris.
      ?mandataris org:holds ?mandaat.

      ?bestuursorgaan lmb:heeftBestuursperiode ?bestuurspriode.
      ?bestuursperiode mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.

      ${bestuursorgaanFilter ?? ''}
      ${onlyActiveFilter ?? ''}
      ${persoonFilter ?? ''}
      ${fractieFilter ?? ''}
      ${mandaatTypeFilter ?? ''}
    }
  `;

  const sparqlResult = await query(queryString);

  return getSparqlResults(sparqlResult).map((res) => res.mandataris.value);
}

async function getPropertiesOfMandatarissen(
  mandatarisUris: Array<string>,
  sort: { ascOrDesc: 'ASC' | 'DESC'; filterProperty: string } | null,
): Promise<Array<any>> {
  let sortFilter: string | null = null;

  if (sort) {
    sortFilter = `
      ORDER BY ${sort.ascOrDesc}(${sort.filterProperty})
    `;
  }

  const escapedUriValues = mandatarisUris
    .map((uri) => sparqlEscapeUri(uri))
    .join(' ');
  const queryString = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>

    SELECT DISTINCT ?mandataris ?mandaatLabel ?savePublicatieStatusLabel ?saveRangorde (GROUP_CONCAT(DISTINCT ?beleidsdomeinLabel; SEPARATOR=", ") AS ?beleidsdomeinen) ?saveStatusLabel ?fName ?saveLName ?start ?saveEinde ?saveFractieLabel ?bestuursorgaanLabel
    WHERE {
      VALUES ?mandataris { ${escapedUriValues} }
      ?mandataris a mandaat:Mandataris.
      ?mandataris org:holds ?mandaat.
      ?mandataris mandaat:status ?status.
      ?mandataris mandaat:start ?start.

      ?status skos:prefLabel ?statusLabel.

      ?mandaat org:role ?bestuursfunctie.
      ?bestuursfunctie skos:prefLabel ?mandaatLabel.

      ?mandaat ^org:hasPost ?bestuursorgaan.
      ?bestuursorgaan mandaat:isTijdspecialisatieVan ?bestuursorgaanInTijd. 
      ?bestuursorgaanInTijd skos:prefLabel ?bestuursorgaanLabel.

      ?mandataris mandaat:isBestuurlijkeAliasVan ?persoon.
      ?persoon persoon:gebruikteVoornaam ?fName.

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

      BIND(IF(BOUND(?statusLabel), ?statusLabel, """""") AS ?saveStatusLabel).
      BIND(IF(BOUND(?publicatieStatusLabel), ?publicatieStatusLabel, """""") AS ?savePublicatieStatusLabel).
      BIND(IF(BOUND(?rangorde), ?rangorde, """""") AS ?saveRangorde).
      BIND(IF(BOUND(?beleidsdomeinLabel), ?beleidsdomeinLabel, """""") AS ?saveBeleidsdomeinLabel).
      BIND(IF(BOUND(?lName), ?lName, """""") AS ?saveLName).
      BIND(IF(BOUND(?fractieLabel), ?fractieLabel, """""") AS ?saveFractieLabel).
      BIND(IF(BOUND(?einde), ?einde, """""") AS ?saveEinde).
    }
    ${sortFilter ?? ''}
  `;

  const sparqlResult = await query(queryString);

  return getSparqlResults(sparqlResult).map((result) => {
    return {
      voornaam: result.fName?.value ?? '',
      naam: result.saveLName.value,
      fractie: result.saveFractieLabel.value,
      mandaat: result.mandaatLabel?.value ?? '',
      status: result.saveStatusLabel.value,
      orgaan: result.bestuursorgaanLabel?.value ?? '',
      startMandaat: result.start?.value ?? '',
      eindeMandaat: result.saveEinde?.value,
      publicatieStatus: result.savePublicatieStatusLabel.value,
      rangorde: result.saveRangorde.value,
      beleidsdomeinen: result.beleidsdomeinen?.value ?? '',
    };
  });
}
