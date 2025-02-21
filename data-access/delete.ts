import { query, sparqlEscapeDateTime, sparqlEscapeString } from 'mu';
import { updateSudo } from '@lblod/mu-auth-sudo';
import { areIdsValid, RDF_TYPE } from '../util/valid-id';
import { HttpError } from '../util/http-error';
import { findLinkedInstance } from './linked-mandataris';

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

export const deleteMandatarisWithTombstone = async (
  id: string,
  removeLinked: boolean,
) => {
  const canAccessMandataris = areIdsValid(RDF_TYPE.MANDATARIS, [id]);
  if (!canAccessMandataris) {
    throw new HttpError('No mandataris with given id found', 404);
  }

  const ids = [id];
  if (removeLinked) {
    const linked = await findLinkedInstance(id);
    if (linked && linked.id) {
      ids.push(linked.id);
    }
  }

  const safeIds = ids.map((id) => sparqlEscapeString(id)).join('\n');

  const now = new Date();
  const q = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX astreams: <http://www.w3.org/ns/activitystreams#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  DELETE {
    GRAPH ?g {
      ?uri ?p ?o.
      ?other mandaat:isTijdelijkVervangenDoor ?uri.
    }
  }
  INSERT {
    GRAPH ?g {
      ?uri a astreams:Tombstone ;
         astreams:deleted ${sparqlEscapeDateTime(now)} ;
         dct:modified ${sparqlEscapeDateTime(now)} ;
         astreams:formerType ?type .
    }
  }
  WHERE {
    VALUES ?id {
      ${safeIds}
    }
    GRAPH ?g {
      ?uri mu:uuid ?id ;
         a ?type ;
         ?p ?o .
      OPTIONAL {
        ?other mandaat:isTijdelijkVervangenDoor ?uri.
      }
    }
    ?g ext:ownedBy ?someone.
  }
  `;
  await updateSudo(q);
};
