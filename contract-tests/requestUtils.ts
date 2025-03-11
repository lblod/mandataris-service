export let sessionUri = '';

export async function setSession(newSessionUri: string) {
  sessionUri = newSessionUri;
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
