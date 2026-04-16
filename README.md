# 꼬맨틀 랭킹 보드

오프라인 또는 현장형 단어 맞히기 게임(꼬맨틀 등)을 위한 실시간 순위 관리 웹 애플리케이션입니다.  
참가자는 회원가입·로그인 후 게임에 대기 등록하고, 게임이 시작되면 단어를 제출할 수 있습니다.

## 시작하기

```bash
npm install
npm run dev
```

### 환경 변수 (.env.local)

```env
# 관리자 페이지 비밀번호 (설정하지 않으면 인증 없이 접근 가능)
ADMIN_PASSWORD=비밀번호
```

### 접속 주소

| 페이지 | URL |
|--------|-----|
| 참가자 | `http://서버IP:3000` |
| 관리자 | `http://서버IP:3000/admin` |

서버 주소 확인법 : ipconfig -> IPV4 주소 입력 

## 주요 기능

### 참가자
- 닉네임 + 비밀번호 회원가입 / 로그인
- 게임 대기 등록 및 취소
- 단어·최고 유사도·시도 횟수 제출 및 취소
- 실시간 제출 현황 확인
- 게임 종료 후 최종 결과 및 CSV 다운로드

### 관리자
- 게임 시작 시각 및 진행 시간 설정
- 조기 종료
- 정답 등록 및 최종 결과 계산
- 게임 중 제출 단어 숨김/표시 토글
- CSV 다운로드
- 스토어 및 데이터 초기화
- 게임 이력 자동 아카이브 (`data/games/{gameId}/`)

## 점수 계산

```
score = 3 × log(1 + t/180) + 0.025 × x
```

- `t`: 게임 시작 이후 제출까지 걸린 시간 (초)
- `x`: 시도 횟수

**값이 작을수록 유리**합니다.

최종 순위 우선순위: `CORRECT` → `WRONG` → `EARLY_ENDED` → `NO_SUBMISSION`

## 게임 상태

```
SCHEDULED → COUNTDOWN (시작 10초 전) → RUNNING → ENDED
```

## 데이터 저장

서버 인메모리 상태와 파일 저장을 함께 사용합니다.

| 파일 | 내용 |
|------|------|
| `data/games/current/snapshot.json` | 실시간 게임 상태 |
| `data/games/current/leaderboard.csv` | 실시간 리더보드 |
| `data/games/current/final-results.json` | 최종 결과 |
| `data/games/current/final-results.csv` | 최종 결과 CSV |
| `data/games/{gameId}/` | 초기화 시 자동 아카이브 |
| `data/users.json` | 회원 정보 (비밀번호 해시 저장) |

> 서버 재시작 시 `snapshot.json`에서 게임 상태를 자동 복구합니다.  
> 세션(로그인 상태)은 인메모리 저장이므로 서버 재시작 시 재로그인이 필요합니다.

## API

### 인증
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/auth/me` | 현재 세션 유저 조회 |

### 게임 (참가자)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/game/state` | 게임 상태 조회 |
| GET | `/api/game/final-results` | 최종 결과 조회 |
| POST | `/api/game/wait` | 대기 등록 |
| DELETE | `/api/game/wait` | 대기 취소 |
| POST | `/api/game/submit` | 단어 제출 |
| POST | `/api/game/cancel-submit` | 제출 취소 |

### 게임 (관리자)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/game/control` | 시작 시각·게임 길이 설정 |
| POST | `/api/game/end` | 조기 종료 |
| POST | `/api/game/reveal-answer` | 정답 등록 |
| POST | `/api/game/reset` | 전체 초기화 |
| POST | `/api/admin/auth` | 관리자 로그인 |
| POST | `/api/admin/logout` | 관리자 로그아웃 |

### 실시간
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/events` | SSE 스트림 (게임 상태 실시간 반영) |

## 사용 흐름

1. 관리자가 `/admin`에서 시작 시각과 게임 길이를 설정합니다.
2. 참가자가 `/`에서 회원가입 또는 로그인합니다.
3. 참가자가 대기 등록을 합니다.
4. 게임 시작 후 참가자가 단어·유사도·시도 횟수를 제출합니다.
5. 관리자가 필요 시 조기 종료할 수 있습니다.
6. 게임 종료 후 관리자가 정답을 등록합니다.
7. 최종 결과가 계산되고 순위가 확정됩니다.
8. 다음 게임을 위해 초기화합니다 (현재 게임은 자동 아카이브).

## 기술 스택

- **Next.js 16** (App Router, Turbopack)
- **React 19**
- **TypeScript**
- **Tailwind CSS 4**
- SSE (Server-Sent Events) 기반 실시간 통신
