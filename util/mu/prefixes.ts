import { sparqlEscapeUri } from 'mu';

const mapping = {
  mu: 'http://mu.semte.ch/vocabularies/core/',
  besluit: 'http://data.vlaanderen.be/ns/besluit#',
  mandaat: 'http://data.vlaanderen.be/ns/mandaat#',
  org: 'http://www.w3.org/ns/org#',
  lmb: 'http://lblod.data.gift/vocabularies/lmb/',
  ext: 'http://mu.semte.ch/vocabularies/ext/',
  person: 'http://www.w3.org/ns/person#',
  extlmb: 'http://mu.semte.ch/vocabularies/ext/lmb/',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  astreams: 'http://www.w3.org/ns/activitystreams#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  persoon: 'http://data.vlaanderen.be/ns/persoon#',
  adms: 'http://www.w3.org/ns/adms#',
  regorg: 'https://www.w3.org/ns/regorg#',
  muAccount: 'http://mu.semte.ch/vocabularies/account/',
  foaf: 'http://xmlns.com/foaf/0.1/',
  dcterms: 'http://purl.org/dc/terms/',
  dct: 'http://purl.org/dc/terms/',
  nfo: 'http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#',
  dbp: 'http://dbpedia.org/ontology/',
  nie: 'http://www.semanticdesktop.org/ontologies/2007/01/19/nie#',
  session: 'http://mu.semte.ch/vocabularies/session/',
  generiek: 'http://data.vlaanderen.be/ns/generiek#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  owl: 'http://www.w3.org/2002/07/owl#',
  schema: 'http://schema.org/',
};

export function getPrefixesForQuery(sparqlQuery: string) {
  const prefixes: string[] = [];

  for (const key in mapping) {
    if (sparqlQuery.includes(`${key}:`)) {
      prefixes.push(`PREFIX ${key}: ${sparqlEscapeUri(mapping[key])}`);
    }
  }

  return prefixes;
}
