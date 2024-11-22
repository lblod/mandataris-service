import { query, sparqlEscapeDateTime, sparqlEscapeString } from 'mu';

export const deleteInstanceWithTombstone = async (id: string) => {
  const now = new Date();
  const q = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX astreams: <http://www.w3.org/ns/activitystreams#>
  PREFIX dct: <http://purl.org/dc/terms/>

  DELETE {
      ?uri ?p ?o.
  }
  INSERT {
      ?uri a astreams:Tombstone ;
         astreams:deleted ${sparqlEscapeDateTime(now)} ;
         dct:modified ${sparqlEscapeDateTime(now)} ;
         astreams:formerType ?type .
  }
  WHERE {
      ?uri mu:uuid ${sparqlEscapeString(id)} ;
         a ?type ;
         ?p ?o .
  }
  `;
  await query(q);
};
