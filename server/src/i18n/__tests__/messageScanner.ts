/**
 * Finds user-facing message strings in server source with the TypeScript AST:
 * `error:` / `message:` properties, `new BusinessError(...)` (and other thrown errors, plus `super(...)` in them),
 * the fallback argument of `handleRouteError`, and Zod check messages (`.min(1, '...')`).
 * Dynamic parts (`${x}`, `'a' + x`) become `{0}`, `{1}` so a message reads like a dictionary pattern key.
 * Test-only helper: used by the dictionary coverage test.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

export type MessageKind = 'property' | 'throw' | 'fallback' | 'zod';

export interface ScannedMessage {
  file: string;
  line: number;
  kind: MessageKind;
  /** Literal text, or a pattern with `{n}` for each dynamic part. */
  text: string;
  dynamic: boolean;
  /** Source ranges of the literal chunks (absolute offsets, quotes excluded). */
  spans: Array<{ start: number; end: number; text: string }>;
}

const ZOD_CHECKS = new Set([
  'min', 'max', 'length', 'regex', 'nonempty', 'email', 'url', 'uuid', 'positive', 'nonnegative', 'negative',
  'int', 'refine', 'gt', 'gte', 'lt', 'lte', 'finite', 'datetime', 'multipleOf',
]);

const THROWN = /Error$/;

interface Piece { literal: boolean; text: string; start: number; end: number }

/** Flattens a string-ish expression into literal + dynamic pieces; null when it is not string-ish. */
function pieces(node: ts.Expression, sf: ts.SourceFile): Piece[] | null {
  if (ts.isParenthesizedExpression(node)) return pieces(node.expression, sf);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [{ literal: true, text: node.text, start: node.getStart(sf) + 1, end: node.getEnd() - 1 }];
  }
  if (ts.isTemplateExpression(node)) {
    const out: Piece[] = [];
    const head = node.head;
    out.push({ literal: true, text: head.text, start: head.getStart(sf) + 1, end: head.getEnd() - 2 });
    for (const span of node.templateSpans) {
      out.push({ literal: false, text: '', start: 0, end: 0 });
      const lit = span.literal;
      const tail = ts.isTemplateTail(lit) ? 1 : 2;
      out.push({ literal: true, text: lit.text, start: lit.getStart(sf) + 1, end: lit.getEnd() - tail });
    }
    return out;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = pieces(node.left, sf);
    const r = pieces(node.right, sf);
    if (!l && !r) return null;
    const dyn: Piece[] = [{ literal: false, text: '', start: 0, end: 0 }];
    return [...(l ?? dyn), ...(r ?? dyn)];
  }
  return null;
}

/** String-ish leaves of an initializer, looking through `a ? 'x' : 'y'` and `a || 'x'`. */
function leaves(node: ts.Expression): ts.Expression[] {
  if (ts.isParenthesizedExpression(node)) return leaves(node.expression);
  if (ts.isConditionalExpression(node)) return [...leaves(node.whenTrue), ...leaves(node.whenFalse)];
  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.BarBarToken || node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    return [...leaves(node.left), ...leaves(node.right)];
  }
  return [node];
}

function toMessage(file: string, sf: ts.SourceFile, node: ts.Expression, kind: MessageKind): ScannedMessage | null {
  const ps = pieces(node, sf);
  if (!ps) return null;
  let n = 0;
  let text = '';
  const spans: ScannedMessage['spans'] = [];
  for (const p of ps) {
    if (p.literal) {
      text += p.text;
      if (p.text) spans.push({ start: p.start, end: p.end, text: p.text });
    } else {
      text += `{${n++}}`;
    }
  }
  if (!/[A-Za-z]/.test(text.replace(/\{\d+\}/g, ''))) return null;
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  return { file, line, kind, text, dynamic: n > 0, spans };
}

export function scanSource(file: string, source: string): ScannedMessage[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: ScannedMessage[] = [];
  const add = (node: ts.Expression | undefined, kind: MessageKind) => {
    if (!node) return;
    for (const leaf of leaves(node)) {
      const m = toMessage(file, sf, leaf, kind);
      if (m) out.push(m);
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sf).replace(/['"]/g, '');
      if (name === 'error' || name === 'message') add(node.initializer, 'property');
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && THROWN.test(node.expression.text)) {
      for (const arg of node.arguments ?? []) add(arg, 'throw');
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.SuperKeyword) add(node.arguments[0], 'throw');
      if (ts.isIdentifier(callee) && callee.text === 'handleRouteError') add(node.arguments[3], 'fallback');
      if (ts.isPropertyAccessExpression(callee) && ZOD_CHECKS.has(callee.name.text)) {
        for (const arg of node.arguments) {
          if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg) || ts.isTemplateExpression(arg)) add(arg, 'zod');
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const SKIP_DIRS = new Set(['__tests__', 'node_modules', 'generated', 'scripts', 'i18n']);

export function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...listSourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out.sort();
}

export function scanDir(dir: string, root = dir): ScannedMessage[] {
  return listSourceFiles(dir).flatMap((file) =>
    scanSource(path.relative(root, file), fs.readFileSync(file, 'utf8')),
  );
}
