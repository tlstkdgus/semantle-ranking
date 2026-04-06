export type GameStatus = "SCHEDULED" | "COUNTDOWN" | "RUNNING" | "ENDED"
export type PlayerStatus = "IDLE" | "WAITING" | "PLAYING" | "SUBMITTED" | "ENDED"

export interface Player {
  userName: string
  createdAt: number
  waitingAt: number | null
  status: PlayerStatus
  submittedWord: string | null
  submittedAt: number | null
  bestSimilarity: number | null
  tryCount: number | null
  submitOrder: number | null
}

export interface LeaderboardEntry {
  rank: number
  userName: string
  status: PlayerStatus
  waitingAt: number | null
  submittedWord: string | null
  submittedAt: number | null
  bestSimilarity: number | null
  tryCount: number | null
  submitOrder: number | null
}

export interface FinalResultEntry {
  rank: number
  userName: string
  resultType: "CORRECT" | "WRONG" | "NO_SUBMISSION" | "EARLY_ENDED"
  submittedWord: string | null
  submittedAt: number | null
  elapsedMs: number | null
  bestSimilarity: number | null
  tryCount: number | null
  score: number
  submitOrder: number | null
}

export interface GameConfig {
  gameId: string
  scheduledStartAt: number | null
  endAt: number | null
  countdownMs: number
  durationMs: number | null
  revealedAnswerWord: string | null
  endedEarly: boolean
}

export interface GameSnapshot {
  now: number
  gameStatus: GameStatus
  scheduledStartAt: number | null
  endAt: number | null
  durationMs: number | null
  totalPlayers: number
  submittedPlayers: number
  leaderboard: LeaderboardEntry[]
}

export interface WaitRequestBody {
  userName: string
}

export interface SubmitRequestBody {
  userName: string
  word: string
  bestSimilarity?: number | null
  tryCount?: number | null
}

export interface CancelSubmitRequestBody {
  userName: string
}

export interface ControlRequestBody {
  scheduledStartAt: number
  durationMinutes: number
}

export interface RevealAnswerRequestBody {
  answerWord: string
}