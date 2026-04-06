import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { FinalResultEntry, GameSnapshot } from "@/lib/shared/types"

const DATA_DIR = path.join(process.cwd(), "data", "games", "current")

export async function persistLiveState(snapshot: GameSnapshot) {
  await mkdir(DATA_DIR, { recursive: true })

  await writeFile(
    path.join(DATA_DIR, "snapshot.json"),
    JSON.stringify(snapshot, null, 2),
    "utf-8",
  )

  const csv = [
    ["rank", "userName", "status", "submittedWord", "submittedAt", "bestSimilarity", "tryCount", "submitOrder"].join(","),
    ...snapshot.leaderboard.map((entry) =>
      [
        entry.rank,
        csvEscape(entry.userName),
        entry.status,
        csvEscape(entry.submittedWord ?? ""),
        entry.submittedAt ?? "",
        entry.bestSimilarity ?? "",
        entry.tryCount ?? "",
        entry.submitOrder ?? "",
      ].join(","),
    ),
  ].join("\n")

  await writeFile(path.join(DATA_DIR, "leaderboard.csv"), csv, "utf-8")
}

export async function persistFinalResults(answerWord: string, finalResults: FinalResultEntry[]) {
  await mkdir(DATA_DIR, { recursive: true })

  await writeFile(
    path.join(DATA_DIR, "final-results.json"),
    JSON.stringify({ answerWord, finalResults }, null, 2),
    "utf-8",
  )

  const csv = [
    ["rank", "userName", "resultType", "submittedWord", "submittedAt", "elapsedMs", "bestSimilarity", "tryCount", "score", "submitOrder"].join(","),
    ...finalResults.map((entry) =>
      [
        entry.rank,
        csvEscape(entry.userName),
        entry.resultType,
        csvEscape(entry.submittedWord ?? ""),
        entry.submittedAt ?? "",
        entry.elapsedMs ?? "",
        entry.bestSimilarity ?? "",
        entry.tryCount ?? "",
        entry.score,
        entry.submitOrder ?? "",
      ].join(","),
    ),
  ].join("\n")

  await writeFile(path.join(DATA_DIR, "final-results.csv"), csv, "utf-8")
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}