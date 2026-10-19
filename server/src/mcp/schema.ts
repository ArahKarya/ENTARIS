// Konversi definisi tool registry → definisi tool MCP (JSON Schema input, annotations, deskripsi).

import type { ToolDef, ToolParam } from '../ai/types';
import { tierHint, type ToolDecision } from './policy';

export type JsonSchema = Record<string, unknown>;

const SCALAR: Record<string, JsonSchema> = {
  string: { type: 'string' },
  number: { type: 'number' },
  boolean: { type: 'boolean' },
  date: { type: 'string', description: 'Tanggal ISO: YYYY-MM-DD.' },
  uuid: { type: 'string', description: 'ID (UUID).' },
  email: { type: 'string', format: 'email' },
};

function typeToSchema(type: string, enumVals?: string[], fields?: ToolParam[]): JsonSchema {
  if (enumVals?.length) return { type: 'string', enum: enumVals };
  if (type.startsWith('array<') && type.endsWith('>')) {
    return { type: 'array', items: typeToSchema(type.slice(6, -1), undefined, fields) };
  }
  if (type === 'array') return { type: 'array', items: {} };
  if (type === 'object') return fields?.length ? objectSchema(fields) : { type: 'object', additionalProperties: true };
  if (type === 'any') return {};
  return { ...(SCALAR[type] ?? { type: 'string' }) };
}

function paramSchema(p: ToolParam): JsonSchema {
  const s = typeToSchema(p.type, p.enum, p.fields);
  return p.description && !s.description ? { ...s, description: p.description } : s;
}

function objectSchema(params: ToolParam[]): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const p of params) {
    properties[p.name] = paramSchema(p);
    if (p.required) required.push(p.name);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: true };
}

export const IDEMPOTENCY_PROP: JsonSchema = {
  type: 'string',
  maxLength: 100,
  description: 'Opsional: kunci idempotensi. Pemanggilan ulang dengan kunci sama mengembalikan hasil pertama (tidak menjalankan ulang).',
};

/** JSON Schema input satu tool. Tool write/critical mendapat argumen opsional `idempotencyKey`. */
export function inputSchemaFor(tool: ToolDef): JsonSchema {
  let schema: JsonSchema;
  if (tool.params?.length) {
    schema = objectSchema(tool.params);
  } else {
    const props = Object.entries(tool.input ?? {}).map(([name, t]) => ({ name, in: 'body' as const, type: typeof t === 'string' ? t : 'any', required: false }));
    schema = objectSchema(props);
  }
  if (tool.risk !== 'read') {
    const properties = { ...(schema.properties as Record<string, JsonSchema>), idempotencyKey: IDEMPOTENCY_PROP };
    schema = { ...schema, properties };
  }
  return schema;
}

export function descriptionFor(tool: ToolDef, decision: Exclude<ToolDecision, 'deny'>): string {
  const parts = [tool.desc.trim()];
  if (tool.risk !== 'read' && tool.postingEffect) parts.push(`Efek: ${tool.postingEffect.trim()}`);
  const hint = tierHint(decision);
  if (hint) parts.push(hint);
  return parts.join(' ');
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
}

export function toMcpTool(tool: ToolDef, decision: Exclude<ToolDecision, 'deny'>): McpToolDef {
  const method = tool.handler.split(' ')[0];
  return {
    name: tool.name,
    description: descriptionFor(tool, decision),
    inputSchema: { type: 'object', ...inputSchemaFor(tool) },
    annotations: {
      title: tool.name,
      readOnlyHint: tool.risk === 'read',
      destructiveHint: tool.risk === 'critical',
      idempotentHint: tool.risk === 'read' || method === 'PUT' || method === 'DELETE',
      openWorldHint: false,
    },
  };
}
