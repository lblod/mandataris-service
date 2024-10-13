import { Term } from '../types';
import {
  sparqlEscapeUri,
  sparqlEscape,
  sparqlEscapeDateTime,
  sparqlEscapeString,
} from 'mu';

export enum TERM_TYPE {
  URI = 'uri',
  STRING = 'string',
  LITERAL = 'literal',
  DATETIME = 'dateTime',
  TYPED_LITERAL = 'typed-literal',
}
export function sparqlEscapeTermValue(term: Term): string {
  const mapping = {
    [TERM_TYPE.URI]: () => sparqlEscapeUri(term.value),
    [TERM_TYPE.STRING]: () => sparqlEscapeString(term.value),
    [TERM_TYPE.LITERAL]: () => sparqlEscapeString(term.value),
    [TERM_TYPE.TYPED_LITERAL]: () => sparqlEscapeString(term.value),
    [TERM_TYPE.DATETIME]: () => sparqlEscapeDateTime(term.value),
  };

  if (!Object.keys(mapping).includes(term.type)) {
    throw Error(`Unknown TERM_TYPE: ${term.type}`);
  }

  return mapping[term.type]();
}

export function sparqlEscapeQueryBinding(binding: {
  type: string;
  value: string;
  datatype: string;
}) {
  const datatypeNames = {
    'http://www.w3.org/2001/XMLSchema#dateTime': 'dateTime',
    'http://www.w3.org/2001/XMLSchema#datetime': 'dateTime',
    'http://www.w3.org/2001/XMLSchema#date': 'date',
    'http://www.w3.org/2001/XMLSchema#decimal': 'decimal',
    'http://www.w3.org/2001/XMLSchema#integer': 'int',
    'http://www.w3.org/2001/XMLSchema#float': 'float',
    'http://www.w3.org/2001/XMLSchema#boolean': 'bool',
  };
  const escapeType = datatypeNames[binding.datatype] || 'string';
  return binding.type === 'uri'
    ? sparqlEscapeUri(binding.value)
    : sparqlEscape(binding.value, escapeType);
}
