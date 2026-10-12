import { readFileSync } from "node:fs"
import {
  lineOf,
  literalText,
  parseSource,
  relativePath,
  sourceFiles,
  walkNodes,
} from "./source-scan.js"

/**
 * The type-scale gate (CLAUDE.md "Design-System"; modeler-tool-design §4,
 * the toolkit's `TYPE_SCALE`): widget text sits on the five steps of the
 * scale — `text-title` (28/700, a widget's page title, the CI h2),
 * `text-section` (21/600), `text-body` (16), `text-dense` (14, dense tables
 * and controls) and `text-small` (13, the FLOOR) — and nothing renders
 * smaller than 13 px. Two rules:
 *
 * - `below-floor`: `text-xs` (12 px), `text-2xs`, an arbitrary size under
 *   13 px (`text-[11px]`, `text-[0.7rem]`);
 * - `off-scale`: Tailwind's own sizes (`text-sm`, `text-base`, `text-lg` …
 *   `text-9xl`) and any other arbitrary size — the step names say what the
 *   text IS, so the scale changes in one place.
 *
 * It reads string and template literals (class lists), never comments.
 */
export type TypeScaleRule = "below-floor" | "off-scale"

export interface TypeScaleFinding {
  file: string
  line: number
  rule: TypeScaleRule
  match: string
  text: string
}

/** The floor, in px (CI §4 "klein"); `0.8125rem` at the default 16 px root. */
const FLOOR_PX = 13
const ROOT_PX = 16

const BELOW_FLOOR_CLASS = /(?<![\w-])(?:[\w-]+:)*text-(?:2?xs)(?![\w-])/g
const OFF_SCALE_CLASS = /(?<![\w-])(?:[\w-]+:)*text-(?:sm|base|lg|[2-9]?xl)(?![\w-])/g
/** `text-[11px]`, `text-[0.8rem]`, `text-[length:12px]`. */
const ARBITRARY_SIZE = /(?<![\w-])(?:[\w-]+:)*text-\[(?:length:)?(\d*\.?\d+)(px|rem|em)\]/g

/** The px value of an arbitrary size. */
function px(value: string, unit: string): number {
  const n = Number(value)
  return unit === "px" ? n : n * ROOT_PX
}

/** Every off-scale or below-floor text size in one literal. */
function literalFindings(text: string): Array<{ rule: TypeScaleRule; match: string; at: number }> {
  const out: Array<{ rule: TypeScaleRule; match: string; at: number }> = []
  for (const m of text.matchAll(BELOW_FLOOR_CLASS)) {
    out.push({ rule: "below-floor", match: m[0], at: m.index })
  }
  for (const m of text.matchAll(OFF_SCALE_CLASS)) {
    out.push({ rule: "off-scale", match: m[0], at: m.index })
  }
  for (const m of text.matchAll(ARBITRARY_SIZE)) {
    const rule = px(m[1], m[2]) < FLOOR_PX ? "below-floor" : "off-scale"
    out.push({ rule, match: m[0], at: m.index })
  }
  return out.sort((a, b) => a.at - b.at)
}

/** Every text size off the scale (or below its floor) in one source file. */
export function typeScaleFindings(source: string, file: string): TypeScaleFinding[] {
  const sf = parseSource(source, file)
  const findings: TypeScaleFinding[] = []
  walkNodes(sf, (node) => {
    const text = literalText(node)
    if (text === undefined) return
    for (const { rule, match } of literalFindings(text)) {
      findings.push({ file, line: lineOf(sf, node), rule, match, text: text.trim().slice(0, 80) })
    }
  })
  return findings
}

export interface ScanTypeScaleOptions {
  /**
   * The rules to enforce (default both). A package still migrating its
   * widgets onto the steps starts with `["below-floor"]`.
   */
  rules?: readonly TypeScaleRule[]
}

/**
 * Scan every `.ts`/`.tsx` source under `dir` (tests and declarations
 * excluded) for text sizes off the type scale. Findings carry "/"-separated
 * paths relative to `dir`.
 */
export function scanTypeScale(dir: string, options: ScanTypeScaleOptions = {}): TypeScaleFinding[] {
  const rules = new Set<TypeScaleRule>(options.rules ?? ["below-floor", "off-scale"])
  return sourceFiles(dir)
    .flatMap((path) => typeScaleFindings(readFileSync(path, "utf8"), relativePath(dir, path)))
    .filter((finding) => rules.has(finding.rule))
}
