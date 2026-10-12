import { cn, FOCUS_RING_INSET } from "@miragon/mcp-toolkit-ui"

/**
 * One entry of an action menu (CI §8 "Menüs / Dropdowns"): an entry on the
 * small radius in the dense text step, its icon in front, the blue-soft
 * hover (`--accent`; in dark the lifted surface) and no button chrome of its
 * own: the menu's card is the surface. The focused entry takes the same tint
 * plus a ring drawn inside it, so a neighbouring entry never covers it.
 *
 * It goes with `role="menuitem"` and `tabIndex={-1}`: the menu moves the
 * focus between its entries with the arrow keys, not with Tab.
 */
export const MENU_ITEM = cn(
  "text-foreground text-dense flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-start font-medium whitespace-nowrap transition-colors",
  "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
  "disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  FOCUS_RING_INSET,
)
