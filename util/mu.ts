import {
  sparqlEscapeUri as mu_sparqlEscapeUri,
  sparqlEscapeString as mu_sparqlEscapeString,
  sparqlEscapeDateTime as mu_sparqlEscapeDateTime,
} from 'mu';

export function sparqlEscapeString(stringValue: string) {
  if (!stringValue || typeof stringValue !== 'string') {
    throw Error(
      `Could not sparql escape string from passed value: ${stringValue}`,
    );
  }

  return mu_sparqlEscapeString(stringValue);
}

export function sparqlEscapeUri(uri: string) {
  if (!uri || typeof uri !== 'string') {
    throw Error(`Could not sparql escape uri from passed value: ${uri}`);
  }

  return mu_sparqlEscapeUri(uri);
}

export function sparqlEscapeDateTime(date: Date) {
  if (!date) {
    throw Error(`Could not sparql escape datetime from passed value: ${date}`);
  }

  return mu_sparqlEscapeDateTime(date);
}
