// A before/after comparison of whole traces, not a pairing of individual calls.

import type { Analysis } from "../analyze.ts"
import { escapeJsonControls, printable } from "../printable.ts"
import { exact } from "./format.ts"

export function comparisonSide(trace: string, analysis: Analysis) {
  return {
    trace,
    calls: analysis.summary.turns,
    prompt_tokens: analysis.summary.tokens.prompt,
    cache_read_share: analysis.summary.hit_rate,
    lost_tokens: analysis.turns.reduce((total, turn) => total + turn.lost_tokens, 0),
  }
}

type Side = ReturnType<typeof comparisonSide>

export function compareTraces(before: Side, after: Side) {
  return {
    compare: "prefixlens",
    version: 1,
    before,
    after,
    delta: {
      calls: after.calls - before.calls,
      prompt_tokens: after.prompt_tokens - before.prompt_tokens,
      cache_read_share_pp: (after.cache_read_share - before.cache_read_share) * 100,
      lost_tokens: after.lost_tokens - before.lost_tokens,
    },
  }
}

type Comparison = ReturnType<typeof compareTraces>

export function renderComparison({ before, after, delta }: Comparison): string {
  const name = (side: Side) => side.trace === "-" ? "stdin" : printable(side.trace).replaceAll("\n", "\\n").replaceAll("\t", "\\t")
  const signed = (value: number) => `${value > 0 ? "+" : ""}${exact(value)}`
  const share = (value: number) => `${(value * 100).toFixed(2)}%`
  const pp = Number(delta.cache_read_share_pp.toFixed(2))
  const rows = [
    ["Metric", "Before", "After", "Delta"],
    ["Calls", exact(before.calls), exact(after.calls), signed(delta.calls)],
    ["Prompt tokens", exact(before.prompt_tokens), exact(after.prompt_tokens), signed(delta.prompt_tokens)],
    ["Cache-read share", share(before.cache_read_share), share(after.cache_read_share), `${pp > 0 ? "+" : ""}${pp.toFixed(2)} pp`],
    ["Lost tokens", exact(before.lost_tokens), exact(after.lost_tokens), signed(delta.lost_tokens)],
  ]
  const widths = rows[0]!.map((_, col) => Math.max(...rows.map((row) => row[col]!.length)))
  const table = rows.map((row) => row.map((cell, col) => col === 0 ? cell.padEnd(widths[col]!) : cell.padStart(widths[col]!)).join("  "))
  return ["prefixlens compare", `Before: ${name(before)}`, `After:  ${name(after)}`, "", ...table, ""].join("\n")
}

export function renderComparisonJson(comparison: Comparison): string {
  return escapeJsonControls(JSON.stringify(comparison, null, 2)) + "\n"
}
