import { persistFinalResults, persistLiveState } from "@/lib/server/persist"
import { buildFinalResults, buildLiveLeaderboard } from "@/lib/server/ranking"
import type {
  ControlRequestBody,
  FinalResultEntry,
  GameConfig,
  GameSnapshot,
  GameStatus,
  Player,
  SubmitRequestBody,
} from "@/lib/shared/types"

const DEFAULT_COUNTDOWN_MS = 3 * 60 * 1000

class GameStore {
  private config: GameConfig
  private players = new Map<string, Player>()
  private finalResults: FinalResultEntry[] = []
  private submitSequence = 0

  constructor() {
    this.config = this.createInitialConfig()
  }

  private createInitialConfig(): GameConfig {
    const now = Date.now() + 5 * 60 * 1000
    const durationMs = 30 * 60 * 1000

    return {
      gameId: crypto.randomUUID(),
      scheduledStartAt: now,
      endAt: now + durationMs,
      countdownMs: DEFAULT_COUNTDOWN_MS,
      durationMs,
      revealedAnswerWord: null,
      endedEarly: false,
    }
  }

  async reset() {
    this.config = this.createInitialConfig()
    this.players = new Map()
    this.finalResults = []
    this.submitSequence = 0

    await persistLiveState(this.getSnapshot())
    await persistFinalResults("", [])

    return this.getSnapshot()
  }

  setGame(payload: ControlRequestBody) {
    const durationMs = payload.durationMinutes * 60 * 1000

    this.config = {
      gameId: crypto.randomUUID(),
      scheduledStartAt: payload.scheduledStartAt,
      endAt: payload.scheduledStartAt + durationMs,
      countdownMs: DEFAULT_COUNTDOWN_MS,
      durationMs,
      revealedAnswerWord: null,
      endedEarly: false,
    }

    this.players = new Map(
      [...this.players.entries()].map(([key, player]) => [
        key,
        {
          ...player,
          status: "WAITING",
          submittedWord: null,
          submittedAt: null,
          bestSimilarity: null,
          tryCount: null,
          submitOrder: null,
        },
      ]),
    )

    this.finalResults = []
    this.submitSequence = 0
  }

  endGameEarly() {
    this.config.endAt = Date.now()
    this.config.endedEarly = true
    for (const player of this.players.values()) {
      player.status = "ENDED"
    }
  }

  getStatus(now = Date.now()): GameStatus {
    if (now >= this.config.endAt) return "ENDED"
    if (now >= this.config.scheduledStartAt) return "RUNNING"
    if (now >= this.config.scheduledStartAt - this.config.countdownMs) return "COUNTDOWN"
    return "SCHEDULED"
  }

  wait(userName: string) {
    const key = userName.trim()
    const now = Date.now()

    const existing = this.players.get(key)
    if (existing) {
      existing.status = "WAITING"
      if (!existing.waitingAt) existing.waitingAt = now
      return existing
    }

    const player: Player = {
      userName: key,
      createdAt: now,
      waitingAt: now,
      status: "WAITING",
      submittedWord: null,
      submittedAt: null,
      bestSimilarity: null,
      tryCount: null,
      submitOrder: null,
    }

    this.players.set(key, player)
    return player
  }

  async submit(body: SubmitRequestBody) {
    const now = Date.now()
    const status = this.getStatus(now)

    if (status === "SCHEDULED" || status === "COUNTDOWN") {
      throw new Error("게임이 아직 시작되지 않았습니다.")
    }

    if (status === "ENDED") {
      throw new Error("게임이 이미 종료되었습니다.")
    }

    const userName = body.userName?.trim()
    const word = body.word?.trim()

    if (!userName) throw new Error("userName은 필수입니다.")
    if (!word) throw new Error("word는 필수입니다.")

    const player = this.players.get(userName)
    if (!player) throw new Error("대기 상태의 참가자가 아닙니다.")
    if (player.submittedWord) throw new Error("이미 제출했습니다. 수정하려면 제출을 취소해 주세요.")

    player.status = "SUBMITTED"
    player.submittedWord = word
    player.submittedAt = now
    player.bestSimilarity = normalizeNullableNumber(body.bestSimilarity)
    player.tryCount = normalizeNullableInteger(body.tryCount)
    this.submitSequence += 1
    player.submitOrder = this.submitSequence

    const snapshot = this.getSnapshot(now)
    await persistLiveState(snapshot)

    return { player, snapshot }
  }

  async cancelSubmit(userName: string) {
    const player = this.players.get(userName.trim())
    if (!player) throw new Error("참가자를 찾을 수 없습니다.")
    if (!player.submittedWord) throw new Error("취소할 제출이 없습니다.")

    player.status = "PLAYING"
    player.submittedWord = null
    player.submittedAt = null
    player.bestSimilarity = null
    player.tryCount = null
    player.submitOrder = null

    const snapshot = this.getSnapshot()
    await persistLiveState(snapshot)

    return { player, snapshot }
  }

  async revealAnswer(answerWord: string) {
    if (!answerWord.trim()) throw new Error("answerWord는 필수입니다.")

    this.config.revealedAnswerWord = answerWord.trim()
    this.finalResults = buildFinalResults(
      [...this.players.values()],
      this.config.revealedAnswerWord,
      this.config.scheduledStartAt,
    )

    await persistFinalResults(this.config.revealedAnswerWord, this.finalResults)
    return {
      answerWord: this.config.revealedAnswerWord,
      finalResults: this.finalResults,
    }
  }

  getFinalResults() {
    return {
      answerWord: this.config.revealedAnswerWord,
      finalResults: this.finalResults,
    }
  }

  async persistCurrentState() {
    await persistLiveState(this.getSnapshot())
  }

  getSnapshot(now = Date.now()): GameSnapshot {
    if (now >= this.config.endAt) {
      for (const player of this.players.values()) {
        player.status = "ENDED"
      }
    } else if (now >= this.config.scheduledStartAt) {
      for (const player of this.players.values()) {
        if (player.status === "WAITING") player.status = "PLAYING"
      }
    }

    return {
      now,
      gameStatus: this.getStatus(now),
      scheduledStartAt: this.config.scheduledStartAt,
      endAt: this.config.endAt,
      durationMs: this.config.durationMs,
      totalPlayers: this.players.size,
      submittedPlayers: [...this.players.values()].filter((p) => p.submittedWord).length,
      leaderboard: buildLiveLeaderboard([...this.players.values()]),
    }
  }
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return num
}

function normalizeNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.trunc(num)
}

declare global {
  var __gameStore__: GameStore | undefined
}

export const gameStore = globalThis.__gameStore__ ?? new GameStore()

if (!globalThis.__gameStore__) {
  globalThis.__gameStore__ = gameStore
}