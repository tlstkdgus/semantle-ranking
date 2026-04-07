"use client"

import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import type { FinalResultEntry, GameSnapshot } from "@/lib/shared/types"

type SubmitResponse = {
  ok: boolean
  message?: string
  snapshot?: GameSnapshot
}

type WaitResponse = {
  ok: boolean
  message?: string
  snapshot?: GameSnapshot
  player?: {
    userName: string
    status: string
    waitingAt: number | null
  }
}

type CancelSubmitResponse = {
  ok: boolean
  message?: string
  snapshot?: GameSnapshot
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

export default function HomePage() {
  const [snapshot, setSnapshot] = useState<GameSnapshot>(initialSnapshot)
  const [nickname, setNickname] = useState("")
  const [lockedNickname, setLockedNickname] = useState("")
  const [isWaiting, setIsWaiting] = useState(false)
  const [word, setWord] = useState("")
  const [bestSimilarity, setBestSimilarity] = useState("")
  const [tryCount, setTryCount] = useState("")
  const [message, setMessage] = useState("")
  const [finalResults, setFinalResults] = useState<FinalResultEntry[]>([])
  const [revealedAnswer, setRevealedAnswer] = useState<string | null>(null)
  const [clockNow, setClockNow] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    fetchState()
    fetchFinalResults()

    const eventSource = new EventSource(`${process.env.NEXT_PUBLIC_API_URL}/api/events`)

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
      setMessage("정답이 등록되어 최종 결과가 확정되었습니다.")
    }

    eventSource.addEventListener("snapshot", handleSnapshot)
    eventSource.addEventListener("leaderboard_updated", handleSnapshot)
    eventSource.addEventListener("game_state_changed", handleSnapshot)
    eventSource.addEventListener("answer_revealed", handleAnswerRevealed)

    eventSource.onerror = () => {
      setMessage("실시간 연결이 일시적으로 불안정합니다. 자동으로 재연결을 시도합니다.")
    }

    return () => {
      eventSource.removeEventListener("snapshot", handleSnapshot)
      eventSource.removeEventListener("leaderboard_updated", handleSnapshot)
      eventSource.removeEventListener("game_state_changed", handleSnapshot)
      eventSource.removeEventListener("answer_revealed", handleAnswerRevealed)
      eventSource.close()
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  async function fetchState() {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/game/state`, { cache: "no-store" })
    const data = await res.json()
    if (data?.snapshot) {
      setSnapshot(data.snapshot)
    }
  }

  async function fetchFinalResults() {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/game/final-results`, { cache: "no-store" })
    const data = (await res.json()) as FinalResultsResponse
    if (data.ok) {
      setRevealedAnswer(data.answerWord)
      setFinalResults(data.finalResults ?? [])
    }
  }

  async function handleWait(e: FormEvent) {
    e.preventDefault()

    const trimmed = nickname.trim()
    if (!trimmed) {
      setMessage("닉네임을 입력해 주세요.")
      return
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/game/wait`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userName: trimmed }),
    })

    const data = (await res.json()) as WaitResponse
    console.log(data);

    if (!data.ok) {
      setMessage(data.message ?? "대기 등록에 실패했습니다.")
      return
    }

    setLockedNickname(trimmed)
    setIsWaiting(true)
    setMessage("대기 등록이 완료되었습니다.")
    if (data.snapshot) {
      setSnapshot(data.snapshot)
    }
  }

  async function handleWaitCancel() {
    if (!lockedNickname) {
      setMessage("대기 등록이 필요합니다.")
      return
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/game/wait`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userName: lockedNickname }),
    })

    const data = (await res.json()) as WaitResponse
    console.log(data)

    if (!data.ok) {
      setMessage(data.message ?? "대기 취소에 실패했습니다.")
      return
    }

    setLockedNickname("")
    setIsWaiting(false)
    setMessage("대기가 취소되었습니다.")
    if (data.snapshot) {
      setSnapshot(data.snapshot)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (!lockedNickname) {
      setMessage("먼저 닉네임으로 대기 등록을 해주세요.")
      return
    }

    if (!word.trim()) {
      setMessage("제출할 단어를 입력해 주세요.")
      return
    }

    if (bestSimilarity === "" || tryCount === "") {
      setMessage("최고 유사도와 시도 횟수를 모두 입력해 주세요.")
      return
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/game/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userName: lockedNickname,
        word: word.trim(),
        bestSimilarity: bestSimilarity === "" ? null : Number(bestSimilarity),
        tryCount: tryCount === "" ? null : Number(tryCount),
      }),
    })

    const data = (await res.json()) as SubmitResponse

    if (!data.ok) {
      setMessage(data.message ?? "제출에 실패했습니다.")
      return
    }

    setMessage("제출이 기록되었습니다.")
    setWord("")
    if (data.snapshot) {
      setSnapshot(data.snapshot)
    }
  }

  async function handleCancelSubmit() {
    if (!lockedNickname) {
      setMessage("닉네임 대기 등록이 필요합니다.")
      return
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/game/cancle-submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userName: lockedNickname,
      }),
    })

    const data = (await res.json()) as CancelSubmitResponse

    if (!data.ok) {
      setMessage(data.message ?? "제출 취소에 실패했습니다.")
      return
    }

    setMessage("제출이 취소되었습니다.")
    if (data.snapshot) {
      setSnapshot(data.snapshot)
    }
  }

  const myEntry = useMemo(() => {
    if (!lockedNickname) return null
    return snapshot.leaderboard.find((entry) => entry.userName === lockedNickname) ?? null
  }, [lockedNickname, snapshot.leaderboard])

  const timeLabel = useMemo(() => {
    if (snapshot.gameStatus === "RUNNING") {
      if (snapshot.endAt === null) return "대기중"
      const remain = Math.max(0, snapshot.endAt - clockNow)
      return `남은 시간 ${formatDuration(remain)}`
    }

    if (snapshot.gameStatus === "ENDED") {
      return "게임 종료"
    }

    if (snapshot.scheduledStartAt === null) {
      return "대기중"
    }

    const untilStart = Math.max(0, snapshot.scheduledStartAt - clockNow)
    if (snapshot.gameStatus === "COUNTDOWN") {
      return `카운트다운 ${formatDuration(untilStart)}`
    }

    return `시작까지 ${formatDuration(untilStart)}`
  }, [snapshot, clockNow])

  const countdownSecondsLeft = useMemo(() => {
    if (snapshot.gameStatus === "COUNTDOWN" && snapshot.scheduledStartAt !== null) {
      return Math.max(0, Math.ceil((snapshot.scheduledStartAt - clockNow) / 1000))
    }
    if (snapshot.gameStatus === "RUNNING" && snapshot.endAt !== null) {
      return Math.max(0, Math.ceil((snapshot.endAt - clockNow) / 1000))
    }
    return null
  }, [snapshot, clockNow])

  const canSubmit = isWaiting && snapshot.gameStatus === "RUNNING" && !myEntry?.submittedWord
  const hasSubmitted = !!myEntry?.submittedWord

  async function downloadResultsCSV() {
    // CSV 헤더 정의
    const headers = ["순위", "닉네임", "결과", "제출 단어", "제출 시각", "경과 시간", "최고 유사도", "시도 횟수", "점수"]

    // CSV 행 생성
    const rows = finalResults.map((entry) => [
      entry.rank,
      entry.userName,
      entry.resultType,
      entry.submittedWord ?? "",
      entry.submittedAt ? formatDateTime(entry.submittedAt) : "",
      entry.elapsedMs !== null ? formatDuration(entry.elapsedMs) : "",
      entry.bestSimilarity ?? "",
      entry.tryCount ?? "",
      entry.score,
    ])

    // CSV 컨텐트 생성 (따옴표와 쉼표 이스케이핑)
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n")

    // UTF-8 BOM을 추가 (한글 깨짐 방지)
    const bom = new Uint8Array([0xef, 0xbb, 0xbf])
    const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8;" })

    // 다운로드
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `semantle-결과-${new Date().toISOString().split("T")[0]}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-3xl font-bold">단어 기록 보드</h1>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <InfoCard label="게임 상태" value={snapshot.gameStatus} />
            <InfoCard label="시작 시각" value={formatDateTime(snapshot.scheduledStartAt)} />
            <InfoCard label="종료 시각" value={formatDateTime(snapshot.endAt)} />
            <InfoCard label="게임 길이" value={snapshot.durationMs ? `${Math.floor(snapshot.durationMs / 60000)}분` : "-"} />
            <InfoCard label="현재 타이머" value={timeLabel} countdownSecondsLeft={snapshot.gameStatus === "COUNTDOWN" ? countdownSecondsLeft : null} />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">참가</h2>
              <form ref={formRef} className="mt-4 flex flex-col gap-3" onSubmit={handleWait}>
                <input
                  value={isWaiting ? lockedNickname : nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  disabled={isWaiting}
                  placeholder="닉네임 입력"
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none"
                />
                <button
                  type="button"
                  className={`rounded-xl px-4 py-3 font-medium ${isWaiting ? "bg-gray-600 hover:bg-gray-700" : "bg-blue-600 hover:bg-blue-700"}`}
                  onClick={() => {
                    if (isWaiting) {
                      handleWaitCancel()
                    } else {
                      console.log("clicked")
                      formRef.current?.requestSubmit()
                    }
                  }}
                >
                  {isWaiting ? "대기 취소" : "대기"}
                </button>
              </form>
              <div className="mt-4 text-sm text-slate-300">
                {message || "대기 후 게임이 시작되면 제출할 수 있습니다."}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">단어 제출</h2>
              <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit}>
                <input
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  disabled={!canSubmit}
                  placeholder={canSubmit ? "단어 입력" : "제출 가능 상태가 아닙니다"}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bestSimilarity}
                  onChange={(e) => setBestSimilarity(e.target.value)}
                  disabled={!canSubmit}
                  placeholder="최고 유사도 입력"
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none"
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={tryCount}
                  onChange={(e) => setTryCount(e.target.value)}
                  disabled={!canSubmit}
                  placeholder="시도 횟수 입력"
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none"
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="rounded-xl bg-emerald-600 px-4 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    제출
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelSubmit}
                    disabled={!hasSubmitted || snapshot.gameStatus !== "RUNNING"}
                    className="rounded-xl bg-amber-600 px-4 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    제출 취소
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">내 상태</h2>
              <div className="mt-4 grid gap-3">
                <InfoRow label="닉네임" value={lockedNickname || "-"} />
                <InfoRow label="상태" value={myEntry?.status ?? "-"} />
                <InfoRow label="제출 단어" value={myEntry?.submittedWord ?? "-"} />
                <InfoRow label="제출 순서" value={String(myEntry?.submitOrder ?? "-")} />
                <InfoRow label="최고 유사도" value={myEntry?.bestSimilarity !== null && myEntry?.bestSimilarity !== undefined ? String(myEntry.bestSimilarity) : "-"} />
                <InfoRow label="시도 횟수" value={myEntry?.tryCount !== null && myEntry?.tryCount !== undefined ? String(myEntry.tryCount) : "-"} />
                <InfoRow
                  label="제출 시각"
                  value={myEntry?.submittedAt ? formatDateTime(myEntry.submittedAt) : "-"}
                />
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">실시간 제출 현황</h2>
                <div className="text-sm text-slate-300">
                  참가자 {snapshot.totalPlayers}명 / 제출 완료 {snapshot.submittedPlayers}명
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-300">
                      <th className="px-3 py-3 text-left">표시 순서</th>
                      <th className="px-3 py-3 text-left">닉네임</th>
                      <th className="px-3 py-3 text-left">상태</th>
                      {snapshot.gameStatus === "ENDED" && <th className="px-3 py-3 text-left">제출 단어</th>}
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
                        {snapshot.gameStatus === "ENDED" && <td className="px-3 py-3">{entry.submittedWord ?? "-"}</td>}
                        <td className="px-3 py-3">{entry.submitOrder ?? "-"}</td>
                        <td className="px-3 py-3">{entry.bestSimilarity ?? "-"}</td>
                        <td className="px-3 py-3">{entry.tryCount ?? "-"}</td>
                        <td className="px-3 py-3">
                          {entry.submittedAt ? formatTimeOnly(entry.submittedAt) : "-"}
                        </td>
                      </tr>
                    ))}
                    {snapshot.leaderboard.length === 0 && (
                      <tr>
                        <td colSpan={snapshot.gameStatus === "ENDED" ? 8 : 7} className="px-3 py-8 text-center text-slate-400">
                          아직 대기자가 없습니다.
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
                <div className="flex items-center gap-4">
                  <div className="text-sm text-slate-300">
                    정답 {revealedAnswer ? `"${revealedAnswer}"` : "미공개"}
                  </div>
                  {revealedAnswer && finalResults.length > 0 && (
                    <button
                      onClick={downloadResultsCSV}
                      className="rounded-lg bg-indigo-600 px-3 py-1 text-sm font-medium hover:bg-indigo-700"
                    >
                      CSV 다운로드
                    </button>
                  )}
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
                          아직 최종 결과가 확정되지 않았습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

function InfoCard({ label, value, countdownSecondsLeft }: { label: string; value: string; countdownSecondsLeft?: number | null }) {
  const intensity = countdownSecondsLeft != null && countdownSecondsLeft <= 10 && countdownSecondsLeft >= 0
    ? Math.max(0, (10 - countdownSecondsLeft) / 10)
    : 0
  const bgColor = intensity > 0 ? `rgba(239, 68, 68, ${intensity * 0.5})` : undefined

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4" style={{ backgroundColor: bgColor }}>
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-2 text-base font-semibold">{value}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium">{value}</span>
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

function formatTimeOnly(value: number) {
  return new Date(value).toLocaleTimeString("ko-KR", {
    hour12: false,
  })
}