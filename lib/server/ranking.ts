import type { FinalResultEntry, LeaderboardEntry, Player } from "@/lib/shared/types"

function toPenalty(elapsedMs: number | null, tryCount: number | null): number {
  const t = elapsedMs !== null ? elapsedMs / 1000 : 0
  const x = tryCount ?? 0
  return 3 * Math.log(1 + t / 180) + 0.025 * x
}

export function buildLiveLeaderboard(players: Player[]): LeaderboardEntry[] {
  const sorted = [...players].sort((a, b) => {
    const aSubmitted = a.submitOrder !== null ? 1 : 0
    const bSubmitted = b.submitOrder !== null ? 1 : 0

    if (aSubmitted !== bSubmitted) return bSubmitted - aSubmitted

    if (aSubmitted === 1 && bSubmitted === 1) {
      return (a.submitOrder ?? Number.MAX_SAFE_INTEGER) - (b.submitOrder ?? Number.MAX_SAFE_INTEGER)
    }

    return (a.waitingAt ?? Number.MAX_SAFE_INTEGER) - (b.waitingAt ?? Number.MAX_SAFE_INTEGER)
  })

  return sorted.map((player, index) => ({
    rank: index + 1,
    userName: player.userName,
    status: player.status,
    waitingAt: player.waitingAt,
    submittedWord: player.submittedWord,
    submittedAt: player.submittedAt,
    bestSimilarity: player.bestSimilarity,
    tryCount: player.tryCount,
    submitOrder: player.submitOrder,
  }))
}

export function buildFinalResults(players: Player[], answerWord: string, scheduledStartAt: number): FinalResultEntry[] {
  const results: FinalResultEntry[] = players.map((player) => {
    if (!player.submittedWord) {
      return {
        rank: 0,
        userName: player.userName,
        resultType: "NO_SUBMISSION",
        submittedWord: null,
        submittedAt: null,
        elapsedMs: null,
        bestSimilarity: player.bestSimilarity,
        tryCount: player.tryCount,
        score: -1_000_000_000,
        submitOrder: player.submitOrder,
      }
    }

    const isCorrect = player.submittedWord === answerWord
    const elapsedMs = player.submittedAt ? Math.max(0, player.submittedAt - scheduledStartAt) : null
    const penalty = toPenalty(elapsedMs, player.tryCount)
    const score = -penalty

    if (isCorrect) {
      return {
        rank: 0,
        userName: player.userName,
        resultType: "CORRECT",
        submittedWord: player.submittedWord,
        submittedAt: player.submittedAt,
        elapsedMs,
        bestSimilarity: player.bestSimilarity,
        tryCount: player.tryCount,
        score,
        submitOrder: player.submitOrder,
      }
    }

    return {
      rank: 0,
      userName: player.userName,
      resultType: "WRONG",
      submittedWord: player.submittedWord,
      submittedAt: player.submittedAt,
      elapsedMs,
      bestSimilarity: player.bestSimilarity,
      tryCount: player.tryCount,
      score,
      submitOrder: player.submitOrder,
    }
  })

  results.sort((a, b) => {
    const order = { CORRECT: 0, WRONG: 1, NO_SUBMISSION: 2 }
    if (order[a.resultType] !== order[b.resultType]) {
      return order[a.resultType] - order[b.resultType]
    }

    if (b.score !== a.score) return b.score - a.score

    if ((a.tryCount ?? Number.MAX_SAFE_INTEGER) !== (b.tryCount ?? Number.MAX_SAFE_INTEGER)) {
      return (a.tryCount ?? Number.MAX_SAFE_INTEGER) - (b.tryCount ?? Number.MAX_SAFE_INTEGER)
    }

    if ((a.elapsedMs ?? Number.MAX_SAFE_INTEGER) !== (b.elapsedMs ?? Number.MAX_SAFE_INTEGER)) {
      return (a.elapsedMs ?? Number.MAX_SAFE_INTEGER) - (b.elapsedMs ?? Number.MAX_SAFE_INTEGER)
    }

    return (a.submitOrder ?? Number.MAX_SAFE_INTEGER) - (b.submitOrder ?? Number.MAX_SAFE_INTEGER)
  })

  results.forEach((entry, index) => {
    entry.rank = index + 1
  })

  return results
}