import { readFile } from "node:fs/promises"
import path from "node:path"
import { archiveGame, persistFinalResults, persistLiveState } from "@/lib/server/persist"
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
const DATA_DIR = path.join(process.cwd(), "data", "games", "current")

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

  // 플레이어 상태를 시간 기준으로 동기화 (getSnapshot의 부수효과 제거를 위해 분리)
  private syncPlayerStatuses(now: number) {
    if (this.config.scheduledStartAt !== null && this.config.endAt !== null) {
      if (now >= this.config.endAt) {
        for (const player of this.players.values()) {
          if (player.status !== "ENDED") player.status = "ENDED"
        }
      } else if (now >= this.config.scheduledStartAt) {
        for (const player of this.players.values()) {
          if (player.status === "WAITING") player.status = "PLAYING"
        }
      }
    }
  }

  async loadFromDisk() {
    try {
      const snapshotContent = await readFile(path.join(DATA_DIR, "snapshot.json"), "utf-8")
      const snapshot: GameSnapshot = JSON.parse(snapshotContent)

      if (snapshot.scheduledStartAt !== null && snapshot.endAt !== null && snapshot.durationMs !== null) {
        this.config.scheduledStartAt = snapshot.scheduledStartAt
        this.config.endAt = snapshot.endAt
        this.config.durationMs = snapshot.durationMs

        for (const entry of snapshot.leaderboard) {
          this.players.set(entry.userName, {
            userName: entry.userName,
            createdAt: entry.waitingAt ?? snapshot.now,
            waitingAt: entry.waitingAt,
            status: entry.status,
            submittedWord: entry.submittedWord,
            submittedAt: entry.submittedAt,
            bestSimilarity: entry.bestSimilarity,
            tryCount: entry.tryCount,
            submitOrder: entry.submitOrder,
          })
          if (entry.submitOrder !== null && entry.submitOrder > this.submitSequence) {
            this.submitSequence = entry.submitOrder
          }
        }

        // 게임 설정이 복구된 경우에만 최종 결과도 복구
        // (설정 없이 final-results만 불러오면 이전 게임 결과가 노출됨)
        try {
          const finalContent = await readFile(path.join(DATA_DIR, "final-results.json"), "utf-8")
          const finalData = JSON.parse(finalContent)
          if (finalData.answerWord) {
            this.config.revealedAnswerWord = finalData.answerWord
          }
          if (Array.isArray(finalData.finalResults)) {
            this.finalResults = finalData.finalResults
          }
        } catch {
          // final-results 없으면 빈 상태 유지
        }
      }
    } catch {
      // snapshot 없으면 새 게임으로 시작
    }
  }

  async reset() {
    // 현재 게임 데이터 아카이브
    await archiveGame(this.config.gameId)

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

    this.finalResults = buildFinalResults(
      [...this.players.values()],
      null,
      this.config.scheduledStartAt,
    )

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
    const status = this.getStatus()
    if (status === "ENDED") {
      throw new Error("게임이 종료된 후에는 대기를 취소할 수 없습니다.")
    }

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
    // 제출 전에 플레이어 상태 동기화 (WAITING → PLAYING 등)
    this.syncPlayerStatuses(now)
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
    this.syncPlayerStatuses(now)

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
  gameStore.loadFromDisk().catch(console.error)
}
