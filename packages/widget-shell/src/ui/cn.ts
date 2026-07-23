import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Class-name combiner for the widget kit: clsx conditionals resolved through
 * tailwind-merge, so a caller-supplied `className` can genuinely override a
 * component default (e.g. `bottom-6` beats a baked-in `bottom-3`) instead of
 * depending on stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
