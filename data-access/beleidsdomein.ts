import { sparqlEscapeString, sparqlEscapeUri, query } from 'mu';
import { v4 as uuidv4 } from 'uuid';

export const ensureBeleidsdomeinen = async (beleidsdomeinen: string[]) => {
  const existing = await getExistingBeleidsdomeinen(beleidsdomeinen);
  const missing = beleidsdomeinen.filter((name) => !existing[name]);
  const created = await createMissingBeleidsdomeinen(missing);
  return { existing, created };
};

const getExistingBeleidsdomeinen = async (beleidsdomeinen: string[]) => {
  const q = `
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

  SELECT ?uri ?label WHERE {
    ?uri a skos:Concept;
        skos:prefLabel ?label;
        skos:inScheme <http://data.vlaanderen.be/id/conceptscheme/BeleidsdomeinCode>.
    VALUES ?label {
      ${beleidsdomeinen.map(sparqlEscapeString).join('\n')}
    }
  }`;

  const result = await query(q);
  const mapping: { [key: string]: string } = {};
  result.results.bindings.forEach((binding) => {
    mapping[binding.label.value] = binding.uri.value;
  });
  return mapping;
};

const createMissingBeleidsdomeinen = async (beleidsdomeinen: string[]) => {
  const concepts = beleidsdomeinen.map((name) => {
    const uuid = uuidv4();
    const uri = `http://data.vlaanderen.be/id/concept/BeleidsdomeinCode/${uuid}`;
    return {
      uri,
      uuid,
      name,
    };
  });

  const inserts = concepts.map((concept) => {
    return `${sparqlEscapeUri(concept.uri)} a skos:Concept;
      mu:uuid ${sparqlEscapeString(concept.uuid)};
      skos:prefLabel ${sparqlEscapeString(concept.name)};
      skos:inScheme <http://data.vlaanderen.be/id/conceptscheme/BeleidsdomeinCode> ;
      skos:topConceptOf <http://data.vlaanderen.be/id/conceptscheme/BeleidsdomeinCode> .`;
  });

  const q = `
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/application> {
      ${inserts.join('\n')}
    }
  }`;
  await query(q);

  const mapping: { [key: string]: string } = {};
  concepts.forEach((concept) => {
    mapping[concept.name] = concept.uri;
  });
  return mapping;
};
