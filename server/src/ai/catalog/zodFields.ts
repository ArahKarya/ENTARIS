// Ekstraksi STATIS parameter dari skema Zod (z.object({...})) → daftar ToolParam.
// Dipakai untuk menurunkan `input`/`params` registry langsung dari kode (bukan ditulis tangan).
// Tidak meng-import skema (route file menyeret Prisma) — cukup parse AST.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { serverRoot } from './inventoryRoutes';
import type { ToolParam } from '../types';

type TypeInfo =
  | { kind: 'object'; fields: ToolParam[] }
  | { kind: 'array'; item: TypeInfo }
  | { kind: 'enum'; values: string[] }
  | { kind: 'scalar'; type: string };

interface Entry {
  expr: ts.Expression;
  sf: ts.SourceFile;
}

let index: Map<string, Entry> | undefined;
/** helper skema berbentuk fungsi, mis. `const optText = (max) => z.string().max(max).optional()` */
const fnIndex = new Map<string, ts.Expression>();

function walkTs(dir: string, out: string[]): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'generated') continue;
      walkTs(p, out);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** Ekspresi skema: memuat `z.` atau alias/turunan skema lain (mis. `CreateXSchema.partial()`). */
function isSchemaExpr(text: string): boolean {
  return /\bz\./.test(text) || /^[A-Za-z_]\w*(Schema|Enum)\b/.test(text);
}

function buildIndex(): Map<string, Entry> {
  if (index) return index;
  index = new Map();
  const files = walkTs(path.join(serverRoot(), 'src'), []);
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    if (!/\bz\./.test(text)) continue;
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && ts.isArrowFunction(d.initializer) && !ts.isBlock(d.initializer.body) && /\bz\./.test(d.initializer.body.getText(sf))) {
          fnIndex.set(d.name.text, d.initializer.body);
        } else if (ts.isIdentifier(d.name) && d.initializer && isSchemaExpr(d.initializer.getText(sf))) {
          // nama bentrok antar file: yang pertama menang, kecuali yang lebih spesifik (route-local) menimpa nanti lewat lookup file
          const key = d.name.text;
          if (!index.has(key)) index.set(key, { expr: d.initializer, sf });
        }
      }
    }
  }
  return index;
}

/** Skema yang diindeks per file supaya route-local dengan nama sama tidak tertukar. */
const localCache = new Map<string, Map<string, Entry>>();
function localIndex(file: string): Map<string, Entry> {
  const abs = path.isAbsolute(file) ? file : path.join(serverRoot(), file);
  const hit = localCache.get(abs);
  if (hit) return hit;
  const m = new Map<string, Entry>();
  if (fs.existsSync(abs)) {
    const sf = ts.createSourceFile(abs, fs.readFileSync(abs, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && isSchemaExpr(d.initializer.getText(sf))) {
          m.set(d.name.text, { expr: d.initializer, sf });
        }
      }
    }
  }
  localCache.set(abs, m);
  return m;
}

const STR = (n: ts.Node | undefined): string | undefined =>
  n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined;

interface Chain {
  base: ts.Expression;
  /** nama pemanggilan berantai dari dalam ke luar (z.string().min().optional() → ['min','optional']) */
  mods: { name: string; args: readonly ts.Expression[] }[];
}

function unchain(expr: ts.Expression): Chain {
  const mods: Chain['mods'] = [];
  let cur: ts.Expression = expr;
  for (;;) {
    if (ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
    } else if (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
      const pa = cur.expression;
      // z.xxx(...) = base (objek z)
      if (ts.isIdentifier(pa.expression) && pa.expression.text === 'z') return { base: cur, mods: mods.reverse() };
      if (ts.isPropertyAccessExpression(pa.expression) && ts.isIdentifier(pa.expression.expression) && pa.expression.expression.text === 'z') {
        return { base: cur, mods: mods.reverse() }; // z.coerce.number()
      }
      mods.push({ name: pa.name.text, args: cur.arguments });
      cur = pa.expression;
    } else if (ts.isCallExpression(cur) && ts.isIdentifier(cur.expression) && fnIndex.has(cur.expression.text)) {
      // helper fungsi: ekspansi ke ekspresi z.* di dalam badan fungsi
      const inner = unchain(fnIndex.get(cur.expression.text) as ts.Expression);
      return { base: inner.base, mods: [...inner.mods, ...mods.reverse()] };
    } else {
      return { base: cur, mods: mods.reverse() };
    }
  }
}

function commentOf(sf: ts.SourceFile, node: ts.Node): string | undefined {
  const end = node.getEnd();
  const text = sf.text;
  const rest = text.slice(end, text.indexOf('\n', end) === -1 ? undefined : text.indexOf('\n', end));
  const m = rest.match(/^[,;\s]*\/\/\s*(.+)$/);
  if (m) return m[1].trim();
  const lead = ts.getLeadingCommentRanges(text, node.getFullStart());
  if (lead && lead.length) {
    const last = lead[lead.length - 1];
    const c = text.slice(last.pos, last.end).replace(/^\/\/\s?/, '').replace(/^\/\*+|\*+\/$/g, '').trim();
    if (c && !c.includes('\n')) return c;
  }
  return undefined;
}

function evalExpr(expr: ts.Expression, ctx: Entry | { sf: ts.SourceFile; file?: string }, file: string | undefined, depth: number): TypeInfo {
  if (depth > 8) return { kind: 'scalar', type: 'object' };
  const sf = ctx.sf;
  const { base, mods } = unchain(expr);

  // base = identifier (another schema)
  if (ts.isIdentifier(base)) {
    const local = file ? localIndex(file).get(base.text) : undefined;
    const target = local ?? buildIndex().get(base.text);
    if (!target) return applyMods({ kind: 'scalar', type: 'object' }, mods, sf, file, depth);
    return applyMods(evalExpr(target.expr, target, file, depth + 1), mods, sf, file, depth);
  }
  // base = z.xxx(...)
  if (ts.isCallExpression(base) && ts.isPropertyAccessExpression(base.expression)) {
    const fn = base.expression.name.text;
    const isCoerce = ts.isPropertyAccessExpression(base.expression.expression);
    const args = base.arguments;
    let info: TypeInfo;
    switch (fn) {
      case 'object': {
        info = { kind: 'object', fields: objectFields(args[0], sf, file, depth) };
        break;
      }
      case 'array':
        info = { kind: 'array', item: args[0] ? evalExpr(args[0], { sf }, file, depth + 1) : { kind: 'scalar', type: 'any' } };
        break;
      case 'enum': {
        const arr = args[0];
        const values = arr && ts.isArrayLiteralExpression(arr) ? arr.elements.map((e) => STR(e)).filter((v): v is string => !!v) : [];
        info = { kind: 'enum', values };
        break;
      }
      case 'nativeEnum':
        info = { kind: 'scalar', type: 'string' };
        break;
      case 'string':
        info = { kind: 'scalar', type: 'string' };
        break;
      case 'number':
      case 'bigint':
        info = { kind: 'scalar', type: 'number' };
        break;
      case 'boolean':
        info = { kind: 'scalar', type: 'boolean' };
        break;
      case 'date':
        info = { kind: 'scalar', type: 'date' };
        break;
      case 'literal':
        info = { kind: 'scalar', type: STR(args[0]) !== undefined ? 'string' : 'any' };
        break;
      case 'record':
        info = { kind: 'scalar', type: 'object' };
        break;
      case 'union':
      case 'discriminatedUnion': {
        const arr = args[fn === 'union' ? 0 : 1];
        const first = arr && ts.isArrayLiteralExpression(arr) ? arr.elements[0] : undefined;
        info = first ? evalExpr(first, { sf }, file, depth + 1) : { kind: 'scalar', type: 'any' };
        break;
      }
      default:
        info = { kind: 'scalar', type: isCoerce ? 'string' : 'any' };
    }
    return applyMods(info, mods, sf, file, depth);
  }
  return { kind: 'scalar', type: 'any' };
}

function applyMods(info: TypeInfo, mods: Chain['mods'], sf: ts.SourceFile, file: string | undefined, depth: number): TypeInfo {
  let out = info;
  for (const m of mods) {
    if (out.kind === 'scalar' && out.type === 'string') {
      if (m.name === 'uuid') out = { kind: 'scalar', type: 'uuid' };
      else if (m.name === 'datetime' || m.name === 'date') out = { kind: 'scalar', type: 'date' };
      else if (m.name === 'email') out = { kind: 'scalar', type: 'email' };
    }
    if (out.kind === 'object') {
      if (m.name === 'extend' || m.name === 'merge') {
        const arg = m.args[0];
        let extra: ToolParam[] = [];
        if (arg && ts.isObjectLiteralExpression(arg)) extra = objectFields(arg, sf, file, depth);
        else if (arg) {
          const e = evalExpr(arg, { sf }, file, depth + 1);
          if (e.kind === 'object') extra = e.fields;
        }
        const names = new Set(extra.map((f) => f.name));
        out = { kind: 'object', fields: [...out.fields.filter((f) => !names.has(f.name)), ...extra] };
      } else if (m.name === 'partial') {
        out = { kind: 'object', fields: out.fields.map((f) => ({ ...f, required: false })) };
      } else if (m.name === 'pick' || m.name === 'omit') {
        const arg = m.args[0];
        const keys = new Set<string>();
        if (arg && ts.isObjectLiteralExpression(arg)) {
          for (const p of arg.properties) if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) keys.add(p.name.text);
        }
        out = { kind: 'object', fields: out.fields.filter((f) => (m.name === 'pick' ? keys.has(f.name) : !keys.has(f.name))) };
      }
    }
  }
  return out;
}

function typeLabel(info: TypeInfo): string {
  if (info.kind === 'object') return 'object';
  if (info.kind === 'array') return `array<${typeLabel(info.item)}>`;
  if (info.kind === 'enum') return 'enum';
  return info.type;
}

function objectFields(arg: ts.Expression | undefined, sf: ts.SourceFile, file: string | undefined, depth: number): ToolParam[] {
  if (!arg || !ts.isObjectLiteralExpression(arg)) return [];
  const out: ToolParam[] = [];
  for (const p of arg.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const name = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : undefined;
    if (!name) continue;
    const { mods } = unchain(p.initializer);
    const modNames = new Set(mods.map((m) => m.name));
    const required = !(modNames.has('optional') || modNames.has('nullish') || modNames.has('default'));
    const info = evalExpr(p.initializer, { sf }, file, depth + 1);
    const param: ToolParam = { name, in: 'body', type: typeLabel(info), required };
    if (info.kind === 'enum' && info.values.length) param.enum = info.values;
    const describe = mods.find((m) => m.name === 'describe');
    const desc = describe ? STR(describe.args[0]) : commentOf(sf, p);
    if (desc) param.description = desc;
    const itemInfo = info.kind === 'array' ? info.item : info;
    if (itemInfo.kind === 'object' && itemInfo.fields.length) param.fields = itemInfo.fields;
    out.push(param);
  }
  return out;
}

/** Field dari skema bernama (route-local `file` didahulukan). Kosong bila tak terdeteksi. */
export function schemaParams(schemaName: string, file?: string, where: 'body' | 'query' = 'body'): ToolParam[] {
  const local = file ? localIndex(file).get(schemaName) : undefined;
  const entry = local ?? buildIndex().get(schemaName);
  if (!entry) return [];
  const info = evalExpr(entry.expr, entry, file, 0);
  if (info.kind !== 'object') return [];
  return info.fields.map((f) => ({ ...f, in: where }));
}
