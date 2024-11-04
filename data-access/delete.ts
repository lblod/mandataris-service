import { query, sparqlEscapeDateTime, sparqlEscapeString } from 'mu';

export const deleteInstanceWithTombstone = async (id: string) => {
  const q = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX astreams: <http://www.w3.org/ns/activitystreams#>

  DELETE {
      ?uri ?p ?o.
  }
  INSERT {
      ?uri a astreams:Tombstone ;
         astreams:deleted ${sparqlEscapeDateTime(new Date())} ;
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
