import { json2csv } from 'json-2-csv';

import { HttpError } from './http-error';
import { STATUS_CODE } from './constants';

export async function jsonToCsv(jsonArray) {
  if (!jsonArray || jsonArray.length === 0) {
    return '';
  }

  let csvString = '';
  try {
    csvString = await json2csv(jsonArray);
  } catch (error) {
    throw new HttpError(
      'Something went wrong while parsing json to a csv string.',
      STATUS_CODE.INTERNAL_SERVER_ERROR,
    );
  }

  return csvString;
}

export function queryResultToJson(queryResult) {
  const bindings = queryResult.results.bindings;
  const headers = queryResult.head.vars;

  return bindings.map((binding) => {
    const unpacked = {};
    for (const headerKey of headers) {
      unpacked[headerKey] = binding[headerKey] ? binding[headerKey].value : '';
    }
    return unpacked;
  });
}
