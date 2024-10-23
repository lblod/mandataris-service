import { query, sparqlEscapeString } from 'mu';
import { getSparqlResults } from '../util/sparql-result';
import { sparqlEscapeUri } from '../util/mu';

import moment from 'moment';

export const downloadMandatarissen = {
  getWithFilters,
  getPropertiesOfMandatarissen,
};

async function getWithFilters(filters) {
  const { bestuursperiodeId, bestuursorgaanId } = filters;
  let bestuursorgaanFilter: string | null = null;

  if (bestuursorgaanId) {
    bestuursorgaanFilter = `
      ?mandaat ^org:hasPost ?bestuursorgaan.
      ?bestuursorgaan mu:uuid ${sparqlEscapeString(bestuursorgaanId)}.
    `;
  }

  // TODO: remove limit/
  const queryString = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT DISTINCT ?mandataris
    WHERE {
      ?mandataris a mandaat:Mandataris.
      ?mandataris org:holds ?mandaat.

      ?bestuursorgaan lmb:heeftBestuursperiode ?bestuurspriode.
      ?bestuursperiode mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.

      ${bestuursorgaanFilter ?? ''}
    }
  `;

  const sparqlResult = await query(queryString);

  return getSparqlResults(sparqlResult).map((res) => res.mandataris.value);
}

async function getPropertiesOfMandatarissen(
  mandatarisUris: Array<string>,
): Promise<Array<any>> {
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

    SELECT DISTINCT ?mandataris ?mandaatLabel ?statusLabel ?fName ?saveLName ?start ?saveEinde ?saveFractieLabel ?bestuursorgaanLabel
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

      BIND(IF(BOUND(?lName), ?lName, """Ongekend""") AS ?saveLName).
      BIND(IF(BOUND(?fractieLabel), ?fractieLabel, """Ongekend""") AS ?saveFractieLabel).
      BIND(IF(BOUND(?einde), ?einde, """Ongekend""") AS ?saveEinde).
    }
  `;

  const sparqlResult = await query(queryString);

  return getSparqlResults(sparqlResult).map((result) => {
    return {
      voornaam: result.fName?.value,
      naam: result.saveLName.value,
      fractie: result.saveFractieLabel.value,
      mandaat: result.mandaatLabel?.value,
      status: result.statusLabel?.value,
      orgaan: result.bestuursorgaanLabel?.value ?? 'Ongekend',
      startMandaat: result.start?.value
        ? moment(result.start?.value).format('DD-MM-YYYY')
        : 'Ongekend',
      eindeMandaat:
        result.saveEinde.value === 'Ongekend'
          ? result.saveEinde.value
          : moment(result.saveEinde.value).format('DD-MM-YYYY'),
    };
  });
}
