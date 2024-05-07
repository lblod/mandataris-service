import { query, sparqlEscapeDateTime, sparqlEscapeString } from 'mu';

export const deleteMandataris = async (id: string) => {
  const q = `
  PREFIX realMu: <http://mu.semte.ch/vocabularies/core/>
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
      ?uri realMu:uuid ${sparqlEscapeString(id)} ;
         a ?type ;
         ?p ?o .
  }
  `;
  const result = await query(q);
  return result;
};
