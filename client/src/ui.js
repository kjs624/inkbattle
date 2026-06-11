import { TEAM_LABEL, PURPLE, ORANGE } from './constants.js';

const TEAM_HEX = { [PURPLE]: '#a78bfa', [ORANGE]: '#fdba74' };

// Builds and controls every DOM overlay: lobby, in-game HUD, result screen.
export class UI {
  constructor(root) {
    this.root = root;
    this.onStartCb = null;
    this.build();
  }

  build() {
    this.root.innerHTML = `
      <div id="lobby" class="overlay">
        <div class="card">
          <div class="logo">잉크 배틀</div>
          <div class="tagline">3D 실시간 영역 점령 · Ink Battle</div>
          <input id="nameInput" type="text" maxlength="14" placeholder="닉네임을 입력하세요" />
          <button id="startBtn" class="primary">전투 입장</button>
          <div id="lobbyStatus" class="status">서버 연결 중…</div>
          <div class="controls-hint">
            <b>WASD</b> 이동 · <b>마우스</b> 시점 · <b>좌클릭</b> 잉크 발사 · <b>스페이스</b> 점프<br/>
            내 팀 잉크 위는 빠르게, 상대 잉크 위는 느리게 이동합니다.
          </div>
        </div>
      </div>

      <div id="hud" class="hidden">
        <div class="crosshair"></div>
        <div class="top-center">
          <div class="phase-tag" id="phaseTag">영역 점령</div>
          <div class="timer" id="timer">3:00</div>
          <div class="terr-bar">
            <div class="terr-fill purple" id="terrPurple" style="width:0%"></div>
            <div class="terr-fill neutral"></div>
            <div class="terr-fill orange" id="terrOrange" style="width:0%"></div>
          </div>
          <div class="terr-labels">
            <span class="p" id="terrPLabel">보라 0%</span>
            <span class="o" id="terrOLabel">0% 주황</span>
          </div>
        </div>
        <div class="leaderboard">
          <h4>리더보드</h4>
          <div id="lbRows"></div>
        </div>
        <div class="you-stats">
          <div class="stat"><b id="sCells">0</b><span>칠한 셀</span></div>
          <div class="stat"><b id="sKills">0</b><span>처치</span></div>
          <div class="stat"><b id="sDeaths">0</b><span>사망</span></div>
          <div class="stat"><b id="sScore">0</b><span>점수</span></div>
        </div>
        <div class="center-banner hidden" id="banner"></div>
        <div class="conn"><span class="led" id="led"></span><span id="connText">연결 중</span></div>
      </div>

      <div id="result" class="overlay hidden">
        <div class="card">
          <div class="phase-tag">매치 종료</div>
          <div class="result-team" id="resWinner">—</div>
          <div class="result-pct" id="resPct"></div>
          <table class="result-table">
            <thead><tr><th>플레이어</th><th>셀</th><th>처치</th><th>점수</th></tr></thead>
            <tbody id="resRows"></tbody>
          </table>
          <div class="result-next" id="resNext">다음 매치 준비 중…</div>
        </div>
      </div>
    `;

    this.lobby = this.root.querySelector('#lobby');
    this.hud = this.root.querySelector('#hud');
    this.result = this.root.querySelector('#result');
    this.nameInput = this.root.querySelector('#nameInput');
    this.startBtn = this.root.querySelector('#startBtn');
    this.lobbyStatus = this.root.querySelector('#lobbyStatus');

    const start = () => {
      const name = this.nameInput.value.trim() || `잉크${Math.floor(Math.random() * 900 + 100)}`;
      if (this.onStartCb) this.onStartCb(name);
    };
    this.startBtn.addEventListener('click', start);
    this.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
  }

  onStart(cb) { this.onStartCb = cb; }

  setLobbyStatus(text, isErr = false) {
    this.lobbyStatus.textContent = text;
    this.lobbyStatus.className = 'status' + (isErr ? ' err' : '');
  }

  setStartEnabled(on) { this.startBtn.disabled = !on; }

  enterGame() {
    this.lobby.classList.add('hidden');
    this.hud.classList.remove('hidden');
  }

  setConn(on) {
    const led = this.root.querySelector('#led');
    led.classList.toggle('on', on);
    this.root.querySelector('#connText').textContent = on ? '연결됨' : '연결 끊김';
  }

  setTimer(timeLeft, phase) {
    const m = Math.floor(timeLeft / 60);
    const s = Math.floor(timeLeft % 60);
    this.root.querySelector('#timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
    this.root.querySelector('#phaseTag').textContent = phase === 'result' ? '집계 중' : '영역 점령';
  }

  setTerritory(t) {
    const p = t.purplePct || 0;
    const o = t.orangePct || 0;
    this.root.querySelector('#terrPurple').style.width = p + '%';
    this.root.querySelector('#terrOrange').style.width = o + '%';
    this.root.querySelector('#terrPLabel').textContent = `보라 ${p.toFixed(1)}%`;
    this.root.querySelector('#terrOLabel').textContent = `${o.toFixed(1)}% 주황`;
  }

  setLeaderboard(list, selfId) {
    const rows = list.slice(0, 8).map((p) => {
      const hex = TEAM_HEX[p.team];
      const you = p.id === selfId ? ' you' : '';
      return `<div class="lb-row${you}">
        <span class="dot" style="background:${hex}"></span>
        <span class="nm">${escapeHtml(p.name)}</span>
        <span class="sc">${p.score}</span>
      </div>`;
    }).join('');
    this.root.querySelector('#lbRows').innerHTML = rows || '<div class="lb-row"><span class="nm" style="color:#9aa3c7">대기 중…</span></div>';
  }

  setSelfStats(s) {
    this.root.querySelector('#sCells').textContent = s.cells;
    this.root.querySelector('#sKills').textContent = s.kills;
    this.root.querySelector('#sDeaths').textContent = s.deaths;
    this.root.querySelector('#sScore').textContent = s.score;
  }

  showBanner(html) {
    const b = this.root.querySelector('#banner');
    b.innerHTML = html;
    b.classList.remove('hidden');
  }
  hideBanner() { this.root.querySelector('#banner').classList.add('hidden'); }

  showResult(match, selfId) {
    const t = match.territory;
    const winnerTeam = t.purple === t.orange ? null : (t.purple > t.orange ? PURPLE : ORANGE);
    const winEl = this.root.querySelector('#resWinner');
    if (winnerTeam === null) {
      winEl.textContent = '무승부!';
      winEl.style.color = '#fff';
    } else {
      winEl.textContent = `${TEAM_LABEL[winnerTeam]} 승리!`;
      winEl.style.color = TEAM_HEX[winnerTeam];
    }
    this.root.querySelector('#resPct').textContent =
      `보라 ${t.purplePct.toFixed(1)}%  ·  주황 ${t.orangePct.toFixed(1)}%`;

    const rows = match.leaderboard.slice(0, 10).map((p, i) => {
      const hex = TEAM_HEX[p.team];
      const you = p.id === selfId ? ' style="font-weight:700;color:#fff"' : '';
      return `<tr${you}>
        <td><span class="dot" style="background:${hex}"></span>${i + 1}. ${escapeHtml(p.name)}</td>
        <td>${p.cells}</td><td>${p.kills}</td><td>${p.score}</td>
      </tr>`;
    }).join('');
    this.root.querySelector('#resRows').innerHTML = rows;

    this.result.classList.remove('hidden');
  }
  hideResult() { this.result.classList.add('hidden'); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
