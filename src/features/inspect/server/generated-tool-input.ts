const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const futureIsoDate = (daysFromNow: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
};

const isCompatibleValue = (
  value: unknown,
  schema: Record<string, unknown>,
) => {
  const enumValues = Array.isArray(schema.enum) ? schema.enum : undefined;
  if (enumValues && !enumValues.includes(value)) return false;

  if (schema.type === "string" && typeof value !== "string") return false;
  if (schema.type === "boolean" && typeof value !== "boolean") return false;
  if (
    (schema.type === "number" || schema.type === "integer") &&
    typeof value !== "number"
  ) {
    return false;
  }
  if (schema.type === "object" && !isRecord(value)) return false;
  if (schema.type === "array") {
    if (!Array.isArray(value)) return false;
    const minimumItems =
      typeof schema.minItems === "number" ? schema.minItems : 0;
    if (value.length < minimumItems) return false;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      return false;
    }
  }

  return true;
};

export const normalizeGeneratedToolInput = (
  generated: Record<string, unknown>,
  schema: Record<string, unknown>,
  fallback: Record<string, unknown>,
) => {
  if (!schema.properties || typeof schema.properties !== "object") {
    return generated;
  }

  const properties = schema.properties as Record<string, unknown>;
  const normalized = Object.fromEntries(
    Object.entries(generated).filter(([name]) => name in properties),
  );

  Object.entries(properties).forEach(([name, rawPropertySchema], index) => {
    const propertySchema = isRecord(rawPropertySchema) ? rawPropertySchema : {};
    const value = normalized[name];
    if (!isCompatibleValue(value, propertySchema)) {
      normalized[name] = fallback[name];
      return;
    }
    if (
      typeof value === "string" &&
      typeof propertySchema.pattern === "string"
    ) {
      try {
        if (!new RegExp(propertySchema.pattern).test(value)) {
          normalized[name] = fallback[name];
          return;
        }
      } catch {
        normalized[name] = fallback[name];
        return;
      }
    }
    if (propertySchema.format === "date") {
      const parsedDate =
        typeof value === "string" ? Date.parse(`${value}T00:00:00Z`) : Number.NaN;
      if (!Number.isFinite(parsedDate) || parsedDate <= Date.now()) {
        normalized[name] = futureIsoDate(30 + index * 7);
      }
    }
  });

  return { ...fallback, ...normalized };
};
