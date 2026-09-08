import Router from 'express-promise-router';

import { Request, Response } from 'express';
import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';

const REQUEST_TIMEOUT_MS = 10_000;

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map((n) => parseInt(n, 10));
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10
    a === 127 || // 127.0.0.0/8
    (a === 169 && b === 254) || // 169.254.0.0/16
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    a >= 224 // multicast, reserved and broadcast ranges
  );
}

function parseIPv6Groups(part: string): number[] | null {
  if (!part) {
    return [];
  }
  const groups: number[] = [];
  for (const chunk of part.split(':')) {
    if (chunk.includes('.')) {
      const octets = chunk.split('.').map((n) => parseInt(n, 10));
      if (octets.length !== 4 || octets.some((n) => n < 0 || n > 255)) {
        return null;
      }
      groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
    } else {
      const group = parseInt(chunk, 16);
      if (!Number.isInteger(group) || group < 0 || group > 0xffff) {
        return null;
      }
      groups.push(group);
    }
  }
  return groups;
}

function expandIPv6(ip: string): number[] | null {
  const address = ip.toLowerCase();
  if (!address.includes('::')) {
    return parseIPv6Groups(address);
  }
  // an address contains at most one '::'
  const parts = address.split('::');
  if (parts.length > 3) {
    return null;
  }
  const [rawHead, rawTail] = parts;
  const head = parseIPv6Groups(rawHead);
  const tail = parseIPv6Groups(rawTail);
  if (!head || !tail) {
    return null;
  }
  const missingGroups = 8 - head.length - tail.length;
  if (missingGroups < 1) {
    return null;
  }
  return [...head, ...Array<number>(missingGroups).fill(0), ...tail];
}

function isPrivateIPv6(ip: string): boolean {
  const groups = expandIPv6(ip);
  if (!groups || groups.length !== 8) {
    return true; // unparseable addresses are never trusted
  }
  if (groups.every((group) => group === 0)) {
    return true; // ::
  }
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) {
    return true; // ::1
  }
  if (
    groups.slice(0, 5).every((group) => group === 0) &&
    groups[5] === 0xffff
  ) {
    const ipv4 = [
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ]
      .map((n) => n.toString())
      .join('.');
    return isPrivateIPv4(ipv4); // IPv4-mapped addresses
  }
  const [first] = groups;
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xff00) === 0xff00 // multicast ff00::/8
  );
}

function isPrivateAddress({ address, family }: LookupAddress): boolean {
  return family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
}

const validateUrlRouter = Router();

validateUrlRouter.get('/', async (req: Request, res: Response) => {
  const { link, follow } = req.query;
  if (typeof link !== 'string' || link.length === 0) {
    res.status(400).send({
      errors: [{ title: 'Missing link parameter' }],
    });
    return;
  }

  let url: URL;
  try {
    url = new URL(link);
  } catch (_error) {
    res.status(400).send({
      errors: [
        {
          title: 'Invalid link parameter',
          description: 'The link is not a valid URL',
        },
      ],
    });
    return;
  }

  const allowHttp = process.env.VALIDATE_URL_ALLOW_HTTP === 'true';
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    res.status(400).send({
      errors: [
        {
          title: 'Unsupported protocol',
          description: allowHttp
            ? 'Only http and https links are supported'
            : 'Only https links are supported',
        },
      ],
    });
    return;
  }

  // WHATWG URLs serialize IPv6 hosts with brackets
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  // single-label hostnames resolve inside the internal network
  if (!hostname.includes('.') && !hostname.includes(':')) {
    res.status(403).send({
      errors: [
        {
          title: 'Disallowed host',
          description: 'The link must point to a public host',
        },
      ],
    });
    return;
  }

  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch (_error) {
    res.send({ isAccessible: false });
    return;
  }
  if (addresses.some((address) => isPrivateAddress(address))) {
    res.status(403).send({
      errors: [
        {
          title: 'Disallowed host',
          description: 'The link must point to a public host',
        },
      ],
    });
    return;
  }

  try {
    const response = await fetch(url, {
      redirect: follow === 'true' ? 'follow' : 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await response.body?.cancel();
    res.send({
      isAccessible: response.ok,
      finalUrl: response.url,
      status: response.status,
    });
  } catch (error) {
    console.warn(`[validate-url] Fetching ${url.href} failed: ${error}`);
    res.send({ isAccessible: false });
  }
});

export { validateUrlRouter };
