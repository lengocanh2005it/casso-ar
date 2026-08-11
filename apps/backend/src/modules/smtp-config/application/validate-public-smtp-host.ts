import { isIP } from 'node:net';

function normalizeAddress(address: string): string {
  const value = address.trim().toLowerCase();
  return value.startsWith('[') && value.endsWith(']')
    ? value.slice(1, -1)
    : value;
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true;
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function expandIpv6(address: string): string[] | null {
  const sections = address.split('::');
  if (sections.length > 2) return null;

  const parseSection = (section: string): string[] => {
    if (!section) return [];
    const parts = section.split(':');
    const last = parts.at(-1);
    if (!last?.includes('.')) return parts;
    const octets = last.split('.').map(Number);
    if (
      octets.length !== 4 ||
      octets.some(
        (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
      )
    ) {
      return [];
    }
    return [
      ...parts.slice(0, -1),
      ((octets[0] << 8) | octets[1]).toString(16),
      ((octets[2] << 8) | octets[3]).toString(16),
    ];
  };

  const left = parseSection(sections[0] ?? '');
  const right = parseSection(sections[1] ?? '');
  const missing = 8 - left.length - right.length;
  if (sections.length === 1 && missing !== 0) return null;
  if (sections.length === 2 && missing < 1) return null;
  return [...left, ...Array.from({ length: missing }, () => '0'), ...right];
}

function ipv6ToBigInt(address: string): bigint | null {
  const parts = expandIpv6(address.split('%')[0] ?? '');
  if (parts?.length !== 8) return null;
  return parts.reduce<bigint>((value, part) => {
    const hextet = Number.parseInt(part, 16);
    return Number.isInteger(hextet) && hextet >= 0 && hextet <= 0xffff
      ? (value << 16n) | BigInt(hextet)
      : -1n;
  }, 0n);
}

function isPublicIp(address: string): boolean {
  const normalized = normalizeAddress(address);
  const version = isIP(normalized);
  if (version === 4) return !isPrivateIpv4(normalized);
  if (version !== 6) return false;

  const value = ipv6ToBigInt(normalized);
  if (value === null || value < 0n || value === 1n) return false;
  if (value >> 121n === 126n || value >> 118n === 1018n) return false;
  if (value >> 32n === 0xffffn) {
    const ipv4 = Number(value & 0xffffffffn);
    const octets = [
      ipv4 >>> 24,
      (ipv4 >>> 16) & 0xff,
      (ipv4 >>> 8) & 0xff,
      ipv4 & 0xff,
    ];
    return !isPrivateIpv4(octets.join('.'));
  }
  return true;
}

export function validatePublicSmtpHost(
  host: string,
  resolvedAddresses: readonly string[],
  allowlist: readonly string[],
): boolean {
  const normalizedHost = normalizeAddress(host);
  if (
    allowlist.some(
      (allowedHost) => normalizeAddress(allowedHost) === normalizedHost,
    )
  ) {
    return true;
  }

  const addresses = isIP(normalizedHost) ? [normalizedHost] : resolvedAddresses;
  return addresses.length > 0 && addresses.every(isPublicIp);
}
