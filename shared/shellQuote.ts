/**
 * A value as one POSIX shell word, whatever it contains.
 *
 * Single quotes take everything literally — `$`, backticks, `;`, spaces — and
 * the only thing that needs care is a single quote itself, which closes the
 * quoting, adds an escaped quote, and reopens it. One copy of this, used by the
 * desktop app, the worker and the agent commands both share: it was written
 * out in each of them, and a fix to one would not have reached the others.
 */
export function posixQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
