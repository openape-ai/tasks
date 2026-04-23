/**
 * Output helpers. Respects `--quiet` (suppresses progress) and `--json`
 * (machine-readable). Errors always go to stderr.
 */

export interface OutputOptions {
  json?: boolean
  quiet?: boolean
}

export function info(msg: string, opts: OutputOptions = {}): void {
  if (opts.quiet) return
  process.stderr.write(`${msg}\n`)
}

export function error(msg: string): void {
  process.stderr.write(`error: ${msg}\n`)
}

export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
}

export function printLine(line: string): void {
  process.stdout.write(`${line}\n`)
}
