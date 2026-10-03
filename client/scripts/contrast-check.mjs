#!/usr/bin/env node
/**
 * WCAG 2.x contrast check for the Entaris design tokens.
 *
 * Reads the theme blocks (`:root`, `.light`, `.dark`) straight from
 * src/index.css, resolves var() chains per theme and checks every pair below:
 *   - text pairs      must be ≥ 4.5:1 (WCAG 1.4.3, normal text)
 *   - non-text pairs  must be ≥ 3:1   (WCAG 1.4.11, UI boundaries, focus, icons)
 *
 * Usage: node scripts/contrast-check.mjs [--css path/to/index.css]
 * Exits 1 when any pair fails, so it can gate CI.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const argIdx = process.argv.indexOf('--css')
const CSS_FILE = argIdx > -1 ? process.argv[argIdx + 1] : path.join(here, '..', 'src', 'index.css')

const TEXT_MIN = 4.5
const NON_TEXT_MIN = 3

/**
 * [foreground, background, kind, note]. Names are CSS custom properties
 * without the leading `--`, or a literal hex colour ("#FFFFFF").
 */
const PAIRS = [
  // Body text on every surface
  ...['background', 'surface', 'surface-sunken', 'surface-raised', 'surface-hover'].flatMap((bg) => [
    ['text', bg, 'text', 'primary text'],
    ['text-secondary', bg, 'text', 'secondary text'],
    ['text-muted', bg, 'text', 'muted text / caption / remapped gray-300/400'],
  ]),
  // shadcn aliases as pages use them
  ['foreground', 'background', 'text'],
  ['card-foreground', 'card', 'text'],
  ['popover-foreground', 'popover', 'text'],
  ['muted-foreground', 'muted', 'text', 'table header, filter bar'],
  ['muted-foreground', 'card', 'text'],
  ['muted-foreground', 'background', 'text'],
  ['secondary-foreground', 'secondary', 'text', 'secondary button'],
  ['accent-foreground', 'accent', 'text', 'hover row / menu item'],
  ['background', 'foreground', 'text', 'tooltip (inverted chip)'],

  // Primary
  ['primary-foreground', 'primary', 'text', 'primary button'],
  ['primary-foreground', 'primary-hover', 'text', 'primary button hover'],
  ['#FFFFFF', 'primary-solid', 'text', 'legacy bg-blue-600 text-white'],
  ['#FFFFFF', 'primary-solid-hover', 'text', 'legacy bg-blue-600 hover'],
  ['primary', 'surface', 'text', 'link on card'],
  ['primary', 'background', 'text', 'link on canvas'],
  ['primary', 'primary-subtle', 'text', 'text-blue-500/600 on bg-blue-50 remap'],
  ['primary-subtle-foreground', 'primary-subtle', 'text', 'selected row / active nav / badge-blue'],
  ['primary-subtle-foreground', 'surface', 'text', 'text-blue-700/800 remap'],
  ['sidebar-foreground', 'sidebar', 'text'],
  ['sidebar-accent-foreground', 'sidebar-accent', 'text', 'active nav item'],

  // Semantic: solid fill + its foreground; tint + its text; text on surface
  ...['success', 'warning', 'danger', 'info'].flatMap((t) => [
    [`${t}-foreground`, t, 'text', `${t} solid badge/button`],
    [`${t}-text`, `${t}-subtle`, 'text', `${t} status badge`],
    [`${t}-text`, 'surface', 'text', `${t} inline text`],
    [`${t}-text`, 'background', 'text', `${t} inline text on canvas`],
    [t, 'surface', 'non-text', `${t} icon / dot / border`],
  ]),
  ['danger-foreground', 'danger-hover', 'text', 'danger button hover'],
  ['destructive-foreground', 'destructive', 'text'],
  ['neutral-text', 'neutral-subtle', 'text', 'neutral badge'],

  // Non-text: control boundaries and focus indicator
  ['input', 'surface', 'non-text', 'input border on card'],
  ['input', 'background', 'non-text', 'input border on canvas'],
  ['input', 'surface-sunken', 'non-text', 'input border in filter bar'],
  ['border-strong', 'surface', 'non-text', 'outline button / checkbox'],
  ['ring', 'surface', 'non-text', 'focus ring on card'],
  ['ring', 'background', 'non-text', 'focus ring on canvas'],
  ['primary', 'surface', 'non-text', 'primary button boundary'],
  ['brand-accent', 'surface', 'non-text', 'AIRA / accent marks'],

  // Charts: each series against the card it is drawn on
  ...[1, 2, 3, 4, 5, 6].map((n) => [`chart-${n}`, 'surface', 'non-text', `chart series ${n}`]),
]

// ─── CSS parsing ────────────────────────────────────────────────────────────

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Top-level-ish blocks whose selector list only uses :root / .light / .dark. */
function themeBlocks(css) {
  const blocks = []
  const re = /(^|\n)([^{}\n@][^{}]*?)\{([^{}]*)\}/g
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const selectors = m[2].split(',').map((x) => x.trim()).filter(Boolean)
    if (!selectors.length || !selectors.every((x) => [':root', '.light', '.dark'].includes(x))) continue
    const decls = {}
    for (const d of m[3].split(';')) {
      const i = d.indexOf(':')
      if (i < 0) continue
      const name = d.slice(0, i).trim()
      if (!name.startsWith('--')) continue
      decls[name.slice(2)] = d.slice(i + 1).trim()
    }
    blocks.push({ selectors, decls })
  }
  return blocks
}

function themeVars(blocks, theme) {
  const out = {}
  for (const b of blocks) {
    const applies =
      theme === 'light'
        ? b.selectors.includes(':root') || b.selectors.includes('.light')
        : true // dark element also matches :root rules (class sits on <html>)
    if (theme === 'light' && b.selectors.length === 1 && b.selectors[0] === '.dark') continue
    if (applies) Object.assign(out, b.decls)
  }
  return out
}

function resolve(vars, name, seen = new Set()) {
  if (name.startsWith('#')) return name // literal colour (e.g. hardcoded text-white)
  if (seen.has(name)) throw new Error(`circular var: ${[...seen, name].join(' → ')}`)
  const raw = vars[name]
  if (raw === undefined) throw new Error(`undefined token --${name}`)
  const m = raw.match(/^var\(--([\w-]+)\)$/)
  if (m) return resolve(vars, m[1], new Set([...seen, name]))
  return raw
}

// ─── Colour maths ───────────────────────────────────────────────────────────

function parseColor(value) {
  const v = value.trim().toLowerCase()
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (m) {
    const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  }
  m = v.match(/^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/)
  if (m) return m.slice(1, 4).map(Number)
  if (v === 'white') return [255, 255, 255]
  if (v === 'black') return [0, 0, 0]
  throw new Error(`unsupported colour "${value}" (use hex or rgb for checked tokens)`)
}

function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a, b) {
  const [l1, l2] = [luminance(parseColor(a)), luminance(parseColor(b))].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

const label = (n) => (n.startsWith('#') ? 'literal' : `--${n}`)

// ─── Run ────────────────────────────────────────────────────────────────────

const css = stripComments(fs.readFileSync(CSS_FILE, 'utf8'))
const blocks = themeBlocks(css)
let failures = 0
let checked = 0

for (const theme of ['light', 'dark']) {
  const vars = themeVars(blocks, theme)
  console.log(`\n${theme.toUpperCase()}`)
  console.log('  ratio  min  result  fg → bg  (note)')
  for (const [fg, bg, kind, note] of PAIRS) {
    const min = kind === 'text' ? TEXT_MIN : NON_TEXT_MIN
    let line
    try {
      const fgVal = resolve(vars, fg)
      const bgVal = resolve(vars, bg)
      const ratio = contrast(fgVal, bgVal)
      const ok = ratio >= min
      if (!ok) failures++
      checked++
      line = `  ${ratio.toFixed(2).padStart(5)}  ${min.toFixed(1)}  ${ok ? 'pass' : 'FAIL'}    ${label(fg)} ${fgVal} → ${label(bg)} ${bgVal}${note ? `  (${note})` : ''}`
    } catch (err) {
      failures++
      line = `  ERROR  --${fg} → --${bg}: ${err.message}`
    }
    console.log(line)
  }
}

console.log(`\n${checked} pairs checked, ${failures} failing.`)
process.exit(failures ? 1 : 0)
