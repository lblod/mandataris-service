import { querySudo } from '@lblod/mu-auth-sudo';
import { expect } from '@jest/globals';
import { sessionId } from './requestUtils';



export async function expectQueryToHaveResults(
  query: string,
  extraHeaders = {},
) {
  const result = await querySudo(query, extraHeaders);
  expect(result.results.bindings.length).toBeGreaterThan(0);
}

export async function expectQueryToHaveNoResults(
  query: string,
  extraHeaders = {},
) {
  const result = await querySudo(query, extraHeaders);
  expect(result.results.bindings.length).toBe(0);
}

export async function expectUserQueryToHaveResults(query: string) {
  const result = await querySudo(query, {
    'mu-auth-sudo': 'false',
    'mu-session-id': sessionId,
  });
  expect(result.results.bindings.length).toBeGreaterThan(0);
}

export async function expectUserQueryToHaveNoResults(query: string) {
  const result = await querySudo(query, {
    'mu-auth-sudo': 'false',
    'mu-session-id': sessionId,
  });
  expect(result.results.bindings.length).toBe(0);
}
