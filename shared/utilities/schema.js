'use strict';
/**
 * Tiny dependency-free schema validator used by the backend (publishing),
 * the client (accepting remote bundles) and the owner app (form feedback).
 *
 * validate(schema, value) -> { ok, value, errors: [{ path, message }] }
 * Unknown object keys are dropped; values are never coerced silently except
 * where a schema explicitly allows it.
 */

const COLOR_RE = /^(#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)|transparent)$/;
const SAFE_URL_RE = /^(https:\/\/[^\s"'<>()\\]+|asset:[a-zA-Z0-9_-]{1,64}|\/[^\s"'<>()\\]*|[a-z0-9_-]+\.html(#[a-z0-9_-]+)?|#[a-z0-9_-]*)$/i;

function fail(errors, path, message) { errors.push({ path: path || '(root)', message }); return undefined; }

const s = {
  string: (o = {}) => ({ t: 'string', ...o }),
  number: (o = {}) => ({ t: 'number', ...o }),
  int: (o = {}) => ({ t: 'number', int: true, ...o }),
  bool: () => ({ t: 'bool' }),
  color: () => ({ t: 'color' }),
  url: (o = {}) => ({ t: 'url', ...o }),
  enum: (values) => ({ t: 'enum', values }),
  array: (item, o = {}) => ({ t: 'array', item, ...o }),
  object: (shape, o = {}) => ({ t: 'object', shape, ...o }),
  record: (value, o = {}) => ({ t: 'record', value, ...o }),
  nullable: (inner) => ({ ...inner, nullable: true }),
  optional: (inner, def) => ({ ...inner, optional: true, def }),
  any: (o = {}) => ({ t: 'any', ...o }),
};

function run(schema, v, path, errors) {
  if (v === undefined) {
    if (schema.optional) return schema.def;
    return fail(errors, path, 'is required');
  }
  if (v === null) {
    if (schema.nullable) return null;
    return fail(errors, path, 'must not be null');
  }
  switch (schema.t) {
    case 'string': {
      if (typeof v !== 'string') return fail(errors, path, 'must be a string');
      const max = schema.max ?? 2000;
      if (v.length > max) return fail(errors, path, `must be at most ${max} characters`);
      if (schema.min && v.length < schema.min) return fail(errors, path, `must be at least ${schema.min} characters`);
      if (schema.pattern && !schema.pattern.test(v)) return fail(errors, path, 'has an invalid format');
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v)) return fail(errors, path, 'contains control characters');
      return v;
    }
    case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail(errors, path, 'must be a number');
      if (schema.int && !Number.isInteger(v)) return fail(errors, path, 'must be an integer');
      if (schema.min !== undefined && v < schema.min) return fail(errors, path, `must be ≥ ${schema.min}`);
      if (schema.max !== undefined && v > schema.max) return fail(errors, path, `must be ≤ ${schema.max}`);
      return v;
    }
    case 'bool':
      if (typeof v !== 'boolean') return fail(errors, path, 'must be true or false');
      return v;
    case 'color':
      if (typeof v !== 'string' || !COLOR_RE.test(v.trim())) return fail(errors, path, 'must be a color (#hex, rgb(), rgba() or transparent)');
      return v.trim();
    case 'url':
      if (typeof v !== 'string' || v.length > 1000 || !SAFE_URL_RE.test(v)) return fail(errors, path, 'must be an https URL, a relative page link or an asset reference');
      return v;
    case 'enum':
      if (!schema.values.includes(v)) return fail(errors, path, `must be one of: ${schema.values.join(', ')}`);
      return v;
    case 'array': {
      if (!Array.isArray(v)) return fail(errors, path, 'must be a list');
      const max = schema.max ?? 500;
      if (v.length > max) return fail(errors, path, `must contain at most ${max} entries`);
      const out = v.map((item, i) => run(schema.item, item, `${path}[${i}]`, errors));
      if (schema.uniqueBy) {
        const seen = new Set();
        for (const [i, it] of out.entries()) {
          const k = it && it[schema.uniqueBy];
          if (seen.has(k)) fail(errors, `${path}[${i}].${schema.uniqueBy}`, 'must be unique');
          seen.add(k);
        }
      }
      return out;
    }
    case 'object': {
      if (typeof v !== 'object' || Array.isArray(v)) return fail(errors, path, 'must be an object');
      const out = {};
      for (const [k, sub] of Object.entries(schema.shape)) {
        const r = run(sub, v[k], path ? `${path}.${k}` : k, errors);
        if (r !== undefined) out[k] = r;
      }
      return out;
    }
    case 'record': {
      if (typeof v !== 'object' || Array.isArray(v)) return fail(errors, path, 'must be an object');
      const keys = Object.keys(v);
      const maxKeys = schema.maxKeys ?? 200;
      if (keys.length > maxKeys) return fail(errors, path, `must have at most ${maxKeys} keys`);
      const out = {};
      for (const k of keys) {
        if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype') { fail(errors, `${path}.${k}`, 'invalid key'); continue; }
        const r = run(schema.value, v[k], `${path}.${k}`, errors);
        if (r !== undefined) out[k] = r;
      }
      return out;
    }
    case 'any': {
      const json = JSON.stringify(v);
      if (json && json.length > (schema.maxBytes ?? 65536)) return fail(errors, path, 'is too large');
      return JSON.parse(json);
    }
    default:
      return fail(errors, path, 'unknown schema type');
  }
}

function validate(schema, value) {
  const errors = [];
  const out = run(schema, value, '', errors);
  return { ok: errors.length === 0, value: errors.length ? undefined : out, errors };
}

module.exports = { s, validate, COLOR_RE, SAFE_URL_RE };
