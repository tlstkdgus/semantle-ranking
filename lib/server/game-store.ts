import { persistFinalResults, persistLiveState } from "@/lib/server/persist"
import { buildFinalResults, buildLiveLeaderboard } from "@/lib/server/ranking"
import { sseBroker } from "@/lib/server/sse-broker"
import type {
  ControlRequestBody,
  FinalResultEntry,
  GameConfig,
  GameSnapshot,
  GameStatus,
  Player,
  SubmitRequestBody,
} from "@/lib/shared/types"

const DEFAULT_COUNTDOWN_MS = 10 * 1000

class GameStore {
  private config: GameConfig
  private players = new Map<string, Player>()
  private finalResults: FinalResultEntry[] = []
  private submitSequence = 0
  private previousStatus: GameStatus = "SCHEDULED"

  constructor() {
    this.config = this.createInitialConfig()
    setInterval(() => {
      const snapshot = this.getSnapshot()
      if (this.previousStatus !== snapshot.gameStatus) {
        sseBroker.broadcast("game_state_changed", snapshot)
        this.previousStatus = snapshot.gameStatus
      }
    }, 1000)
  }

  private createInitialConfig(): GameConfig {
    return {
      gameId: crypto.randomUUID(),
      scheduledStartAt: null,
      endAt: null,
      countdownMs: DEFAULT_COUNTDOWN_MS,
      durationMs: null,
      revealedAnswerWord: null,
      endedEarly: false,
    }
  }

  async reset() {
    this.config = this.createInitialConfig()
    this.players = new Map()
    this.finalResults = []
    this.submitSequence = 0
    this.previousStatus = "SCHEDULED"

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
    this.previousStatus = "SCHEDULED"
  }

  async endGameEarly() {
    this.config.endAt = Date.now()
    this.config.endedEarly = true
    for (const player of this.players.values()) {
      player.status = "ENDED"
    }

    // 조기 종료 시에도 최종 결과를 계산 (정답 없음)
    this.finalResults = buildFinalResults(
      [...this.players.values()],
      null, // 정답 없음
      this.config.scheduledStartAt,
    )

    // 조기 종료 시 정답을 빈 문자열로 저장
    await persistFinalResults("", this.finalResults)
  }

  getStatus(now = Date.now()): GameStatus {
    if (this.config.scheduledStartAt === null || this.config.endAt === null || this.config.durationMs === null) {
      return "SCHEDULED"
    }

    if (now >= this.config.endAt) return "ENDED"
    if (now >= this.config.scheduledStartAt) return "RUNNING"
    if (now >= this.config.scheduledStartAt - this.config.countdownMs) return "COUNTDOWN"
    return "SCHEDULED"
  }

  wait(userName: string) {
    const key = userName.trim()
    const existing = this.players.get(key)
    if (existing) {
      throw new Error("이미 등록된 닉네임입니다.")
    }

    const player: Player = {
      userName: key,
      createdAt: Date.now(),
      waitingAt: Date.now(),
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

  waitCancel(userName: string) {
    const key = userName.trim()
    const player = this.players.get(key)
    if (!player) {
      throw new Error("등록되지 않은 사용자입니다.")
    }

    this.players.delete(key)
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

    const parsedBestSimilarity = parseBestSimilarity(body.bestSimilarity)
    const parsedTryCount = parseTryCount(body.tryCount)

    player.status = "SUBMITTED"
    player.submittedWord = word
    player.submittedAt = now
    player.bestSimilarity = parsedBestSimilarity
    player.tryCount = parsedTryCount
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
    if (this.config.scheduledStartAt !== null && this.config.endAt !== null) {
      if (now >= this.config.endAt) {
        for (const player of this.players.values()) {
          player.status = "ENDED"
        }
      } else if (now >= this.config.scheduledStartAt) {
        for (const player of this.players.values()) {
          if (player.status === "WAITING") player.status = "PLAYING"
        }
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

function parseBestSimilarity(value: unknown): number {
  const raw = String(value ?? "").trim()
  if (!/^(100(\.0+)?|[0-9]{1,2}(\.[0-9]+)?)$/.test(raw)) {
    throw new Error("최고 유사도는 0 이상 100 이하의 숫자여야 합니다.")
  }

  const num = Number(raw)
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    throw new Error("최고 유사도는 0 이상 100 이하의 숫자여야 합니다.")
  }

  return num
}

function parseTryCount(value: unknown): number {
  const raw = String(value ?? "").trim()
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error("시도 횟수는 1 이상의 정수여야 합니다.")
  }

  const num = Number(raw)
  if (!Number.isInteger(num) || num < 1) {
    throw new Error("시도 횟수는 1 이상의 정수여야 합니다.")
  }

  return num
}

declare global {
  var __gameStore__: GameStore | undefined
}

export const gameStore = globalThis.__gameStore__ ?? new GameStore()

if (!globalThis.__gameStore__) {
  globalThis.__gameStore__ = gameStore
}