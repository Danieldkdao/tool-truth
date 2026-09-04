export type SafeJsonValue =
  | null
  | boolean
  | number
  | string
  | SafeJsonValue[]
  | { [key: string]: SafeJsonValue };

export type SafeJsonObject = { [key: string]: SafeJsonValue };

export const REDACTED_VALUE = "[REDACTED]";

const SENSITIVE_FIELD_NAMES = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "bearertoken",
  "clientsecret",
  "cookie",
  "cookies",
  "credential",
  "credentials",
  "csrftoken",
  "idtoken",
  "jwt",
  "liveviewurl",
  "onetimepassword",
  "otp",
  "passcode",
  "passphrase",
  "password",
  "privatekey",
  "refreshtoken",
  "sessionid",
  "sessiontoken",
  "setcookie",
  "secret",
  "token",
]);

const PRIVATE_FIELD_NAMES = new Set([
  "accountnumber",
  "address",
  "bankaccount",
  "cardnumber",
  "creditcard",
  "cvc",
  "cvv",
  "dateofbirth",
  "dob",
  "email",
  "emailaddress",
  "firstname",
  "fullname",
  "iban",
  "lastname",
  "phonenumber",
  "postaladdress",
  "routingnumber",
  "socialsecuritynumber",
  "ssn",
  "username",
]);

const SCHEMA_EXAMPLE_FIELD_NAMES = new Set([
  "const",
  "default",
  "enum",
  "example",
  "examples",
]);

const normalizeFieldName = (fieldName: string) =>
  fieldName.replace(/[^a-z0-9]/gi, "").toLowerCase();

const matchesSensitiveFieldName = (fieldName: string) => {
  const normalized = normalizeFieldName(fieldName);
  if (SENSITIVE_FIELD_NAMES.has(normalized)) return true;

  return [
    "accesstoken",
    "apikey",
    "authorization",
    "clientsecret",
    "credential",
    "csrftoken",
    "password",
    "privatekey",
    "refreshtoken",
    "sessionid",
    "sessiontoken",
    "setcookie",
    "secret",
  ].some((suffix) => normalized.endsWith(suffix));
};

const matchesPrivateFieldName = (fieldName: string) => {
  const normalized = normalizeFieldName(fieldName);
  return PRIVATE_FIELD_NAMES.has(normalized);
};

export const isSensitiveDataFieldName = (fieldName: string) =>
  matchesSensitiveFieldName(fieldName) || matchesPrivateFieldName(fieldName);

const isSchemaPath = (path: string[]) =>
  path.some((segment) =>
    ["inputschema", "outputschema"].includes(normalizeFieldName(segment)),
  );

const schemaPropertyIsSensitive = (path: string[]) => {
  const propertiesIndex = path.findIndex(
    (segment) => normalizeFieldName(segment) === "properties",
  );
  if (propertiesIndex === -1 || propertiesIndex + 1 >= path.length) {
    return false;
  }

  const propertyName = path[propertiesIndex + 1];
  return (
    matchesSensitiveFieldName(propertyName) ||
    matchesPrivateFieldName(propertyName)
  );
};

const shouldRedactField = (fieldName: string, parentPath: string[]) => {
  if (isSchemaPath(parentPath)) {
    return (
      schemaPropertyIsSensitive(parentPath) &&
      SCHEMA_EXAMPLE_FIELD_NAMES.has(normalizeFieldName(fieldName))
    );
  }

  return (
    matchesSensitiveFieldName(fieldName) ||
    matchesPrivateFieldName(fieldName)
  );
};

const sanitizeUrl = (value: string) => {
  const trimmed = value.trim();
  const isAbsolute = /^https?:\/\//i.test(trimmed);
  const isRelative = /^(?:\/|\.\/|\.\.\/)/.test(trimmed);
  if (!isAbsolute && !isRelative) return value;

  try {
    const baseUrl = "https://tooltruth.invalid";
    const url = new URL(trimmed, baseUrl);
    url.username = "";
    url.password = "";
    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      url.searchParams.set(key, REDACTED_VALUE);
    }

    return isAbsolute
      ? url.toString()
      : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
};

export const redactSensitiveText = (value: string) => {
  return sanitizeUrl(value)
    .replace(
      /-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/gi,
      REDACTED_VALUE,
    )
    .replace(
      /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+[^\s,;]+/gi,
      `Authorization: ${REDACTED_VALUE}`,
    )
    .replace(
      /\b(?:Set-Cookie|Cookie)\s*:\s*[^\r\n]+/gi,
      `Cookie: ${REDACTED_VALUE}`,
    )
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_.=:-]+/gi, "$1 [REDACTED]")
    .replace(
      /\b(?:sk|rk|pk|ghp|github_pat|xox[baprs])-[_A-Za-z0-9-]{12,}\b/g,
      REDACTED_VALUE,
    )
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, REDACTED_VALUE)
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      REDACTED_VALUE,
    )
    .replace(/([?&][A-Za-z0-9._~-]+=)[^&#\s]*/g, "$1%5BREDACTED%5D")
    .replace(
      /\b(password|passphrase|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|cookie|secret)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^,;\s}]+)/gi,
      (_match, fieldName: string, separator: string) =>
        `${fieldName}${separator}${REDACTED_VALUE}`,
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      REDACTED_VALUE,
    )
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, REDACTED_VALUE)
    .replace(
      /\b(?:\+?\d{1,3}[ .-]?)?(?:\(?\d{3}\)?[ .-]?)\d{3}[ .-]?\d{4}\b/g,
      REDACTED_VALUE,
    )
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, REDACTED_VALUE)
    .replace(
      /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
      REDACTED_VALUE,
    );
};

const sanitizeValue = (
  value: unknown,
  path: string[],
  ancestors: WeakSet<object>,
): SafeJsonValue => {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    if (ancestors.has(value)) return "[Circular reference omitted]";
    ancestors.add(value);
    const result = value.map((entry, index) =>
      sanitizeValue(entry, [...path, String(index)], ancestors),
    );
    ancestors.delete(value);
    return result;
  }

  if (value && typeof value === "object") {
    if (ancestors.has(value)) return "[Circular reference omitted]";
    ancestors.add(value);
    const result: SafeJsonObject = {};

    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined || typeof entry === "function") continue;
      result[key] = shouldRedactField(key, path)
        ? REDACTED_VALUE
        : sanitizeValue(entry, [...path, key], ancestors);
    }

    ancestors.delete(value);
    return result;
  }

  return String(value);
};

export const sanitizeForExport = (value: unknown): SafeJsonValue =>
  sanitizeValue(value, [], new WeakSet());

export const sanitizeObjectForExport = (value: unknown): SafeJsonObject => {
  const sanitized = sanitizeForExport(value);
  return sanitized && !Array.isArray(sanitized) && typeof sanitized === "object"
    ? sanitized
    : {};
};
