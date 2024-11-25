import { findFirstSparqlResult, getBooleanSparqlResult } from './sparql-result';
import { query, sparqlEscapeString } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';

export async function isValidId(
  rdfType: RDF_TYPE,
  id?: string,
  sudo: boolean = false,
): Promise<boolean> {
  if (!id) {
    return false;
  }

  const askQuery = `
    ${PREFIXES}

    ASK {
      ?entity a ${rdfType} ;
        mu:uuid ${sparqlEscapeString(id)} .
    }
  `;
  const result = sudo ? await querySudo(askQuery) : await query(askQuery);

  return getBooleanSparqlResult(result);
}

export async function areIdsValid(
  rdfType: RDF_TYPE,
  ids?: Array<string>,
): Promise<boolean> {
  if (!ids || ids.length === 0) {
    return false;
  }

  const values = ids.map((id) => sparqlEscapeString(id));
  const countOfExisting = `
    ${PREFIXES}

    SELECT (COUNT(DISTINCT ?entity ) as ?count)
    WHERE {
      VALUES ?entityId { ${values.join('\n')} }
        ?entity a ${rdfType}.
        ?entity mu:uuid ?entityId.
    }
  `;
  const sparqlResult = await query(countOfExisting);
  const result = findFirstSparqlResult(sparqlResult);
  if (!result) {
    return false;
  }

  const count = parseInt(result.count?.value);
  return !isNaN(count) && count === ids.length;
}

// Make sure the prefix is available in the PREFIXES array
export enum RDF_TYPE {
  BESTUURSFUNCTIE_CODE = 'ext:BestuursfunctieCode',
  BESTUURSORGAAN = 'besluit:Bestuursorgaan',
  BESTUURSPERIODE = 'lmb:Bestuursperiode',
  FRACTIE = 'mandaat:Fractie',
  MANDATARIS = 'mandaat:Mandataris',
  PERSON = 'person:Person',
}

const PREFIXES = `
PREFIX adms: <http://www.w3.org/ns/adms#>
PREFIX adres: <https://data.vlaanderen.be/ns/adres#>
PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
PREFIX ch: <http://data.lblod.info/vocabularies/contacthub/>
PREFIX code: <http://lblod.data.gift/vocabularies/organisatie/>
PREFIX dbpedia: <http://dbpedia.org/ontology/>
PREFIX dc_terms: <http://purl.org/dc/terms/>
PREFIX ere: <http://data.lblod.info/vocabularies/erediensten/>
PREFIX euro: <http://data.europa.eu/m8g/>
PREFIX euvoc: <http://publications.europa.eu/ontology/euvoc#>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX generiek: <http://data.vlaanderen.be/ns/generiek#>
PREFIX lblodlg: <https://data.lblod.info/vocabularies/leidinggevenden/>
PREFIX locn: <http://www.w3.org/ns/locn#>
PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX org: <http://www.w3.org/ns/org#>
PREFIX organisatie: <https://data.vlaanderen.be/ns/organisatie#>
PREFIX person: <http://www.w3.org/ns/person#>
PREFIX persoon: <https://data.vlaanderen.be/ns/persoon#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX regorg: <https://www.w3.org/ns/regorg#>
PREFIX schema: <http://schema.org/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>`;
