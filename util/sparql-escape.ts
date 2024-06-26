import { Term } from './types';
import { sparqlEscapeUri, sparqlEscapeDateTime, sparqlEscapeString } from 'mu';

export enum TERM_TYPE {
  URI = 'uri',
  STRING = 'string',
  DATETIME = 'dateTime',
}
export function sparqlEscapeTermValue(term: Term): string {
  const mapping = {
    [TERM_TYPE.URI]: () => sparqlEscapeUri(term.value),
    [TERM_TYPE.STRING]: () => sparqlEscapeString(term.value),
    [TERM_TYPE.DATETIME]: () => sparqlEscapeDateTime(term.value),
  };

  if (!Object.keys(mapping).includes(term.type)) {
    throw Error(`Unknown TERM_TYPE: ${term.type}`);
  }

  return mapping[term.type]();
}
