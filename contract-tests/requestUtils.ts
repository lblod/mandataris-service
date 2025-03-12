let sessionUri = '';
import { v4 as uuidv4 } from 'uuid';
import { querySudo } from '@lblod/mu-auth-sudo';

export async function setSession(newSessionUri: string) {
  sessionUri = newSessionUri;
}

export async function getSession() {
  return sessionUri;
}

export async function mockLogin(groupUri, accountUri, roleName) {
  const id = uuidv4();
  const uri = `http://data.lblod.info/id/sessions/${id}`;
  const query = `              INSERT DATA {

                GRAPH <http://mu.semte.ch/graphs/sessions> {
                  <${uri}> <http://mu.semte.ch/vocabularies/session/account> <${accountUri}> .
                  <${uri}> <http://purl.org/dc/terms/modified> "${new Date().toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
                  <${uri}> <http://mu.semte.ch/vocabularies/ext/sessionGroup> <${groupUri}> .
                  <${uri}> <http://mu.semte.ch/vocabularies/core/uuid> "${id}" .
                  <${uri}> <http://mu.semte.ch/vocabularies/ext/sessionRole> "${roleName}" .
                }
              }`;
  await querySudo(query);
  sessionUri = uri;
  return uri;
}

export async function userRequest(
  method: string,
  url: string,
  body: unknown = undefined,
  extraHeaders = {},
) {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'mu-session-id': sessionUri,
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseBody = await response.text();
  const headers = response.headers;
  const status = response.status;
  if (process.env.LOG_RESPONSES) {
    console.log(`Response from ${url}:
      status: ${status}
      body: ${body}`);
  }
  return {
    status,
    body: responseBody,
    headers,
  };
}
