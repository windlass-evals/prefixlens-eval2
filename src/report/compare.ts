// Compares the analyses of two traces, a before and an after: what a change to a harness did to its cache.

import type { Analysis } from "../analyze.ts"
import { escapeJsonControls, printable } from "../printable.ts"
import { exact, percent } from "./format.ts"

export interface Metric {
  before: number
  after: number
  /** after - before. For hit_rate, in fractions of the prompt (0.05 is five percentage points). */
  change: number
  /** change / before, or null when before is 0. Not given for hit_rate, which is already a share. */
  change_ratio?: number | null
}

export interface Comparison {
  /** Model calls in each trace. */
  calls: Metric
  /** Prompt tokens summed over every call: read from the cache, written and uncached. */
  prompt_tokens: Metric
  /** Prompt tokens read from the cache, as a share of all prompt tokens (0 to 1). */
  hit_rate: Metric
  /** Cached tokens the calls did not read though the call before them in their lane had left them cached, summed over every call. Includes declared intentional breaks. */
  lost_tokens: Metric
}

export interface CompareOptions {
  /** The traces, as named on the command line. */
  before?: string
  after?: string
}

/** Lost tokens over every call, whatever the cause and whether or not the harness declared the break. */
export function lostTokens(analysis: Analysis): number {
  return analysis.turns.reduce((total, turn) => total + turn.lost_tokens, 0)
}

export function compare(before: Analysis, after: Analysis): Comparison {
  const count = (a: number, b: number): Metric => ({ before: a, after: b, change: b - a, change_ratio: a === 0 ? null : (b - a) / a })
  return {
    calls: count(before.summary.turns, after.summary.turns),
    prompt_tokens: count(before.summary.tokens.prompt, after.summary.tokens.prompt),
    hit_rate: { before: before.summary.hit_rate, after: after.summary.hit_rate, change: after.summary.hit_rate - before.summary.hit_rate },
    lost_tokens: count(lostTokens(before), lostTokens(after)),
  }
}

const signed = (value: number, format: (n: number) => string) => (value > 0 ? `+${format(value)}` : value < 0 ? `-${format(-value)}` : format(0))
const ratio = (metric: Metric) =>
  metric.change_ratio === null || metric.change_ratio === undefined ? "" : metric.change === 0 ? "0%" : `${metric.change > 0 ? "+" : "-"}${Math.abs(metric.change_ratio * 100).toFixed(Math.abs(metric.change_ratio) < 0.1 ? 1 : 0)}%`
const points = (value: number) => `${(value * 100).toFixed(1)}`

export function renderCompare(comparison: Comparison, options: CompareOptions = {}): string {
  const rows: string[][] = [
    ["", "before", "after", "change", ""],
    ["model calls", exact(comparison.calls.before), exact(comparison.calls.after), signed(comparison.calls.change, exact), ratio(comparison.calls)],
    ["prompt tokens", exact(comparison.prompt_tokens.before), exact(comparison.prompt_tokens.after), signed(comparison.prompt_tokens.change, exact), ratio(comparison.prompt_tokens)],
    [
      "cache-read share",
      percent(comparison.hit_rate.before),
      percent(comparison.hit_rate.after),
      `${signed(Math.round(comparison.hit_rate.change * 1000) / 1000, points)} pts`,
      "",
    ],
    ["lost tokens", exact(comparison.lost_tokens.before), exact(comparison.lost_tokens.after), signed(comparison.lost_tokens.change, exact), ratio(comparison.lost_tokens)],
  ]
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)))
  const line = (row: string[]) => row.map((cell, column) => (column === 0 ? cell.padEnd(widths[column]!) : cell.padStart(widths[column]!))).join("  ").trimEnd()
  const out = ["prefixlens compare", ...(options.before !== undefined && options.after !== undefined ? [`  before: ${options.before}`, `  after:  ${options.after}`] : []), "", ...rows.map(line)]
  // Trace paths come from the command line and print to a terminal.
  return printable(out.join("\n")) + "\n"
}

export function renderCompareJson(comparison: Comparison, options: CompareOptions = {}): string {
  const traces = options.before !== undefined && options.after !== undefined ? { before: options.before, after: options.after } : undefined
  return escapeJsonControls(JSON.stringify({ compare: "prefixlens", ...(traces ? { traces } : {}), ...comparison }, null, 2)) + "\n"
}
