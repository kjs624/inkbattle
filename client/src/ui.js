import { slotColorCss } from './constants.js';

// Builds and controls every DOM overlay: lobby + in-game HUD.
// v2: free-for-all / infinite — shows your coverage %, rank, and HP.
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
          <div class="tagline">무한 개인전 · Free-For-All Ink Battle</div>
          <input id="nameInput" type="text" maxlength="14" placeholder="닉네임을 입력하세요" />
          <button id="startBtn" class="primary">전투 입장</button>
          <div id="lobbyStatus" class="status">서버 연결 중…</div>
          <div class="controls-hint">
            <b>WASD</b> 이동 · <b>마우스</b> 시점 · <b>좌클릭</b> 잉크 발사<br/>
            <b>Shift</b> 오징어 변신(빠름·발사 불가·<b>내 잉크 벽타기</b>) · <b>스페이스</b> 점프<br/>
            내 잉크 위에선 빠르게 이동하고 <b>체력이 회복</b>됩니다. 죽으면 내 영역은 사라집니다.<br/>
            가파른 언덕은 <b>잉크를 칠한 뒤 오징어로 변신</b>해 벽을 타고 오르세요.
          </div>
        </div>
      </div>

      <div id="hud" class="hidden">
        <div class="crosshair"></div>
        <div class="top-center">
          <div class="phase-tag">무한 개인전 · FFA</div>
          <div class="timer" id="coverage">0.0%</div>
          <div class="cov-sub" id="rankLine">내 영역 · 순위 집계 중</div>
          <div class="hpbar"><div class="hpfill" id="hpFill"></div><span class="hptext" id="hpText">HP 100</span></div>
        </div>
        <div class="leaderboard">
          <h4>리더보드 · 영역</h4>
          <div id="lbRows"></div>
        </div>
        <div class="you-stats">
          <div class="stat"><b id="sCells">0</b><span>내 영역</span></div>
          <div class="stat"><b id="sKills">0</b><span>처치</span></div>
          <div class="stat"><b id="sDeaths">0</b><span>사망</span></div>
        </div>
        <div class="center-banner hidden" id="banner"></div>
        <div class="conn"><span class="led" id="led"></span><span id="connText">연결 중</span></div>
      </div>

      <div id="gameover" class="overlay hidden">
        <div class="card">
          <div class="phase-tag">GAME OVER</div>
          <div class="result-team" id="goTitle">처치당했습니다!</div>
          <div class="result-pct">최종 기록</div>
          <div class="go-grid">
            <div class="go-stat"><b id="goCells">0</b><span>최종 영역</span></div>
            <div class="go-stat"><b id="goKills">0</b><span>처치</span></div>
            <div class="go-stat"><b id="goRank">-</b><span>순위</span></div>
          </div>
          <button id="restartBtn" class="primary">처음으로</button>
        </div>
      </div>
    `;

    this.lobby = this.root.querySelector('#lobby');
    this.hud = this.root.querySelector('#hud');
    this.nameInput = this.root.querySelector('#nameInput');
    this.startBtn = this.root.querySelector('#startBtn');
    this.lobbyStatus = this.root.querySelector('#lobbyStatus');

    const start = () => {
      const name = this.nameInput.value.trim() || `잉크${Math.floor(Math.random() * 900 + 100)}`;
      if (this.onStartCb) this.onStartCb(name);
    };
    this.startBtn.addEventListener('click', start);
    this.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });

    // Game Over -> back to the first page (fresh load).
    this.root.querySelector('#restartBtn').addEventListener('click', () => location.reload());
  }

  showGameOver(s) {
    this.root.querySelector('#goCells').textContent = s.cells;
    this.root.querySelector('#goKills').textContent = s.kills;
    this.root.querySelector('#goRank').textContent = s.total ? `${s.rank} / ${s.total}` : '-';
    this.root.querySelector('#gameover').classList.remove('hidden');
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

  // coveragePct: your share of the floor; rank/total: your standing.
  setTopStatus(coveragePct, rank, total) {
    this.root.querySelector('#coverage').textContent = `${coveragePct.toFixed(1)}%`;
    this.root.querySelector('#rankLine').textContent =
      total > 0 ? `내 영역 · ${rank}위 / ${total}명` : '내 영역';
  }

  setHp(hp, maxHp = 100) {
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    const fill = this.root.querySelector('#hpFill');
    fill.style.width = pct + '%';
    fill.style.background = pct > 50 ? '#36d399' : pct > 25 ? '#fbbf24' : '#f87171';
    this.root.querySelector('#hpText').textContent = `HP ${Math.round(hp)}`;
  }

  setLeaderboard(list, selfId) {
    const rows = list.slice(0, 8).map((p, i) => {
      const css = slotColorCss(p.slot);
      const you = p.id === selfId ? ' you' : '';
      return `<div class="lb-row${you}">
        <span class="rk">${i + 1}</span>
        <span class="dot" style="background:${css}"></span>
        <span class="nm">${escapeHtml(p.name)}</span>
        <span class="sc">${p.cells}</span>
      </div>`;
    }).join('');
    this.root.querySelector('#lbRows').innerHTML =
      rows || '<div class="lb-row"><span class="nm" style="color:#9aa3c7">대기 중…</span></div>';
  }

  setSelfStats(s) {
    this.root.querySelector('#sCells').textContent = s.cells;
    this.root.querySelector('#sKills').textContent = s.kills;
    this.root.querySelector('#sDeaths').textContent = s.deaths;
  }

  showBanner(html) {
    const b = this.root.querySelector('#banner');
    b.innerHTML = html;
    b.classList.remove('hidden');
  }
  hideBanner() { this.root.querySelector('#banner').classList.add('hidden'); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
