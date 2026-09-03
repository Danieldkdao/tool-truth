import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { serverEnv } from "@/data/env/server";

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".home.arpa",
  ".internal",
  ".invalid",
  ".local",
  ".localhost",
  ".test",
];

const BLOCKED_HOSTNAMES = new Set([
  "instance-data.ec2.internal",
  "localhost",
  "metadata.google.internal",
]);

const BLOCKED_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

export class UnsafeInspectionUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeInspectionUrlError";
  }
}

export type ValidatedInspectionTarget = {
  url: string;
  hostname: string;
  resolvedAddresses: string[];
};

const ipv4ToNumber = (address: string) => {
  return address.split(".").reduce((value, part) => {
    return value * 256 + Number(part);
  }, 0);
};

const isIpv4InRange = (
  address: string,
  base: string,
  prefixLength: number,
) => {
  const addressValue = ipv4ToNumber(address);
  const baseValue = ipv4ToNumber(base);
  const blockSize = 2 ** (32 - prefixLength);

  return Math.floor(addressValue / blockSize) === Math.floor(baseValue / blockSize);
};

const isPublicIpv4 = (address: string) => {
  return !BLOCKED_IPV4_RANGES.some(([base, prefixLength]) => {
    return isIpv4InRange(address, base, prefixLength);
  });
};

const expandIpv6 = (address: string) => {
  const addressWithoutZone = address.split("%", 1)[0].toLowerCase();
  const lastColon = addressWithoutZone.lastIndexOf(":");
  const possibleIpv4 = addressWithoutZone.slice(lastColon + 1);
  let normalizedAddress = addressWithoutZone;

  if (possibleIpv4.includes(".")) {
    if (isIP(possibleIpv4) !== 4) {
      return null;
    }

    const ipv4Value = ipv4ToNumber(possibleIpv4);
    const ipv4Groups = `${((ipv4Value >>> 16) & 0xffff).toString(16)}:${(
      ipv4Value & 0xffff
    ).toString(16)}`;
    normalizedAddress = `${addressWithoutZone.slice(0, lastColon + 1)}${ipv4Groups}`;
  }

  const halves = normalizedAddress.split("::");
  if (halves.length > 2) {
    return null;
  }

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missingGroupCount = 8 - left.length - right.length;

  if (
    (halves.length === 1 && missingGroupCount !== 0) ||
    (halves.length === 2 && missingGroupCount < 1)
  ) {
    return null;
  }

  const groups = [
    ...left,
    ...Array.from({ length: missingGroupCount }, () => "0"),
    ...right,
  ].map((group) => Number.parseInt(group || "0", 16));

  if (
    groups.length !== 8 ||
    groups.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)
  ) {
    return null;
  }

  return groups;
};

const isPublicIpv6 = (address: string) => {
  const groups = expandIpv6(address);
  if (!groups) {
    return false;
  }

  const isIpv4Mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;

  if (isIpv4Mapped) {
    const mappedIpv4 = [
      groups[6] >>> 8,
      groups[6] & 0xff,
      groups[7] >>> 8,
      groups[7] & 0xff,
    ].join(".");

    return isPublicIpv4(mappedIpv4);
  }

  const firstGroup = groups[0];
  const isGlobalUnicast = firstGroup >= 0x2000 && firstGroup <= 0x3fff;
  if (!isGlobalUnicast) {
    return false;
  }

  const isDocumentationRange =
    (groups[0] === 0x2001 && groups[1] === 0x0db8) ||
    (groups[0] === 0x3fff && groups[1] <= 0x0fff);
  const isTransitionOrBenchmarkRange =
    (groups[0] === 0x2001 && groups[1] === 0) ||
    (groups[0] === 0x2001 && groups[1] === 2 && groups[2] === 0) ||
    groups[0] === 0x2002;

  return !isDocumentationRange && !isTransitionOrBenchmarkRange;
};

const isPublicIp = (address: string) => {
  const version = isIP(address);

  if (version === 4) {
    return isPublicIpv4(address);
  }

  if (version === 6) {
    return isPublicIpv6(address);
  }

  return false;
};

const normalizeHostname = (hostname: string) => {
  return hostname
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
};

const getConfiguredBlockedHostnames = () => {
  return new Set(
    serverEnv.TOOLTRUTH_BLOCKED_HOSTNAMES?.split(",")
      .map(normalizeHostname)
      .filter(Boolean) ?? [],
  );
};

const assertAllowedHostname = (hostname: string) => {
  if (getConfiguredBlockedHostnames().has(hostname)) {
    throw new UnsafeInspectionUrlError(
      "ToolTruth cannot inspect its own application. Submit a different WebMCP application URL.",
    );
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new UnsafeInspectionUrlError(
      "Local, private, and internal addresses cannot be inspected.",
    );
  }

  if (isIP(hostname) === 0 && !hostname.includes(".")) {
    throw new UnsafeInspectionUrlError(
      "Use a publicly resolvable, fully qualified hostname.",
    );
  }
};

export const validateInspectionUrl = async (
  input: string,
): Promise<ValidatedInspectionTarget> => {
  if (input.length > 2048) {
    throw new UnsafeInspectionUrlError("The URL is too long.");
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeInspectionUrlError("Enter a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeInspectionUrlError("Only HTTP and HTTPS URLs are supported.");
  }

  if (url.username || url.password) {
    throw new UnsafeInspectionUrlError(
      "URLs containing usernames or passwords are not allowed.",
    );
  }

  const hostname = normalizeHostname(url.hostname);
  assertAllowedHostname(hostname);

  let resolvedAddresses: string[];
  if (isIP(hostname) !== 0) {
    resolvedAddresses = [hostname];
  } else {
    try {
      const results = await lookup(hostname, { all: true, verbatim: true });
      resolvedAddresses = [...new Set(results.map(({ address }) => address))];
    } catch {
      throw new UnsafeInspectionUrlError(
        "The hostname could not be resolved to a public address.",
      );
    }
  }

  if (
    resolvedAddresses.length === 0 ||
    resolvedAddresses.some((address) => !isPublicIp(address))
  ) {
    throw new UnsafeInspectionUrlError(
      "Local, private, reserved, and metadata addresses cannot be inspected.",
    );
  }

  url.hash = "";

  return {
    url: url.toString(),
    hostname,
    resolvedAddresses,
  };
};
