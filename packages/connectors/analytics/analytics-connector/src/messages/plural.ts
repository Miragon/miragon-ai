import type { Message } from "@miragon/mcp-toolkit-core"

/**
 * A counted message: `one` when the count param is exactly 1, `other`
 * otherwise — no "1 incidents", no "Instanz(en)" in a view. `{name}`
 * placeholders take the params as given, so a widget passes the count
 * already formatted for the view's locale (`formatNumber(n)`): "1" reads as
 * one in every locale this module speaks, "1.234" and "1,234" as many.
 */
export function plural(param: string, one: string, other: string): Message {
  return (params) => {
    const template = String(params[param]) === "1" ? one : other
    return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
      const value = params[name] as string | number | undefined
      return value === undefined ? whole : String(value)
    })
  }
}
