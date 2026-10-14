/** Concatena clases ignorando falsy. Sustituye a clsx. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}