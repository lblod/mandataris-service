import { Request } from 'express';

import { querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri, sparqlEscapeString } from 'mu';

import { HttpError } from '../util/http-error';

const VENDOR_KALLIOPE_URI = 'http://data.lblod.info/vendors/kalliope';
const AUTOMATIC_SUBMISSION_GRAPH_URI =
  'http://mu.semte.ch/graphs/automatic-submission';

export const checkAuthorization = async (req: Request) => {
  const authorization = req.get('authorization');
  if (!authorization) {
    throw new HttpError('Unauthorized', 401);
  }
  const token = authorization.split('Basic ')[1];
  if (!token) {
    throw new HttpError('Unauthorized', 401);
  }
  const decodedToken = decodeURIComponent(atob(token));
  const [http, username, password] = decodedToken.split(':');
  const reconstructedUsername = [http, username].join(':');

  const sparql = `
    PREFIX muAccount: <http://mu.semte.ch/vocabularies/account/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT ?vendor WHERE {
      GRAPH ${sparqlEscapeUri(AUTOMATIC_SUBMISSION_GRAPH_URI)} {
        ?vendor a foaf:Agent, ext:Vendor ;
        muAccount:canActOnBehalfOf ${sparqlEscapeUri(VENDOR_KALLIOPE_URI)} ;
        muAccount:key ${sparqlEscapeString(password)} .
        VALUES ?vendor {
          ${sparqlEscapeUri(reconstructedUsername)}
        }
      }
    } LIMIT 1`;

  const result = await querySudo(sparql);
  if (result.results.bindings.length == 0) {
    throw new HttpError('Unauthorized', 401);
  }
};
