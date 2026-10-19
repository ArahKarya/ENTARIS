// Static inventory of every Express endpoint and its mount guard, parsed from the AST because
// importing index.ts starts the server, scheduler and Prisma. Needs no running server or DB.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type GuardKind = 'requirePerm' | 'requireWrite' | 'requireAnyPerm' | 'requireCap' | 'roleMiddleware' | 'local' | 'inline';
export type GuardScope = 'mount' | 'router' | 'route';

export interface Guard {
  kind: GuardKind;
  /** argumen literal (modul / capability / daftar modul / role) */
  args: string[];
  scope: GuardScope;
  raw: string;
}

export interface RouteRecord {
  method: string;
  /** path penuh, mis. /api/sales-orders/:id/cancel */
  path: string;
  /** relatif terhadap server/ */
  file: string;
  line: number;
  /** public = dipasang sebelum authMiddleware; authenticated = sesudahnya */
  auth: 'public' | 'authenticated';
  guards: Guard[];
  /** pemeriksaan izin di dalam body handler (can/hasCap/needsApproval/...) */
  inline: string[];
  /** skema Zod untuk req.body (validateBody / .parse / .safeParse) */
  bodySchemas: string[];
  /** skema Zod untuk req.query */
  querySchemas: string[];
  queryKeys: string[];
  paramKeys: string[];
  /** req.body dipakai */
  usesBody: boolean;
}

interface FileInfo {
  sf: ts.SourceFile;
  imports: Map<string, { file: string; exportName: string }>;
  /** nama variabel Router() lokal */
  routers: Set<string>;
  /** default export → nama variabel */
  defaultExport?: string;
  namedExports: Map<string, string>;
  localFns: Map<string, ts.Node>;
}

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all']);
const GUARD_FNS = new Set(['requirePerm', 'requireWrite', 'requireAnyPerm', 'requireCap', 'roleMiddleware']);

export function serverRoot(): string {
  return path.resolve(__dirname, '../../..');
}

function resolveModule(fromFile: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [`${base}.ts`, path.join(base, 'index.ts')]) if (fs.existsSync(c)) return c;
  return undefined;
}

function strLit(n: ts.Node | undefined): string | undefined {
  if (!n) return undefined;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  return undefined;
}

function isRouterInit(init: ts.Expression | undefined): boolean {
  if (!init || !ts.isCallExpression(init)) return false;
  const e = init.expression;
  return (ts.isIdentifier(e) && e.text === 'Router') || (ts.isPropertyAccessExpression(e) && e.name.text === 'Router');
}

const cache = new Map<string, FileInfo>();

function analyze(file: string): FileInfo {
  const hit = cache.get(file);
  if (hit) return hit;
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const info: FileInfo = { sf, imports: new Map(), routers: new Set(), namedExports: new Map(), localFns: new Map() };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause) {
      const target = resolveModule(file, (st.moduleSpecifier as ts.StringLiteral).text);
      if (!target) continue;
      const ic = st.importClause;
      if (ic.name) info.imports.set(ic.name.text, { file: target, exportName: 'default' });
      if (ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
        for (const el of ic.namedBindings.elements) {
          info.imports.set(el.name.text, { file: target, exportName: (el.propertyName ?? el.name).text });
        }
      }
    } else if (ts.isVariableStatement(st)) {
      const exported = st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        if (isRouterInit(d.initializer)) {
          info.routers.add(d.name.text);
          if (exported) info.namedExports.set(d.name.text, d.name.text);
        } else if (d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          info.localFns.set(d.name.text, d.initializer);
        }
      }
    } else if (ts.isFunctionDeclaration(st) && st.name) {
      info.localFns.set(st.name.text, st);
    } else if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) {
      info.defaultExport = st.expression.text;
    } else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause) && !st.moduleSpecifier) {
      for (const el of st.exportClause.elements) info.namedExports.set(el.name.text, (el.propertyName ?? el.name).text);
    }
  }
  cache.set(file, info);
  return info;
}

function lineOf(sf: ts.SourceFile, n: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
}

function parseGuard(arg: ts.Expression, info: FileInfo, scope: GuardScope): Guard | undefined {
  const raw = arg.getText(info.sf).replace(/\s+/g, ' ').slice(0, 160);
  if (ts.isCallExpression(arg) && ts.isIdentifier(arg.expression) && GUARD_FNS.has(arg.expression.text)) {
    const args: string[] = [];
    for (const a of arg.arguments) {
      if (ts.isArrayLiteralExpression(a)) {
        for (const e of a.elements) {
          const s = strLit(e);
          if (s) args.push(s);
        }
      } else {
        const s = strLit(a);
        if (s) args.push(s);
      }
    }
    return { kind: arg.expression.text as GuardKind, args, scope, raw };
  }
  if (ts.isIdentifier(arg)) {
    if (info.routers.has(arg.text) || info.imports.has(arg.text)) return undefined; // router, bukan guard
    if (info.localFns.has(arg.text)) return { kind: 'local', args: [arg.text], scope, raw };
    return undefined;
  }
  if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) return { kind: 'inline', args: [], scope, raw };
  return undefined;
}

const INLINE_RE = /\b(can|hasCap|hasPerm\w*|canDecide|isSuper\w*|needsApproval|assert\w*Perm\w*|requireFinance\w*|can[A-Z]\w*)\(([^()]*)\)/g;

function handlerFacts(handlers: ts.Expression[], info: FileInfo) {
  const inline = new Set<string>();
  const bodySchemas = new Set<string>();
  const querySchemas = new Set<string>();
  const queryKeys = new Set<string>();
  const paramKeys = new Set<string>();
  let usesBody = false;
  for (const h of handlers) {
    const text = h.getText(info.sf);
    for (const m of text.matchAll(INLINE_RE)) inline.add(`${m[1]}(${m[2].replace(/\s+/g, ' ').trim()})`);
    for (const m of text.matchAll(/validateBody\(\s*(\w+)\s*,/g)) bodySchemas.add(m[1]);
    for (const m of text.matchAll(/\b(\w+)\.(?:safe)?[pP]arse\(\s*req\.body/g)) bodySchemas.add(m[1]);
    for (const m of text.matchAll(/\b(\w+)\.(?:safe)?[pP]arse\(\s*req\.query/g)) querySchemas.add(m[1]);
    for (const m of text.matchAll(/req\.query\.(\w+)/g)) queryKeys.add(m[1]);
    for (const m of text.matchAll(/(?:const|let)\s*\{([^}]+)\}\s*=\s*req\.query/g)) {
      for (const k of m[1].split(',')) {
        const n = k.split(':')[0].split('=')[0].trim();
        if (n) queryKeys.add(n);
      }
    }
    for (const m of text.matchAll(/req\.params\.(\w+)/g)) paramKeys.add(m[1]);
    if (/req\.body\b/.test(text)) usesBody = true;
  }
  return { inline: [...inline], bodySchemas: [...bodySchemas], querySchemas: [...querySchemas], queryKeys: [...queryKeys], paramKeys: [...paramKeys], usesBody };
}

/**
 * Path berupa template literal (`/:id/${path}`) di dalam `for (const [path, mode] of [[...],[...]])`
 * diekspansi per baris literal. Tak terselesaikan → dikembalikan apa adanya (dengan `${...}`),
 * sehingga drift guard menandainya.
 */
function expandTemplatePath(t: ts.TemplateExpression, sf: ts.SourceFile): string[] {
  let loop: ts.ForOfStatement | undefined;
  for (let n: ts.Node | undefined = t.parent; n; n = n.parent) {
    if (ts.isForOfStatement(n)) {
      loop = n;
      break;
    }
  }
  const unresolved = [t.getText(sf).slice(1, -1)];
  if (!loop || !ts.isVariableDeclarationList(loop.initializer)) return unresolved;
  const decl = loop.initializer.declarations[0];
  let rows: ts.Expression = loop.expression;
  if (ts.isAsExpression(rows)) rows = rows.expression;
  if (!ts.isArrayBindingPattern(decl.name) || !ts.isArrayLiteralExpression(rows)) return unresolved;
  const names = decl.name.elements.map((e) => (ts.isBindingElement(e) && ts.isIdentifier(e.name) ? e.name.text : ''));
  const out: string[] = [];
  for (const row of rows.elements) {
    if (!ts.isArrayLiteralExpression(row)) return unresolved;
    const vals = new Map<string, string>();
    row.elements.forEach((e, i) => {
      const v = strLit(e);
      if (v !== undefined && names[i]) vals.set(names[i], v);
    });
    let p = t.head.text;
    for (const span of t.templateSpans) {
      const key = ts.isIdentifier(span.expression) ? span.expression.text : '';
      if (!vals.has(key)) return unresolved;
      p += (vals.get(key) as string) + span.literal.text;
    }
    out.push(p);
  }
  return out;
}

function joinPath(a: string, b: string): string {
  const j = `${a}/${b}`.replace(/\/+/g, '/');
  return j.length > 1 && j.endsWith('/') ? j.slice(0, -1) : j;
}

function resolveRouterArg(a: ts.Expression, file: string, info: FileInfo): { file: string; routerVar: string } | undefined {
  if (!ts.isIdentifier(a)) return undefined;
  if (info.routers.has(a.text)) return { file, routerVar: a.text };
  const imp = info.imports.get(a.text);
  if (!imp) return undefined;
  const ti = analyze(imp.file);
  const rv = imp.exportName === 'default' ? ti.defaultExport : ti.namedExports.get(imp.exportName);
  return rv ? { file: imp.file, routerVar: rv } : undefined;
}

/** Kumpulkan route sebuah router variabel (rekursif lewat router.use(sub)). */
function collectRouter(
  file: string,
  routerVar: string,
  prefix: string,
  inherited: Guard[],
  auth: 'public' | 'authenticated',
  out: RouteRecord[],
  stack: string[],
): void {
  const key = `${file}#${routerVar}`;
  if (stack.includes(key)) return;
  const info = analyze(file);
  const routerGuards: Guard[] = [];
  const rel = path.relative(serverRoot(), file);

  const visit = (node: ts.Node) => {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      const callee = call.expression;
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === routerVar) {
        const verb = callee.name.text;
        if (METHODS.has(verb) || verb === 'use') {
          const args = [...call.arguments];
          let p = '';
          let expanded: string[] | undefined;
          if (args.length && strLit(args[0]) !== undefined) p = strLit(args.shift()) as string;
          else if (args.length && ts.isTemplateExpression(args[0])) {
            expanded = expandTemplatePath(args[0], info.sf);
            args.shift();
          }
          if (verb === 'use') {
            const guards: Guard[] = [];
            let sub: { file: string; routerVar: string } | undefined;
            for (const a of args) {
              const g = parseGuard(a, info, 'router');
              if (g) guards.push(g);
              else sub = resolveRouterArg(a, file, info) ?? sub;
            }
            if (sub) {
              collectRouter(sub.file, sub.routerVar, joinPath(prefix, p), [...inherited, ...routerGuards, ...guards], auth, out, [...stack, key]);
            } else if (!p) {
              routerGuards.push(...guards);
            }
          } else {
            const guards: Guard[] = [];
            const handlers: ts.Expression[] = [];
            args.forEach((a, i) => {
              const g = i < args.length - 1 ? parseGuard(a, info, 'route') : undefined;
              if (g) guards.push(g);
              else handlers.push(a);
            });
            const facts = handlerFacts(handlers, info);
            for (const pp of expanded ?? [p]) {
              out.push({
                method: verb.toUpperCase(),
                path: joinPath(prefix, pp),
                file: rel,
                line: lineOf(info.sf, node),
                auth,
                guards: [...inherited, ...routerGuards, ...guards],
                ...facts,
              });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(info.sf);
}

/** Inventaris penuh dari index.ts. */
export function buildRouteInventory(): RouteRecord[] {
  const indexFile = path.join(serverRoot(), 'src/index.ts');
  const info = analyze(indexFile);
  const out: RouteRecord[] = [];
  let auth: 'public' | 'authenticated' = 'public';

  const visit = (node: ts.Node) => {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      const callee = call.expression;
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'app') {
        const verb = callee.name.text;
        const args = [...call.arguments];
        const p = strLit(args[0]);
        if (verb === 'use' && p === '/api' && args.length === 2 && ts.isIdentifier(args[1]) && args[1].text === 'authMiddleware') {
          auth = 'authenticated';
        } else if (verb === 'use' && p?.startsWith('/api/')) {
          args.shift();
          const guards: Guard[] = [];
          let sub: { file: string; routerVar: string } | undefined;
          for (const a of args) {
            const g = parseGuard(a, info, 'mount');
            if (g) guards.push(g);
            else sub = resolveRouterArg(a, indexFile, info) ?? sub;
          }
          if (sub) collectRouter(sub.file, sub.routerVar, p, guards, auth, out, []);
        } else if (METHODS.has(verb) && p?.startsWith('/') && p !== '*path') {
          out.push({
            method: verb.toUpperCase(),
            path: p,
            file: 'src/index.ts',
            line: lineOf(info.sf, node),
            auth,
            guards: [],
            inline: [],
            bodySchemas: [],
            querySchemas: [],
            queryKeys: [],
            paramKeys: [],
            usesBody: false,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(info.sf);
  return out
    .map(applyKnownMountOverrides)
    .sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));
}

/**
 * Mount /api/dashboard memakai guard inline (lambda) di index.ts:
 * /stock-alerts & /negative-stock → requireAnyPerm(reports, inventory); lainnya → requirePerm(reports).
 * Diterjemahkan ke guard eksplisit supaya laporan/audit akurat.
 */
function applyKnownMountOverrides(r: RouteRecord): RouteRecord {
  if (!r.path.startsWith('/api/dashboard') || r.path.startsWith('/api/dashboard/maintenance')) return r;
  const inlineGuard = r.guards.find((g) => g.kind === 'inline' && g.scope === 'mount' && g.raw.includes('INVENTORY_DASHBOARD_PATHS'));
  if (!inlineGuard) return r;
  const open = r.path === '/api/dashboard/stock-alerts' || r.path === '/api/dashboard/negative-stock';
  const replaced: Guard = open
    ? { kind: 'requireAnyPerm', args: ['reports', 'inventory'], scope: 'mount', raw: 'requireAnyPerm([reports, inventory]) (lambda di index.ts)' }
    : { kind: 'requirePerm', args: ['reports'], scope: 'mount', raw: "requirePerm('reports') (lambda di index.ts)" };
  return { ...r, guards: r.guards.map((g) => (g === inlineGuard ? replaced : g)) };
}

export function routeKey(r: { method: string; path: string }): string {
  return `${r.method} ${r.path}`;
}

/** Normalisasi nama param supaya `/api/x/:id` ≡ `/api/x/:foo` saat membandingkan handler. */
export function normalizeHandlerPath(p: string): string {
  return p.replace(/:[A-Za-z0-9_]+/g, ':p');
}
