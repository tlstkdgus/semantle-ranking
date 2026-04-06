"use client"

import { FormEvent, useEffect, useState } from "react"
import type { FinalResultEntry, GameSnapshot } from "@/lib/shared/types"

type StateResponse = {
  ok: boolean
  snapshot: GameSnapshot
}

type FinalResultsResponse = {
  ok: boolean
  answerWord: string | null
  finalResults: FinalResultEntry[]
}

const initialSnapshot: GameSnapshot = {
  now: 0,
  gameStatus: "SCHEDULED",
  scheduledStartAt: null,
  endAt: null,
  durationMs: null,
  totalPlayers: 0,
  submittedPlayers: 0,
  leaderboard: [],
}

export default function AdminPage() {
  const [snapshot, setSnapshot] = useState<GameSnapshot>(initialSnapshot)
  const [scheduledStartAt, setScheduledStartAt] = useState("")
  const [durationMinutes, setDurationMinutes] = useState("30")
  const [answerWord, setAnswerWord] = useState("")
  const [revealedAnswer, setRevealedAnswer] = useState<string | null>(null)
  const [finalResults, setFinalResults] = useState<FinalResultEntry[]>([])
  const [message, setMessage] = useState("")

  useEffect(() => {
    fetchState()
    fetchFinalResults()

    const eventSource = new EventSource("/api/events")

    const handleSnapshot = (event: MessageEvent) => {
      const data = JSON.parse(event.data) as GameSnapshot
      setSnapshot(data)
    }

    const handleAnswerRevealed = (event: MessageEvent) => {
      const data = JSON.parse(event.data) as {
        answerWord: string
        finalResults: FinalResultEntry[]
      }
      setRevealedAnswer(data.answerWord)
      setFinalResults(data.finalResults)
      setMessage("정답 등록이 완료되었습니다.")
    }

    eventSource.addEventListener("snapshot", handleSnapshot)
    eventSource.addEventListener("leaderboard_updated", handleSnapshot)
    eventSource.addEventListener("game_state_changed", handleSnapshot)
    eventSource.addEventListener("answer_revealed", handleAnswerRevealed)

    return () => {
      eventSource.removeEventListener("snapshot", handleSnapshot)
      eventSource.removeEventListener("leaderboard_updated", handleSnapshot)
      eventSource.removeEventListener("game_state_changed", handleSnapshot)
      eventSource.removeEventListener("answer_revealed", handleAnswerRevealed)
      eventSource.close()
    }
  }, [])

  useEffect(() => {
    setScheduledStartAt(getDefaultStartDateTimeLocal())
  }, [])

  async function fetchState() {
    const res = await fetch("/api/game/state", { cache: "no-store" })
    const data = (await res.json()) as StateResponse
    if (data.ok) {
      setSnapshot(data.snapshot)
    }
  }

  async function fetchFinalResults() {
    const res = await fetch("/api/game/final-results", { cache: "no-store" })
    const data = (await res.json()) as FinalResultsResponse
    if (data.ok) {
      setRevealedAnswer(data.answerWord)
      setFinalResults(data.finalResults ?? [])
    }
  }

  async function handleSetGame(e: FormEvent) {
    e.preventDefault()

    if (!scheduledStartAt) {
      setMessage("시작 시각을 입력해 주세요.")
      return
    }

    const timestamp = new Date(scheduledStartAt).getTime()
    if (!Number.isFinite(timestamp)) {
      setMessage("올바른 시작 시각이 아닙니다.")
      return
    }

    const minutes = Number(durationMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setMessage("게임 길이는 0보다 큰 숫자여야 합니다.")
      return
    }

    const res = await fetch("/api/game/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scheduledStartAt: timestamp,
        durationMinutes: minutes,
      }),
    })

    const data = await res.json()

    if (!data.ok) {
      setMessage(data.message ?? "게임 설정에 실패했습니다.")
      return
    }

    setSnapshot(data.snapshot)
    setMessage("게임 시작 시각과 길이가 설정되었습니다.")
  }

  async function handleEndEarly() {
    const res = await fetch("/api/game/end", {
      method: "POST",
    })

    const data = await res.json()

    if (!data.ok) {
      setMessage(data.message ?? "조기 종료에 실패했습니다.")
      return
    }

    setSnapshot(data.snapshot)
    setMessage("게임이 조기 종료되었습니다.")
  }

  async function handleRevealAnswer(e: FormEvent) {
    e.preventDefault()

    if (!answerWord.trim()) {
      setMessage("정답 단어를 입력해 주세요.")
      return
    }

    const res = await fetch("/api/game/reveal-answer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        answerWord: answerWord.trim(),
      }),
    })

    const data = await res.json()

    if (!data.ok) {
      setMessage(data.message ?? "정답 등록에 실패했습니다.")
      return
    }

    setRevealedAnswer(data.answerWord)
    setFinalResults(data.finalResults)
    setMessage("정답 등록 및 최종 결과 계산이 완료되었습니다.")
  }

  async function handleResetStore() {
    const ok = window.confirm("현재 참가자, 제출 정보, 최종 결과를 모두 초기화하시겠습니까?")
    if (!ok) return

    const res = await fetch("/api/game/reset", {
      method: "POST",
    })

    if (!res.ok) {
      const text = await res.text()
      setMessage(`초기화에 실패했습니다. (${res.status})`)
      console.error(text)
      return
    }

    const data = await res.json()

    if (!data.ok) {
      setMessage(data.message ?? "초기화에 실패했습니다.")
      return
    }

    setSnapshot(data.snapshot ?? initialSnapshot)
    setRevealedAnswer(null)
    setFinalResults([])
    setAnswerWord("")
    setScheduledStartAt(getDefaultStartDateTimeLocal())
    setDurationMinutes("30")
    setMessage("스토어와 저장 데이터가 초기화되었습니다.")
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-3xl font-bold">관리자 페이지</h1>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <InfoCard label="게임 상태" value={snapshot.gameStatus} />
            <InfoCard label="참가자 수" value={String(snapshot.totalPlayers)} />
            <InfoCard label="제출 완료 수" value={String(snapshot.submittedPlayers)} />
            <InfoCard label="현재 시작 시각" value={formatDateTime(snapshot.scheduledStartAt)} />
            <InfoCard label="현재 게임 길이" value={snapshot.durationMs ? `${Math.floor(snapshot.durationMs / 60000)}분` : "미정"} />
          </div>
          <div className="mt-4 text-sm text-slate-300">{message || "운영 설정을 진행해 주세요."}</div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">게임 설정</h2>
            <form className="mt-4 flex flex-col gap-3" onSubmit={handleSetGame}>
              <input
                type="datetime-local"
                step="1"
                value={scheduledStartAt}
                onChange={(e) => setScheduledStartAt(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none"
              />
              <input
                type="number"
                min="1"
                step="1"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="게임 길이(분)"
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none"
              />
              <button className="rounded-xl bg-blue-600 px-4 py-3 font-medium">
                시작 시각 및 게임 길이 저장
              </button>
            </form>

            <button
              type="button"
              onClick={handleEndEarly}
              className="mt-4 w-full rounded-xl bg-rose-600 px-4 py-3 font-medium"
            >
              조기 종료
            </button>

            <button
              type="button"
              onClick={handleResetStore}
              className="mt-4 w-full rounded-xl bg-amber-600 px-4 py-3 font-medium"
            >
              스토어 및 저장 데이터 초기화
            </button>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">게임 종료 후 정답 등록</h2>
            <form className="mt-4 flex flex-col gap-3" onSubmit={handleRevealAnswer}>
              <input
                value={answerWord}
                onChange={(e) => setAnswerWord(e.target.value)}
                placeholder="정답 단어 입력"
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none"
              />
              <button className="rounded-xl bg-emerald-600 px-4 py-3 font-medium">
                정답 등록 및 최종 결과 계산
              </button>
            </form>
            <div className="mt-4 text-sm text-slate-300">
              현재 정답 공개 상태: {revealedAnswer ? `"${revealedAnswer}"` : "미공개"}
            </div>
          </section>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-xl font-semibold">실시간 제출 현황</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-300">
                  <th className="px-3 py-3 text-left">표시 순서</th>
                  <th className="px-3 py-3 text-left">닉네임</th>
                  <th className="px-3 py-3 text-left">상태</th>
                  <th className="px-3 py-3 text-left">제출 단어</th>
                  <th className="px-3 py-3 text-left">제출 순서</th>
                  <th className="px-3 py-3 text-left">최고 유사도</th>
                  <th className="px-3 py-3 text-left">시도 횟수</th>
                  <th className="px-3 py-3 text-left">제출 시각</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.leaderboard.map((entry) => (
                  <tr key={entry.userName} className="border-b border-slate-900">
                    <td className="px-3 py-3">{entry.rank}</td>
                    <td className="px-3 py-3">{entry.userName}</td>
                    <td className="px-3 py-3">{entry.status}</td>
                    <td className="px-3 py-3">{entry.submittedWord ?? "-"}</td>
                    <td className="px-3 py-3">{entry.submitOrder ?? "-"}</td>
                    <td className="px-3 py-3">{entry.bestSimilarity ?? "-"}</td>
                    <td className="px-3 py-3">{entry.tryCount ?? "-"}</td>
                    <td className="px-3 py-3">
                      {entry.submittedAt ? formatDateTime(entry.submittedAt) : "-"}
                    </td>
                  </tr>
                ))}
                {snapshot.leaderboard.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                      아직 참가자가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">최종 결과</h2>
            <div className="text-sm text-slate-300">
              정답 {revealedAnswer ? `"${revealedAnswer}"` : "미공개"}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-300">
                  <th className="px-3 py-3 text-left">순위</th>
                  <th className="px-3 py-3 text-left">닉네임</th>
                  <th className="px-3 py-3 text-left">결과</th>
                  <th className="px-3 py-3 text-left">제출 단어</th>
                  <th className="px-3 py-3 text-left">제출 시각</th>
                  <th className="px-3 py-3 text-left">경과 시간</th>
                  <th className="px-3 py-3 text-left">최고 유사도</th>
                  <th className="px-3 py-3 text-left">시도 횟수</th>
                  <th className="px-3 py-3 text-left">점수</th>
                </tr>
              </thead>
              <tbody>
                {finalResults.map((entry) => (
                  <tr key={`${entry.userName}-${entry.resultType}`} className="border-b border-slate-900">
                    <td className="px-3 py-3">{entry.rank}</td>
                    <td className="px-3 py-3">{entry.userName}</td>
                    <td className="px-3 py-3">{entry.resultType}</td>
                    <td className="px-3 py-3">{entry.submittedWord ?? "-"}</td>
                    <td className="px-3 py-3">
                      {entry.submittedAt ? formatDateTime(entry.submittedAt) : "-"}
                    </td>
                    <td className="px-3 py-3">
                      {entry.elapsedMs !== null ? formatDuration(entry.elapsedMs) : "-"}
                    </td>
                    <td className="px-3 py-3">{entry.bestSimilarity ?? "-"}</td>
                    <td className="px-3 py-3">{entry.tryCount ?? "-"}</td>
                    <td className="px-3 py-3">{entry.score}</td>
                  </tr>
                ))}
                {finalResults.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                      아직 최종 결과가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-2 text-base font-semibold">{value}</div>
    </div>
  )
}

function formatDateTime(value: number | null) {
  if (value === null) {
    return "미정"
  }

  return new Date(value).toLocaleString("ko-KR", {
    hour12: false,
  })
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function getDefaultStartDateTimeLocal() {
  const date = new Date(Date.now() + 5 * 60 * 1000)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}