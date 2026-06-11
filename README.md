# 잉크 배틀 · Ink Battle

스플래툰에서 영감을 받은 **3D 실시간 멀티플레이 영역 점령 웹게임**입니다.
플레이어들이 같은 맵에 접속해 제한 시간 동안 자기 팀 잉크로 바닥을 더 많이 칠한 팀이 승리합니다.

- **렌더링**: Three.js
- **실시간 통신**: Socket.IO (WebSocket)
- **서버**: Node.js + Socket.IO **권위적 서버(authoritative server)** — 격자(grid) 기반 잉크/점령률/순위를 서버가 관리
- **클라이언트**: Vite

> 학습 / 포트폴리오용 토이 프로젝트입니다. 자세한 설계는 기획서를 참고하세요.

## 핵심 규칙

- **이동**: `WASD` / 방향키 · **시점**: 마우스 · **발사**: 좌클릭 · **점프**: 스페이스
- 내 팀 잉크 위에서는 **빠르게**, 상대 팀 잉크 위에서는 **느리게** 이동합니다.
- 제한 시간(기본 180초) 종료 시 팀별 점령률로 승패를, 개인 점수(칠한 셀 · 처치 · 사망)로 순위를 매깁니다.
- 매치가 끝나면 결과를 보여준 뒤 자동으로 다음 매치가 시작됩니다.

## 구조 (모노레포)

```
inkbattle/
├─ client/      # Three.js + Vite 프론트엔드  → Vercel 배포
│  └─ src/
├─ server/      # Node.js + Socket.IO 권위적 서버 → Render 배포
├─ render.yaml  # 서버용 Render 블루프린트
└─ README.md
```

서버리스 플랫폼(Vercel)은 상시 WebSocket 서버를 띄울 수 없어, **프론트는 Vercel, 서버는 Render**로 나눠 배포합니다.

## 로컬 실행

두 개의 터미널이 필요합니다.

```bash
# 1) 서버
cd server
npm install
npm start          # http://localhost:3001

# 2) 클라이언트
cd client
npm install
npm run dev        # http://localhost:5173
```

브라우저 탭을 여러 개 열어 같은 맵에서 함께 플레이할 수 있습니다.
(클라이언트는 기본적으로 `http://<host>:3001` 서버에 접속합니다.)

## 배포

### 1) 서버 → Render
1. 이 저장소를 GitHub에 푸시합니다.
2. Render 대시보드 → **New → Blueprint** → 저장소 연결 (`render.yaml` 자동 인식).
3. 배포 완료 후 서버 URL을 복사합니다. 예: `https://inkbattle-server.onrender.com`

### 2) 클라이언트 → Vercel
1. Vercel → **New Project** → 이 저장소 import.
2. **Root Directory**를 `client` 로 지정 (Framework: Vite 자동 감지).
3. 환경변수 `VITE_SERVER_URL` 에 1)의 서버 URL을 입력합니다.
4. Deploy.

> Render 무료 플랜은 일정 시간 미사용 시 슬립 상태가 되어 첫 접속이 느릴 수 있습니다.

## 개발 로드맵 (기획서 기준)

- [x] Phase 0 — Vite + Three.js, Node + Socket.IO 골격, 빈 3D 씬
- [x] Phase 1 — 싱글 캐릭터 컨트롤(WASD, 마우스 시점, 3인칭 카메라)
- [x] Phase 2 — 격자 잉크 시스템, 잉크 위/밖 속도 변화, 점령률 표시
- [x] Phase 3 — 멀티플레이 연결, 권위적 서버, 상태 브로드캐스트
- [x] Phase 4 — 팀 배정, 제한 시간, 팀 점령률 집계, 개인 점수·리더보드
- [ ] Phase 5 — 클라이언트 예측·보간 고도화, 잉크 텍스처 업그레이드, 사운드/이펙트
