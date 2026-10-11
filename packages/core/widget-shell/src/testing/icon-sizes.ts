import { readFileSync } from "node:fs"
import ts from "typescript"
import { lineOf, parseSource, relativePath, sourceFiles, walkNodes } from "./source-scan.js"

/**
 * The icon-size gate (CI: modeler-tool-design §11): 16 px in chrome (the kit
 * `Icon`'s default, `dense` for tight rows and bars), 24 px for previews. A
 * 12, 14 or 20 px icon beside them is a third size in the same view. Widget
 * code passes a literal numeric `size` only to icons (the kit `Icon` or a
 * Lucide component); a toolkit `Button`'s `size` is a string variant and
 * stays out of it.
 */
export const CI_ICON_SIZES: readonly number[] = [16, 24]

export interface IconSizeFinding {
  file: string
  line: number
  size: number
}

/** Every literal JSX `size={n}` off the CI sizes in one source file. */
export function iconSizeFindings(source: string, file: string): IconSizeFinding[] {
  const sf = parseSource(source, file)
  const findings: IconSizeFinding[] = []
  walkNodes(sf, (node) => {
    if (
      !ts.isJsxAttribute(node) ||
      node.name.getText(sf) !== "size" ||
      !node.initializer ||
      !ts.isJsxExpression(node.initializer) ||
      !node.initializer.expression ||
      !ts.isNumericLiteral(node.initializer.expression)
    ) {
      return
    }
    const size = Number(node.initializer.expression.text)
    if (!CI_ICON_SIZES.includes(size)) findings.push({ file, line: lineOf(sf, node), size })
  })
  return findings
}

/**
 * Scan every `.ts`/`.tsx` source under `dir` (tests and declarations
 * excluded); findings carry "/"-separated paths relative to `dir`.
 */
export function scanIconSizes(dir: string): IconSizeFinding[] {
  return sourceFiles(dir).flatMap((path) =>
    iconSizeFindings(readFileSync(path, "utf8"), relativePath(dir, path)),
  )
}
