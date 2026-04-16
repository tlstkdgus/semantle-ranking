import { mkdir, readFile, writeFile } from "node:fs/promises"
import { pbkdf2Sync, randomBytes } from "node:crypto"
import path from "node:path"

interface User {
  username: string
  passwordHash: string
  salt: string
  createdAt: number
}

const USERS_FILE = path.join(process.cwd(), "data", "users.json")

class UserStore {
  private users = new Map<string, User>()
  private sessions = new Map<string, string>() // token → username
  private loaded = false

  private async ensureLoaded() {
    if (this.loaded) return
    this.loaded = true
    try {
      const content = await readFile(USERS_FILE, "utf-8")
      const list: User[] = JSON.parse(content)
      for (const user of list) {
        this.users.set(user.username, user)
      }
    } catch {
      // 파일 없으면 빈 상태로 시작
    }
  }

  private async save() {
    await mkdir(path.dirname(USERS_FILE), { recursive: true })
    await writeFile(USERS_FILE, JSON.stringify([...this.users.values()], null, 2), "utf-8")
  }

  async register(username: string, password: string): Promise<string> {
    await this.ensureLoaded()

    const key = username.trim()
    if (!key) throw new Error("닉네임을 입력해 주세요.")
    if (key.length > 20) throw new Error("닉네임은 20자 이하여야 합니다.")
    if (!password || password.length < 4) throw new Error("비밀번호는 4자 이상이어야 합니다.")
    if (this.users.has(key)) throw new Error("이미 사용 중인 닉네임입니다.")

    const salt = randomBytes(16).toString("hex")
    const passwordHash = pbkdf2Sync(password, salt, 100_000, 32, "sha256").toString("hex")
    const user: User = { username: key, passwordHash, salt, createdAt: Date.now() }
    this.users.set(key, user)
    await this.save()

    return this.createSession(key)
  }

  async login(username: string, password: string): Promise<string> {
    await this.ensureLoaded()

    const user = this.users.get(username.trim())
    if (!user) throw new Error("닉네임 또는 비밀번호가 틀렸습니다.")

    const hash = pbkdf2Sync(password, user.salt, 100_000, 32, "sha256").toString("hex")
    if (hash !== user.passwordHash) throw new Error("닉네임 또는 비밀번호가 틀렸습니다.")

    return this.createSession(user.username)
  }

  private createSession(username: string): string {
    const token = randomBytes(32).toString("hex")
    this.sessions.set(token, username)
    return token
  }

  logout(token: string) {
    this.sessions.delete(token)
  }

  getUsername(token: string): string | null {
    return this.sessions.get(token) ?? null
  }
}

declare global {
  var __userStore__: UserStore | undefined
}

export const userStore = globalThis.__userStore__ ?? new UserStore()
if (!globalThis.__userStore__) {
  globalThis.__userStore__ = userStore
}

// Request에서 세션 토큰을 꺼내 username 반환
export function getSessionUser(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? ""
  const match = cookieHeader.match(/(?:^|;\s*)user_token=([^;]+)/)
  const token = match?.[1]
  if (!token) return null
  return userStore.getUsername(token)
}

export function makeUserCookie(token: string) {
  return `user_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`
}

export function clearUserCookie() {
  return "user_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"
}
