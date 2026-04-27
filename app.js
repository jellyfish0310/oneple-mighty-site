// ============================================================
//  ONEPLE 마이티 사이트 - 메인 앱 로직
// ============================================================

// ── 상태 관리 ──────────────────────────────────────────────
const state = {
  currentPage: 'page-main',
  adminPassword: localStorage.getItem('mighty_admin_pw') || CONFIG.DEFAULT_PASSWORD,
  currentSemester: localStorage.getItem('mighty_current_semester') || '26-1',
  semesters: JSON.parse(localStorage.getItem('mighty_semesters') || '["26-1"]'),
  rankingData: {},   // { "26-1": [{name, score}, ...] }
  logData: {},       // { "26-1": [{id, time, type, scores, result}, ...] }
};

// ── 페이지 전환 ────────────────────────────────────────────
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) {
    target.classList.add('active');
    state.currentPage = pageId;
    window.scrollTo(0, 0);
  }

  // 페이지별 초기화
  if (pageId === 'page-ranking') loadRanking();
  if (pageId === 'page-admin-main') loadAdminPage();
  if (pageId === 'page-admin-login') {
    document.getElementById('admin-pw-input').value = '';
    document.getElementById('admin-login-error').classList.add('hidden');
  }
}

// ── 노프렌드 토글 ──────────────────────────────────────────
function toggleNoFriend() {
  const noFriend = document.getElementById('chk-nofriend').checked;
  const friendGroup = document.getElementById('friend-group');
  const friendInput = document.getElementById('inp-friend');
  if (noFriend) {
    friendGroup.style.display = 'none';
    friendInput.value = '(노프렌드)';
  } else {
    friendGroup.style.display = 'grid';
    friendInput.value = '';
  }
  // 결과 숨기기
  document.getElementById('result-area').classList.add('hidden');
}

// ── 점수 계산 로직 ─────────────────────────────────────────
function calculate() {
  const jugong = document.getElementById('inp-jugong').value.trim();
  const noFriend = document.getElementById('chk-nofriend').checked;
  const friend = noFriend ? null : document.getElementById('inp-friend').value.trim();
  const c1 = document.getElementById('inp-c1').value.trim();
  const c2 = document.getElementById('inp-c2').value.trim();
  const c3 = document.getElementById('inp-c3').value.trim();
  const gongak = parseInt(document.getElementById('inp-gongak').value);
  const score = parseInt(document.getElementById('inp-score').value);
  const noGiru = document.getElementById('chk-nogiru').checked;

  // 입력 검증
  if (!jugong || (!noFriend && !friend) || !c1 || !c2 || !c3) {
    alert('모든 이름을 입력해주세요!'); return;
  }
  if (isNaN(gongak) || isNaN(score)) {
    alert('공약과 점수를 입력해주세요!'); return;
  }
  if (gongak < 13 || gongak > 20) {
    alert('공약은 13~20 사이여야 합니다!'); return;
  }

  const jugongWon = score >= gongak;
  const isRun = jugongWon && score >= 20;
  const isBackRun = !jugongWon && score < 10;

  // 배수 계산
  let multiplier = 1;
  if (jugongWon) {
    if (isRun) multiplier *= 2;
    if (noGiru) multiplier *= 2;
    if (noFriend) multiplier *= 2;
  } else {
    if (isBackRun) multiplier *= 2;
    if (noGiru) multiplier *= 2;
  }

  let jugongScore, friendScore, citizenScore;

  if (jugongWon) {
    const base = gongak + score - 26;
    jugongScore = base * 2 * multiplier;
    friendScore = noFriend ? null : base * multiplier;
    citizenScore = -(base * multiplier);
  } else {
    const base = gongak - score;
    jugongScore = -(base * 2 * multiplier);
    friendScore = noFriend ? null : -(base * multiplier);
    citizenScore = base * multiplier;
  }

  // 결과 표시
  const resultArea = document.getElementById('result-area');
  const badge = document.getElementById('result-badge');
  const list = document.getElementById('result-list');

  resultArea.classList.remove('hidden');

  // 뱃지
  let badgeHTML = '';
  if (jugongWon) {
    badgeHTML += `<span class="result-badge badge-jugong-win">주공 승리</span>`;
  } else {
    badgeHTML += `<span class="result-badge badge-citizen-win">시민 승리</span>`;
  }
  if (noFriend) badgeHTML += `<span class="result-badge badge-nofriend">노프렌드</span>`;
  if (isRun) badgeHTML += `<span class="result-badge" style="background:#dbeafe;color:#1e40af;margin-left:4px">런</span>`;
  if (isBackRun) badgeHTML += `<span class="result-badge" style="background:#fce7f3;color:#9d174d;margin-left:4px">백런</span>`;
  if (noGiru) badgeHTML += `<span class="result-badge" style="background:#f3e8ff;color:#6b21a8;margin-left:4px">노기루</span>`;
  badge.outerHTML; // reset
  document.querySelector('.result-header').innerHTML = `<span class="result-title">점수 변동 결과</span>${badgeHTML}`;

  // 점수 목록
  const players = [
    { name: jugong, role: '주공', score: jugongScore },
    ...(noFriend ? [] : [{ name: friend, role: '프렌드', score: friendScore }]),
    { name: c1, role: '시민', score: citizenScore },
    { name: c2, role: '시민', score: citizenScore },
    { name: c3, role: '시민', score: citizenScore },
  ];

  list.innerHTML = players.map(p => {
    const cls = p.score > 0 ? 'score-pos' : p.score < 0 ? 'score-neg' : 'score-zero';
    const sign = p.score > 0 ? '+' : '';
    return `<div class="result-row">
      <span class="result-name">${p.name} <span style="font-weight:400;color:var(--text-muted);font-size:0.8rem">(${p.role})</span></span>
      <span class="result-score ${cls}">${sign}${p.score}</span>
    </div>`;
  }).join('');

  // 데이터 저장
  const gameData = {
    id: Date.now().toString(),
    time: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    type: '오프라인',
    jugong, friend: noFriend ? '(노프렌드)' : friend,
    c1, c2, c3, gongak, score,
    noFriend, noGiru, isRun, isBackRun,
    players,
    result: jugongWon ? '주공 승리' : '시민 승리',
    semester: state.currentSemester,
  };

  saveGameData(gameData);
}

// ── 데이터 저장 ────────────────────────────────────────────
async function saveGameData(gameData) {
  // 로컬 저장 (랭킹용)
  const sem = state.currentSemester;
  if (!state.logData[sem]) state.logData[sem] = [];
  state.logData[sem].unshift(gameData);
  localStorage.setItem('mighty_logs', JSON.stringify(state.logData));

  updateRankingFromLogs();
  localStorage.setItem('mighty_ranking', JSON.stringify(state.rankingData));

  // 구글 시트 전송 (설정된 경우)
  if (CONFIG.SCRIPT_URL && CONFIG.SCRIPT_URL !== 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
    try {
      await fetch(CONFIG.SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addGame',
          data: gameData,
        }),
      });
    } catch (e) {
      console.warn('구글 시트 저장 실패 (로컬에는 저장됨):', e);
    }
  }
}

// ── 랭킹 계산 ──────────────────────────────────────────────
function updateRankingFromLogs() {
  state.rankingData = {};
  for (const [sem, logs] of Object.entries(state.logData)) {
    const scores = {};
    for (const game of logs) {
      for (const p of game.players) {
        if (!p.name || p.name === '(노프렌드)') continue;
        if (!scores[p.name]) scores[p.name] = 0;
        scores[p.name] += p.score;
      }
    }
    state.rankingData[sem] = Object.entries(scores)
      .map(([name, score]) => ({ name, score }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }
}

// ── 랭킹 페이지 ────────────────────────────────────────────
let rankingViewSemester = state.currentSemester;

function loadRanking() {
  rankingViewSemester = state.currentSemester;

  // 로컬에서 불러오기
  const savedLogs = localStorage.getItem('mighty_logs');
  if (savedLogs) {
    state.logData = JSON.parse(savedLogs);
    updateRankingFromLogs();
  }

  // 구글 시트에서 불러오기 시도
  if (CONFIG.SCRIPT_URL && CONFIG.SCRIPT_URL !== 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
    fetchRankingFromSheet();
  } else {
    renderRanking();
  }
}

async function fetchRankingFromSheet() {
  try {
    const url = `${CONFIG.SCRIPT_URL}?action=getRanking&semester=${encodeURIComponent(rankingViewSemester)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data.ranking) {
      state.rankingData[rankingViewSemester] = data.ranking;
    }
    if (data && data.semesters) {
      state.semesters = data.semesters;
      localStorage.setItem('mighty_semesters', JSON.stringify(state.semesters));
    }
  } catch (e) {
    console.warn('랭킹 원격 로드 실패, 로컬 사용:', e);
  }
  renderRanking();
}

function renderRanking() {
  const display = document.getElementById('current-semester-display');
  if (display) display.textContent = rankingViewSemester;

  const loading = document.getElementById('ranking-loading');
  const empty = document.getElementById('ranking-empty');
  const body = document.getElementById('ranking-body');
  const table = document.getElementById('ranking-table');

  if (loading) loading.classList.add('hidden');

  const data = state.rankingData[rankingViewSemester] || [];

  if (data.length === 0) {
    table.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  table.classList.remove('hidden');
  empty.classList.add('hidden');

  // 등수 계산 (동점 동일 등수)
  let rank = 1;
  const rows = data.map((p, i) => {
    if (i > 0 && p.score < data[i-1].score) rank = i + 1;
    const medals = ['🥇','🥈','🥉'];
    const rankDisplay = rank <= 3 ? `<span class="rank-medal">${medals[rank-1]}</span>` : rank;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const sign = p.score > 0 ? '+' : '';
    const scoreColor = p.score > 0 ? 'color:#166534' : p.score < 0 ? 'color:#ef4444' : '';
    return `<tr class="${rankClass}">
      <td>${rankDisplay}</td>
      <td>${p.name}</td>
      <td style="${scoreColor};font-weight:700">${sign}${p.score}</td>
    </tr>`;
  });

  body.innerHTML = rows.join('');
}

function changeSemester(dir) {
  const idx = state.semesters.indexOf(rankingViewSemester);
  const newIdx = idx + dir;
  if (newIdx >= 0 && newIdx < state.semesters.length) {
    rankingViewSemester = state.semesters[newIdx];
    renderRanking();
  }
}

// ── 관리자 로그인 ──────────────────────────────────────────
function adminLogin() {
  const input = document.getElementById('admin-pw-input').value;
  const err = document.getElementById('admin-login-error');
  if (input === state.adminPassword) {
    err.classList.add('hidden');
    showPage('page-admin-main');
  } else {
    err.classList.remove('hidden');
    document.getElementById('admin-pw-input').value = '';
  }
}

// ── 관리자 메인 페이지 ─────────────────────────────────────
function loadAdminPage() {
  document.getElementById('admin-semester-display').textContent = state.currentSemester;
  // 항상 최신 로컬 데이터 불러오기
  const savedLogs = localStorage.getItem('mighty_logs');
  state.logData = savedLogs ? JSON.parse(savedLogs) : {};
  renderAdminLogs();
  renderSemesterList();
}

function renderAdminLogs() {
  const list = document.getElementById('log-list');
  const logs = state.logData[state.currentSemester] || [];

  if (logs.length === 0) {
    list.innerHTML = '<p class="empty-msg">기록이 없어요.</p>';
    return;
  }

  list.innerHTML = logs.map(log => {
    const scores = log.players.map(p => `${p.name} ${p.score > 0 ? '+' : ''}${p.score}`).join(' | ');
    const resultClass = log.result === '주공 승리' ? 'log-result-jugong' : 'log-result-citizen';
    return `<div class="log-item" id="log-${log.id}">
      <div class="log-item-content">
        <div class="log-item-time">🕐 ${log.time}</div>
        <div class="log-item-type">구분 : ${log.type}</div>
        <div class="log-item-scores">결과 :<br>${scores}</div>
        <div class="log-item-result ${resultClass}">${log.result}</div>
      </div>
      <label class="checkbox-label" style="align-self:center">
        <input type="checkbox" class="log-checkbox" data-id="${log.id}" onchange="updateLogSelection(this)" />
        <span class="checkmark"></span>
      </label>
    </div>`;
  }).join('');
}

function updateLogSelection(checkbox) {
  const item = document.getElementById(`log-${checkbox.dataset.id}`);
  if (checkbox.checked) {
    item.classList.add('selected');
  } else {
    item.classList.remove('selected');
    document.getElementById('chk-select-all').checked = false;
  }
}

function toggleSelectAll(masterCheckbox) {
  document.querySelectorAll('.log-checkbox').forEach(cb => {
    cb.checked = masterCheckbox.checked;
    const item = document.getElementById(`log-${cb.dataset.id}`);
    if (item) item.classList.toggle('selected', masterCheckbox.checked);
  });
}

function deleteSelected() {
  var selected = [];
  document.querySelectorAll('.log-checkbox:checked').forEach(function(cb) {
    selected.push(String(cb.dataset.id));
  });
  if (selected.length === 0) { alert('삭제할 항목을 선택해주세요.'); return; }

  showModal('선택한 ' + selected.length + '개의 기록을 삭제하시겠습니까? 랭킹에도 반영됩니다.', function() {
    var sem = state.currentSemester;
    var currentLogs = state.logData[sem] || [];
    var newLogs = [];
    for (var i = 0; i < currentLogs.length; i++) {
      if (selected.indexOf(String(currentLogs[i].id)) === -1) {
        newLogs.push(currentLogs[i]);
      }
    }
    state.logData[sem] = newLogs;
    localStorage.setItem('mighty_logs', JSON.stringify(state.logData));
    updateRankingFromLogs();
    localStorage.setItem('mighty_ranking', JSON.stringify(state.rankingData));

    if (CONFIG.SCRIPT_URL && CONFIG.SCRIPT_URL !== 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
      fetch(CONFIG.SCRIPT_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteGames', ids: selected }),
      });
    }

    document.getElementById('chk-select-all').checked = false;
    renderAdminLogs();
  });
}

// ── 학기 관리 ──────────────────────────────────────────────
function toggleSemesterPanel() {
  const panel = document.getElementById('semester-panel');
  panel.classList.toggle('hidden');
}

function renderSemesterList() {
  const listEl = document.getElementById('semester-list');
  listEl.innerHTML = state.semesters.map(s =>
    `<span class="semester-item ${s === state.currentSemester ? 'active' : ''}" onclick="selectSemester('${s}')">${s}</span>`
  ).join('');
}

function selectSemester(sem) {
  state.currentSemester = sem;
  localStorage.setItem('mighty_current_semester', sem);
  document.getElementById('admin-semester-display').textContent = sem;
  renderSemesterList();
  renderAdminLogs();
  toggleSemesterPanel();
}

function createNewSemester() {
  const last = state.semesters[state.semesters.length - 1];
  const [year, half] = last.split('-').map(Number);
  const next = half === 1 ? `${year}-2` : `${year+1}-1`;
  if (state.semesters.includes(next)) {
    alert(`${next} 학기가 이미 존재합니다.`); return;
  }
  state.semesters.push(next);
  localStorage.setItem('mighty_semesters', JSON.stringify(state.semesters));
  selectSemester(next);
}

// ── 비밀번호 변경 ──────────────────────────────────────────
function changePassword() {
  const current = document.getElementById('pw-current').value;
  const newPw = document.getElementById('pw-new').value.trim();
  const errEl = document.getElementById('pw-change-error');

  if (current !== state.adminPassword) {
    errEl.classList.remove('hidden'); return;
  }
  errEl.classList.add('hidden');

  if (!newPw) { alert('새 비밀번호를 입력해주세요.'); return; }

  showModal('정말로 비밀번호를 바꾸시겠습니까?', () => {
    state.adminPassword = newPw;
    localStorage.setItem('mighty_admin_pw', newPw);
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    alert('비밀번호가 성공적으로 변경되었습니다.');
    showPage('page-admin-main');
  });
}

// ── 모달 ───────────────────────────────────────────────────
let modalCallback = null;

function showModal(message, onConfirm) {
  modalCallback = onConfirm;
  document.getElementById('modal-message').textContent = message;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function confirmModal() {
  const cb = modalCallback;
  modalCallback = null;
  document.getElementById('modal-overlay').classList.add('hidden');
  if (cb) cb();
}

function closeModal() {
  modalCallback = null;
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ── 초기화 ─────────────────────────────────────────────────
(function init() {
  // 저장된 데이터 로드
  const savedLogs = localStorage.getItem('mighty_logs');
  if (savedLogs) state.logData = JSON.parse(savedLogs);

  const savedSemesters = localStorage.getItem('mighty_semesters');
  if (savedSemesters) state.semesters = JSON.parse(savedSemesters);

  updateRankingFromLogs();
  showPage('page-main');
})();
