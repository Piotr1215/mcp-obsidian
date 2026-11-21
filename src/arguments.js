/**
 * Server-side argument handling. The low-level Server does not enforce the
 * JSON schema it advertises, so a model can send limit: 1e9, offset: -4 or a
 * string where a number belongs. Integers are clamped into their declared
 * range; anything of the wrong type is reported as a failure the model can fix.
 */

/**
 * Coerce a number to an integer within [min, max].
 */
export function clampInteger(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const whole = Math.trunc(value);
  return Math.min(max, Math.max(min, whole));
}

function typeName(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

/**
 * Check and normalize tool arguments against the tool's input schema.
 * Returns { args } with integers clamped and declared defaults filled in for
 * integers, or { error } naming the first problem and how to fix it.
 */
export function normalizeArguments(schema, rawArgs) {
  const input = rawArgs ?? {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Arguments must be an object of named values.' };
  }

  const args = { ...input };
  const properties = schema.properties ?? {};

  for (const name of schema.required ?? []) {
    if (args[name] === undefined || args[name] === null) {
      return { error: `Missing required argument "${name}". Provide it and call the tool again.` };
    }
  }

  for (const [name, spec] of Object.entries(properties)) {
    const value = args[name];
    if (value === undefined || value === null) {
      delete args[name];
      continue;
    }

    switch (spec.type) {
    case 'integer':
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { error: `Argument "${name}" must be an integer, got ${typeName(value)}. Send a whole number.` };
      }
      args[name] = clampInteger(value, { min: spec.minimum, max: spec.maximum });
      break;
    }
    case 'string':
      if (typeof value !== 'string') {
        return { error: `Argument "${name}" must be a string, got ${typeName(value)}.` };
      }
      if (spec.minLength !== undefined && value.length < spec.minLength) {
        return { error: `Argument "${name}" must not be empty.` };
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        return { error: `Argument "${name}" must be true or false, got ${typeName(value)}.` };
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        return { error: `Argument "${name}" must be an array, got ${typeName(value)}. Wrap a single value in a list.` };
      }
      if (spec.minItems !== undefined && value.length < spec.minItems) {
        return { error: `Argument "${name}" needs at least ${spec.minItems} item(s).` };
      }
      if (spec.items?.type === 'string' && value.some(item => typeof item !== 'string' || (spec.items.minLength && item.length < spec.items.minLength))) {
        return { error: `Every item of "${name}" must be a non-empty string.` };
      }
      break;
    default:
      break;
    }
  }

  for (const [name, spec] of Object.entries(properties)) {
    if (spec.type === 'integer' && args[name] === undefined && spec.default !== undefined) {
      args[name] = spec.default;
    }
  }

  return { args };
}
