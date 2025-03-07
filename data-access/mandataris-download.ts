import { query, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { getSparqlResults } from '../util/sparql-result';
import { queryResultToJson } from '../util/json-to-csv';

export const downloadMandatarissen = {
  getUrisForFilters,
  getPropertiesOfMandatarissen,
};

async function getUrisForFilters(filters) {
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
      ?bestuursorgaanInTijd org:hasPost ?mandaat.
      ?bestuursorgaanInTijd mu:uuid ${sparqlEscapeString(bestuursorgaanId)}.
    `;
  }
  if (filters.activeOnly) {
    onlyActiveFilter = `
      OPTIONAL {
        ?mandataris mandaat:einde ?einde.
      }
      BIND(IF(BOUND(?einde), ?einde, "3000-01-01"^^xsd:dateTime) AS ?safeEinde)
      BIND(NOW() AS ?now)
      FILTER (?now <= ?safeEinde)
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
      ${createFractieFilter(filters)}
      ${mandaatTypeFilter ?? ''}
    }
  `;

  const sparqlResult = await query(queryString);

  return getSparqlResults(sparqlResult).map((res) => res.mandataris.value);
}

function createFractieFilter(filters): string {
  const {
    fractieIds,
    hasFilterOnOnafhankelijkeFractie,
    hasFilterOnNietBeschikbareFractie,
  } = filters;

  if (
    fractieIds.length === 0 &&
    !hasFilterOnNietBeschikbareFractie &&
    !hasFilterOnOnafhankelijkeFractie
  ) {
    return '';
  }

  const idValues = fractieIds.map((id) => sparqlEscapeString(id)).join('\n');
  const unions = [
    {
      apply: fractieIds.length >= 1,
      filter: `
        {
          ?mandataris org:hasMembership ?lidmaatschap.
          ?lidmaatschap org:organisation ?fractie.

          VALUES ?fractieId {\n ${idValues} }
          ?fractie mu:uuid ?fractieId.
        }
      `,
    },
    {
      apply: hasFilterOnOnafhankelijkeFractie,
      filter: `
        {
          ?mandataris org:hasMembership ?lidmaatschap.
          ?lidmaatschap org:organisation ?fractie.

          ?fractie ext:isFractietype fractieType:Onafhankelijk.
        }
      `,
    },
    {
      apply: hasFilterOnNietBeschikbareFractie,
      filter: `
        {
          FILTER NOT EXISTS {
            ?mandataris org:hasMembership ?lidmaatschap.
            ?lidmaatschap org:organisation ?fractie.
          }
        }
      `,
    },
  ];
  const unionFilters = unions
    .filter((union) => union.apply)
    .map((union) => union.filter)
    .join('\n UNION ');

  return `{ ${unionFilters} }`;
}

async function getPropertiesOfMandatarissen(
  mandatarisUris: Array<string>,
  bestuursorgaanInTijdId: string | null,
  sort: { ascOrDesc: 'ASC' | 'DESC'; filterProperty: string } | null,
): Promise<Array<{ [key: string]: string }>> {
  let sortFilter: string | null = null;
  let bestuursorgaanInTijdFilter: string | null = null;

  if (sort) {
    sortFilter = `
      ORDER BY ${sort.ascOrDesc}(${sort.filterProperty})
    `;
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

    SELECT
      ?Voornaam
      ?Naam
      (?fractieLabel as ?Fractie)
      (?mandaatLabel as ?Mandaat)
      (?statusLabel as ?Status)
      (?bestuursorgaanLabel as ?Orgaan)
      (?start as ?StartMandaat)
      (?einde as ?EindeMandaat)
      (?publicatieStatusLabel as ?PublicatieStatus)
      ?Rangorde
      (GROUP_CONCAT(DISTINCT ?beleidsdomeinLabel; SEPARATOR=" / ") AS ?Beleidsdomeinen)
    WHERE {
      VALUES ?mandataris { ${escapedUriValues} }
      ?mandataris a mandaat:Mandataris.
      ?mandataris org:holds ?mandaat.
      ?mandataris mandaat:start ?start.

      OPTIONAL {
        ?mandataris mandaat:status ?status.
        ?status skos:prefLabel ?statusLabel.
      }

      ?mandaat org:role ?bestuursfunctie.
      ?bestuursfunctie skos:prefLabel ?mandaatLabel.

      ?bestuursorgaanInTijd org:hasPost ?mandaat.
      ?bestuursorgaanInTijd mandaat:isTijdspecialisatieVan ?bestuursorgaan.
      ${bestuursorgaanInTijdFilter ?? ''}
      ?bestuursorgaan skos:prefLabel ?bestuursorgaanLabel.

      ?mandataris mandaat:isBestuurlijkeAliasVan ?persoon.

      OPTIONAL {
        ?mandataris lmb:hasPublicationStatus ?publicatieStatusCode.
        ?publicatieStatusCode skos:prefLabel ?publicatieStatusLabel.
      }

      OPTIONAL {
        ?mandataris mandaat:rangorde ?Rangorde.
      }

      OPTIONAL {
        ?mandataris mandaat:beleidsdomein ?beleidsdomeinCode.
        ?beleidsdomeinCode skos:prefLabel ?beleidsdomeinLabel.
      }

      OPTIONAL {
        ?persoon persoon:gebruikteVoornaam ?Voornaam.
      }
      OPTIONAL {
        ?persoon foaf:familyName ?Naam.
      }

      OPTIONAL {
        ?mandataris org:hasMembership ?lidmaatschap.
        ?lidmaatschap org:organisation ?fractie.
        ?fractie regorg:legalName ?fractieLabel.
      }
      OPTIONAL {
        ?mandataris mandaat:einde ?einde.
      }
    }
    ${sortFilter ?? ''}
  `;

  const sparqlResult = await query(queryString);

  return queryResultToJson(sparqlResult);
}
