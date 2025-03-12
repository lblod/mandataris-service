import { querySudo } from '@lblod/mu-auth-sudo';
import { expect } from '@jest/globals';
import { getSession } from './requestUtils';
const deltaPropagationTimeout = parseInt(
  process.env.DELTA_PROPAGATION_TIMEOUT || '200',
);

export async function expectQueryToHaveResults(
  query: string,
  extraHeaders = {},
) {
  const result = await querySudo(query, extraHeaders);
  expect(result.results.bindings.length).toBeGreaterThan(0);
}

export async function runSudoQuery(query: string, extraHeaders = {}) {
  const result = await querySudo(query, extraHeaders);
  return result.results.bindings;
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
    'mu-session-id': getSession(),
  });
  expect(result.results.bindings.length).toBeGreaterThan(0);
}

export async function runUserQuery(query: string) {
  const result = await querySudo(query, {
    'mu-auth-sudo': 'false',
    'mu-session-id': getSession(),
  });
  return result.results.bindings;
}

export async function expectUserQueryToHaveNoResults(query: string) {
  const result = await querySudo(query, {
    'mu-auth-sudo': 'false',
    'mu-session-id': getSession(),
  });
  expect(result.results.bindings.length).toBe(0);
}

export async function getDeltas() {
  await new Promise((resolve) => setTimeout(resolve, deltaPropagationTimeout));
  return globalThis.deltas;
}

export async function clearDeltas() {
  await new Promise((resolve) => setTimeout(resolve, deltaPropagationTimeout));
  globalThis.deltas.splice(0, globalThis.deltas.length);
}
