# 잉크 배틀 · Ink Battle

스플래툰에서 영감을 받은 **3D 실시간 멀티플레이 영역 점령 웹게임**입니다.
**무한 개인전(FFA)** — 플레이어마다 고유 색을 가지고, 같은 맵에서 자기 잉크로 바닥을 더 넓게 칠해 순위를 겨룹니다.

- **렌더링**: Three.js
- **실시간 통신**: Supabase Realtime (WebSocket broadcast/presence)
- **권위 구조**: **호스트 권위(host-authoritative)** — 방에 가장 먼저 들어온 플레이어의 브라우저가 격자(grid) 기반 잉크·점령률·순위·판정을 돌리고 그 상태를 다른 플레이어에게 브로드캐스트. 호스트가 나가면 다음 플레이어가 자동 인계(잉크는 유지).
- **클라이언트**: Vite (정적 빌드 → 어디든 호스팅 가능, 별도 상시 서버 불필요)

> 학습 / 포트폴리오용 토이 프로젝트입니다. 자세한 설계는 기획서를 참고하세요.
>
> 📦 `server/` 폴더에는 **원래 설계인 Node.js + Socket.IO 권위적 *서버* 버전**이 그대로 들어 있습니다(로컬 실행/학습용). 배포 버전은 서버리스로 돌리기 위해 동일한 게임 로직(`game-core.js`)을 호스트 클라이언트에서 실행합니다.

## 핵심 규칙

- **이동**: `WASD` / 방향키 · **시점**: 마우스 · **발사**: 좌클릭 · **점프**: 스페이스 · **오징어 변신**: `Shift`
- **무한전(개인전)** — 제한 시간 없이 계속 진행되며, 리더보드는 각자 칠한 영역으로 실시간 순위를 매깁니다.
- **내 잉크 위**에서는 더 **빠르게** 이동하고 **체력(HP)이 회복**됩니다. (다른 색 잉크 위에서도 속도 저하 없음)
- 상대의 잉크를 맞으면 HP가 닳고, **HP가 0이 되면 사망 → 내가 칠한 영역이 전부 사라집니다.**
- **오징어 변신(Shift)**: 더 작고 빠르게 이동(발사는 불가). 좁은 길을 빠르게 이동할 때 유용합니다.

## 구조

```
inkbattle/
├─ client/                # Three.js + Vite 프론트엔드 (정적 호스팅 → 배포 대상)
│  └─ src/
│     ├─ game-core.js     # 권위적 게임 로직(호스트 클라이언트가 실행)
│     ├─ net.js           # Supabase Realtime 네트워킹 + 호스트 선출/인계
│     └─ ...
├─ server/                # (선택) 원래 설계: Node + Socket.IO 권위적 *서버* — 로컬/학습용
└─ README.md
```

## 로컬 실행

Supabase 무료 프로젝트의 **Project URL**과 **anon public 키**가 필요합니다
(Supabase 대시보드 → Project Settings → API). Realtime broadcast/presence는 DB 테이블이 필요 없습니다.

```bash
cd client
npm install
cp .env.example .env     # .env 안에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 입력
npm run dev              # http://localhost:5173
```

브라우저 탭을 여러 개 열면 같은 방에서 함께 플레이됩니다. 가장 먼저 입장한 탭이 호스트가 됩니다.

> 원래의 Socket.IO **서버** 버전으로 돌려보고 싶다면 `cd server && npm install && npm start` (http://localhost:3001).
> 단, 그 버전을 쓰려면 클라이언트의 네트워킹을 Socket.IO로 되돌려야 합니다(git 히스토리 참고).

## 배포 (정적 호스팅)

클라이언트는 정적 빌드물이라 Supabase 키만 빌드 시 주입하면 어디든 올릴 수 있습니다.

**환경변수 (빌드 시점):**
- `VITE_SUPABASE_URL` = Supabase Project URL
- `VITE_SUPABASE_ANON_KEY` = anon public 키

### GitHub Pages
`client/vite.config.js`의 `base`가 `/inkbattle/`로 설정되어 있습니다. 빌드 후 `client/dist`를
`gh-pages` 브랜치에 올리고 저장소 Settings → Pages에서 해당 브랜치를 지정하면 됩니다.

### Vercel (선택)
**New Project** → 이 저장소 import → **Root Directory = `client`** → 위 환경변수 2개 추가 → Deploy.
(이 경우 `vite.config.js`의 `base`를 `/` 로 바꿔야 합니다.)

## 개발 로드맵 (기획서 기준)

- [x] Phase 0 — Vite + Three.js, Node + Socket.IO 골격, 빈 3D 씬
- [x] Phase 1 — 싱글 캐릭터 컨트롤(WASD, 마우스 시점, 3인칭 카메라)
- [x] Phase 2 — 격자 잉크 시스템, 잉크 위/밖 속도 변화, 점령률 표시
- [x] Phase 3 — 멀티플레이 연결, 권위적 서버, 상태 브로드캐스트
- [x] Phase 4 — 팀 배정, 제한 시간, 팀 점령률 집계, 개인 점수·리더보드
- [ ] Phase 5 — 클라이언트 예측·보간 고도화, 잉크 텍스처 업그레이드, 사운드/이펙트
