// ============================================================
//  ONEPLE 온라인 마이티 - 게임 로직
// ============================================================

// ── Supabase 클라이언트 ────────────────────────────────────
let supabase = null;

function initSupabase() {
  if (!ONLINE_CONFIG.SUPABASE_URL || ONLINE_CONFIG.SUPABASE_URL === 'YOUR_SUPABASE_URL') return false;
  supabase = window.supabase.createClient(ONLINE_CONFIG.SUPABASE_URL, ONLINE_CONFIG.SUPABASE_ANON_KEY);
  return true;
}

// ── 상태 ──────────────────────────────────────────────────
const onlineState = {
  myName: localStorage.getItem('mighty_player_name') || '',
  currentRoom: null,
  gameState: null,
  subscription: null,
  roomSubscription: null,
};

// ── 카드 정의 ──────────────────────────────────────────────
const SUITS = ['스', '다', '클', '하']; // 스페이드, 다이아, 클럽, 하트
const SUIT_COLORS = { '스': '#1a1f5e', '다': '#e8491d', '클': '#22c55e', '하': '#ef4444' };
const SUIT_SYMBOLS = { '스': '♠', '다': '◆', '클': '♣', '하': '♥' };
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_SCORES = { '10':1, 'J':1, 'Q':1, 'K':1, 'A':1 }; // 딜미스 계산용

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: suit + rank });
    }
  }
  deck.push({ suit: 'JK', rank: 'JK', id: 'JK' }); // 조커
  return deck;
}

function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function dealCards(players) {
  const deck = shuffleDeck(createDeck());
  const hands = {};
  players.forEach((p, i) => {
    hands[p] = deck.slice(i * 10, i * 10 + 10);
  });
  const floorCards = deck.slice(50); // 3장
  return { hands, floorCards };
}

function checkDealMiss(hand) {
  // 10,J,Q,K,A = +1점씩, 조커 = -1점, 합이 0 이하면 딜미스 가능
  let score = 0;
  for (const card of hand) {
    if (card.id === 'JK') score -= 1;
    else if (RANK_SCORES[card.rank]) score += 1;
  }
  return score <= 0;
}

// ── 카드 강약 비교 ─────────────────────────────────────────
function getMighty(giru) {
  // 기루가 스페이드면 마이티는 다이아 A, 아니면 스페이드 A
  if (giru === '스') return '다A';
  return '스A';
}

function getJokerCaller(giru) {
  // 기루가 스페이드면 클럽 3, 기루가 클럽이면 스페이드 3
  if (giru === '클') return '스3';
  return '클3';
}

function cardPower(card, giru, leadSuit, mightyId, jokerCallerId, noGiru) {
  // 조커
  if (card.id === 'JK') return 1000;
  // 마이티
  if (card.id === mightyId) return 999;
  // 노기루면 숫자만
  if (noGiru) {
    if (card.id === jokerCallerId) return 100;
    if (card.suit === leadSuit) return RANKS.indexOf(card.rank) + 1;
    return 0;
  }
  // 기루패
  if (card.suit === giru) return 200 + RANKS.indexOf(card.rank);
  // 조커콜러
  if (card.id === jokerCallerId) return 100;
  // 선패 문양
  if (card.suit === leadSuit) return RANKS.indexOf(card.rank) + 1;
  return 0;
}

function getWinner(trick, giru, mightyId, jokerCallerId, noGiru) {
  let best = null;
  let bestPower = -1;
  const leadSuit = trick[0].card.suit === 'JK' ? giru : trick[0].card.suit;
  for (const t of trick) {
    const p = cardPower(t.card, giru, leadSuit, mightyId, jokerCallerId, noGiru);
    if (p > bestPower) { bestPower = p; best = t.player; }
  }
  return best;
}

// ── 방 목록 페이지 ─────────────────────────────────────────
async function loadOnlinePage() {
  if (!supabase && !initSupabase()) {
    document.getElementById('online-content').innerHTML = `
      <div class="online-error">
        <p>⚠️ Supabase 설정이 필요해요!</p>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0.5rem">config.js에서 SUPABASE_URL과 SUPABASE_ANON_KEY를 입력해주세요.</p>
      </div>`;
    return;
  }

  // 닉네임 확인
  if (!onlineState.myName) {
    showNicknameModal();
    return;
  }

  loadRoomList();
}

function showNicknameModal() {
  document.getElementById('online-content').innerHTML = `
    <div class="nickname-setup">
      <div class="card" style="max-width:300px;margin:2rem auto;text-align:center">
        <h3 style="margin-bottom:1rem;color:var(--navy)">닉네임 설정</h3>
        <p style="font-size:0.88rem;color:var(--text-muted);margin-bottom:1rem">온라인 게임에서 사용할 이름이에요</p>
        <input type="text" id="nickname-input" placeholder="닉네임 입력" maxlength="8"
          style="width:100%;border:1.5px solid var(--border);border-radius:10px;padding:0.65rem 1rem;font-size:0.95rem;margin-bottom:0.75rem;outline:none"
          onkeydown="if(event.key==='Enter')saveNickname()" />
        <button class="calc-btn" onclick="saveNickname()">시작하기</button>
      </div>
    </div>`;
}

function saveNickname() {
  const name = document.getElementById('nickname-input').value.trim();
  if (!name) { alert('닉네임을 입력해주세요!'); return; }
  onlineState.myName = name;
  localStorage.setItem('mighty_player_name', name);
  loadRoomList();
}

async function loadRoomList() {
  const content = document.getElementById('online-content');
  content.innerHTML = `<div class="loading-msg">방 목록 불러오는 중...</div>`;

  const { data: rooms, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('status', 'waiting')
    .order('created_at', { ascending: false });

  if (error) {
    content.innerHTML = `<div class="online-error">방 목록을 불러오지 못했어요: ${error.message}</div>`;
    return;
  }

  renderRoomList(rooms || []);

  // 실시간 구독
  if (onlineState.roomSubscription) onlineState.roomSubscription.unsubscribe();
  onlineState.roomSubscription = supabase
    .channel('rooms-list')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => loadRoomList())
    .subscribe();
}

function renderRoomList(rooms) {
  const content = document.getElementById('online-content');
  content.innerHTML = `
    <div class="room-list-header">
      <span class="my-name-badge">👤 ${onlineState.myName}
        <button onclick="changeNickname()" style="background:none;border:none;cursor:pointer;font-size:0.75rem;color:var(--text-muted);margin-left:4px">변경</button>
      </span>
    </div>
    <div class="room-list" id="room-list">
      ${rooms.length === 0
        ? '<p class="empty-msg">개설된 방이 없어요. 방을 만들어보세요!</p>'
        : rooms.map(r => renderRoomCard(r)).join('')}
    </div>`;
}

function renderRoomCard(room) {
  const players = room.players || [];
  const hasPassword = !!room.password;
  const isFull = players.length >= 5;
  return `
    <div class="room-card ${isFull ? 'room-full' : ''}" onclick="${isFull ? '' : `joinRoom('${room.id}')`}">
      <div class="room-card-info">
        <span class="room-name">${hasPassword ? '🔒 ' : ''}${room.name}</span>
        <span class="room-meta">${room.max_rounds}라운드 · ${room.host} 방장</span>
      </div>
      <div class="room-card-right">
        <span class="room-players ${isFull ? 'full' : ''}">${players.length}/5</span>
        ${isFull ? '<span class="room-status-badge">만석</span>' : '<span class="room-status-badge open">입장 가능</span>'}
      </div>
    </div>`;
}

function changeNickname() {
  onlineState.myName = '';
  localStorage.removeItem('mighty_player_name');
  showNicknameModal();
}

// ── 방 만들기 ──────────────────────────────────────────────
function showCreateRoom() {
  document.getElementById('create-room-modal').classList.remove('hidden');
}

function hideCreateRoom() {
  document.getElementById('create-room-modal').classList.add('hidden');
}

async function createRoom() {
  const name = document.getElementById('room-name-input').value.trim();
  const rounds = parseInt(document.getElementById('room-rounds-input').value) || 5;
  const password = document.getElementById('room-pw-input').value.trim();

  if (!name) { alert('방 이름을 입력해주세요!'); return; }

  const roomId = Date.now().toString();
  const { error } = await supabase.from('rooms').insert({
    id: roomId,
    name,
    host: onlineState.myName,
    max_rounds: rounds,
    password: password || null,
    players: [onlineState.myName],
    status: 'waiting',
  });

  if (error) { alert('방 만들기 실패: ' + error.message); return; }

  hideCreateRoom();
  onlineState.currentRoom = roomId;
  showWaitingRoom(roomId);
}

// ── 방 입장 ────────────────────────────────────────────────
async function joinRoom(roomId) {
  const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  if (!room) { alert('방을 찾을 수 없어요.'); return; }

  if (room.password) {
    const pw = prompt('비밀번호를 입력하세요:');
    if (pw !== room.password) { alert('비밀번호가 틀렸어요.'); return; }
  }

  const players = room.players || [];
  if (players.includes(onlineState.myName)) {
    onlineState.currentRoom = roomId;
    showWaitingRoom(roomId);
    return;
  }
  if (players.length >= 5) { alert('방이 꽉 찼어요.'); return; }

  players.push(onlineState.myName);
  await supabase.from('rooms').update({ players }).eq('id', roomId);
  onlineState.currentRoom = roomId;
  showWaitingRoom(roomId);
}

// ── 대기실 ─────────────────────────────────────────────────
async function showWaitingRoom(roomId) {
  showPage('page-online-game');
  const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  renderWaitingRoom(room);

  if (onlineState.subscription) onlineState.subscription.unsubscribe();
  onlineState.subscription = supabase
    .channel('room-' + roomId)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      async (payload) => {
        if (payload.new.status === 'playing') {
          await loadGameState(roomId);
        } else {
          renderWaitingRoom(payload.new);
        }
      })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `room_id=eq.${roomId}` },
      async (payload) => {
        onlineState.gameState = payload.new;
        renderGame();
      })
    .subscribe();
}

function renderWaitingRoom(room) {
  const players = room.players || [];
  const isHost = room.host === onlineState.myName;
  document.getElementById('game-area').innerHTML = `
    <div class="waiting-room">
      <div class="waiting-header">
        <h2 class="waiting-title">${room.name}</h2>
        <p class="waiting-meta">${room.max_rounds}라운드 · 방장: ${room.host}</p>
      </div>
      <div class="player-slots">
        ${Array(5).fill(0).map((_, i) => `
          <div class="player-slot ${players[i] ? 'occupied' : 'empty'}">
            ${players[i]
              ? `<span class="slot-name">${players[i] === room.host ? '👑 ' : ''}${players[i]}${players[i] === onlineState.myName ? ' (나)' : ''}</span>`
              : `<span class="slot-empty">대기 중...</span>`}
          </div>`).join('')}
      </div>
      <div class="waiting-actions">
        ${isHost && players.length === 5
          ? `<button class="calc-btn" onclick="startGame('${room.id}')">게임 시작!</button>`
          : `<p class="waiting-hint">${isHost ? '5명이 모이면 시작할 수 있어요' : '방장이 게임을 시작할 때까지 기다려주세요'} (${players.length}/5)</p>`}
        <button class="back-btn" style="margin-top:0.75rem;width:100%" onclick="leaveRoom('${room.id}')">방 나가기</button>
      </div>
    </div>`;
}

async function leaveRoom(roomId) {
  const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  if (!room) { showPage('page-online'); return; }

  let players = (room.players || []).filter(p => p !== onlineState.myName);

  if (players.length === 0) {
    await supabase.from('rooms').delete().eq('id', roomId);
  } else {
    const newHost = room.host === onlineState.myName ? players[0] : room.host;
    await supabase.from('rooms').update({ players, host: newHost }).eq('id', roomId);
  }

  if (onlineState.subscription) onlineState.subscription.unsubscribe();
  onlineState.currentRoom = null;
  onlineState.gameState = null;
  showPage('page-online');
  loadRoomList();
}

// ── 게임 시작 ──────────────────────────────────────────────
async function startGame(roomId) {
  const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  const players = room.players;

  // 카드 배분
  const { hands, floorCards } = dealCards(players);
  const firstBidder = players[Math.floor(Math.random() * players.length)];

  const gsId = roomId + '_1';
  await supabase.from('game_states').insert({
    id: gsId,
    room_id: roomId,
    round: 1,
    phase: 'deal_miss',
    hands,
    floor_cards: floorCards,
    bids: {},
    current_turn: firstBidder,
    bid_start_player: firstBidder,
    scores: Object.fromEntries(players.map(p => [p, 0])),
    total_scores: Object.fromEntries(players.map(p => [p, 0])),
    tricks: [],
    current_trick: [],
    deal_miss_pot: 0,
  });

  await supabase.from('rooms').update({ status: 'playing', current_round: 1 }).eq('id', roomId);
}

async function loadGameState(roomId) {
  const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  const { data: gs } = await supabase.from('game_states')
    .select('*').eq('room_id', roomId).order('round', { ascending: false }).limit(1).single();
  onlineState.currentRoom = roomId;
  onlineState.gameState = gs;
  onlineState.roomData = room;
  renderGame();
}

// ── 게임 렌더링 ────────────────────────────────────────────
function renderGame() {
  const gs = onlineState.gameState;
  if (!gs) return;

  switch (gs.phase) {
    case 'deal_miss': renderDealMissPhase(gs); break;
    case 'bidding': renderBiddingPhase(gs); break;
    case 'floor_cards': renderFloorCardsPhase(gs); break;
    case 'friend_select': renderFriendSelectPhase(gs); break;
    case 'playing': renderPlayingPhase(gs); break;
    case 'round_end': renderRoundEndPhase(gs); break;
    case 'game_end': renderGameEndPhase(gs); break;
  }
}

// ── 딜미스 단계 ───────────────────────────────────────────
function renderDealMissPhase(gs) {
  const myHand = gs.hands[onlineState.myName] || [];
  const canDealMiss = checkDealMiss(myHand);
  const isMyTurn = gs.current_turn === onlineState.myName;

  document.getElementById('game-area').innerHTML = `
    <div class="game-phase-container">
      <div class="phase-header">
        <span class="phase-badge">딜미스 확인</span>
        <span class="phase-info">팟: ${gs.deal_miss_pot || 0}원</span>
      </div>
      <div class="my-hand-area">
        <p class="hand-label">내 패</p>
        <div class="card-hand">${myHand.map(c => renderCardHTML(c)).join('')}</div>
      </div>
      ${isMyTurn ? `
        <div class="action-area">
          <p class="action-hint">딜미스를 하시겠어요? ${canDealMiss ? '(가능 - 10원 납부)' : '(조건 미충족)'}</p>
          ${canDealMiss ? `<button class="game-btn btn-warning" onclick="declareDealMiss()">딜미스 선언 (10원)</button>` : ''}
          <button class="game-btn btn-primary" onclick="passDealMiss()">패스</button>
        </div>` : `<p class="waiting-hint">⏳ ${gs.current_turn}의 딜미스 여부 확인 중...</p>`}
    </div>`;
}

async function declareDealMiss() {
  const gs = onlineState.gameState;
  const room = await supabase.from('rooms').select('*').eq('id', onlineState.currentRoom).single();
  const players = room.data.players;
  const idx = players.indexOf(onlineState.myName);
  const nextPlayer = players[(idx + 1) % players.length];

  // 새로 딜링
  const { hands, floorCards } = dealCards(players);
  await supabase.from('game_states').update({
    hands,
    floor_cards: floorCards,
    deal_miss_pot: (gs.deal_miss_pot || 0) + 10,
    current_turn: nextPlayer,
    updated_at: new Date().toISOString(),
  }).eq('id', gs.id);
}

async function passDealMiss() {
  const gs = onlineState.gameState;
  const room = await supabase.from('rooms').select('*').eq('id', onlineState.currentRoom).single();
  const players = room.data.players;
  const idx = players.indexOf(onlineState.myName);
  const nextIdx = (idx + 1) % players.length;
  const nextPlayer = players[nextIdx];

  // 모두 패스하면 비딩 시작
  const checkedCount = (gs.deal_miss_checked || 0) + 1;
  if (checkedCount >= players.length) {
    await supabase.from('game_states').update({
      phase: 'bidding',
      current_turn: gs.bid_start_player,
      bids: {},
      updated_at: new Date().toISOString(),
    }).eq('id', gs.id);
  } else {
    await supabase.from('game_states').update({
      current_turn: nextPlayer,
      deal_miss_checked: checkedCount,
      updated_at: new Date().toISOString(),
    }).eq('id', gs.id);
  }
}

// ── 비딩 단계 ──────────────────────────────────────────────
function renderBiddingPhase(gs) {
  const isMyTurn = gs.current_turn === onlineState.myName;
  const isBidStarter = gs.bid_start_player === onlineState.myName;
  const currentMax = Math.max(12, ...Object.values(gs.bids || {}).map(b => b.amount || 0));
  const myBid = (gs.bids || {})[onlineState.myName];

  document.getElementById('game-area').innerHTML = `
    <div class="game-phase-container">
      <div class="phase-header">
        <span class="phase-badge">비딩</span>
        <span class="phase-info">현재 최고: ${currentMax === 12 ? '-' : currentMax}</span>
      </div>
      <div class="bids-display">
        ${Object.entries(gs.bids || {}).map(([p, b]) =>
          `<span class="bid-item">${p}: ${b.passed ? '패스' : b.amount + (b.suit ? ' ' + b.suit : '')}</span>`
        ).join('')}
      </div>
      <div class="my-hand-area">
        <p class="hand-label">내 패</p>
        <div class="card-hand">${(gs.hands[onlineState.myName] || []).map(c => renderCardHTML(c)).join('')}</div>
      </div>
      ${isMyTurn ? `
        <div class="action-area">
          <p class="action-hint">비딩하세요 (최소 ${currentMax + 1})</p>
          <div class="bid-controls">
            <select id="bid-amount">
              ${Array.from({length: 20 - currentMax}, (_, i) => currentMax + 1 + i)
                .map(n => `<option value="${n}">${n}</option>`).join('')}
            </select>
            <select id="bid-suit">
              <option value="스">♠ 스페이드</option>
              <option value="다">◆ 다이아</option>
              <option value="클">♣ 클럽</option>
              <option value="하">♥ 하트</option>
              <option value="노기루">노기루</option>
            </select>
          </div>
          <div class="bid-btns">
            <button class="game-btn btn-primary" onclick="placeBid()">비딩</button>
            ${!isBidStarter ? `<button class="game-btn btn-secondary" onclick="passBid()">패스</button>` : ''}
          </div>
        </div>` : `<p class="waiting-hint">⏳ ${gs.current_turn}이(가) 비딩 중...</p>`}
    </div>`;
}

async function placeBid() {
  const gs = onlineState.gameState;
  const room = await supabase.from('rooms').select('*').eq('id', onlineState.currentRoom).single();
  const players = room.data.players;
  const amount = parseInt(document.getElementById('bid-amount').value);
  const suit = document.getElementById('bid-suit').value;

  const bids = { ...(gs.bids || {}), [onlineState.myName]: { amount, suit } };

  // 20 선언시 나머지 자동패스
  if (amount >= 20) {
    players.forEach(p => { if (p !== onlineState.myName) bids[p] = { passed: true }; });
    await supabase.from('game_states').update({
      bids,
      jugong: onlineState.myName,
      contract: amount,
      contract_suit: suit,
      no_giru: suit === '노기루',
      phase: 'floor_cards',
      current_turn: onlineState.myName,
      updated_at: new Date().toISOString(),
    }).eq('id', gs.id);
    return;
  }

  const nextPlayer = getNextBidPlayer(players, gs, bids, onlineState.myName);
  if (nextPlayer === null) {
    // 비딩 종료
    const winner = Object.entries(bids)
      .filter(([, b]) => !b.passed)
      .sort((a, b) => b[1].amount - a[1].amount)[0];
    await supabase.from('game_states').update({
      bids,
      jugong: winner[0],
      contract: winner[1].amount,
      contract_suit: winner[1].suit,
      no_giru: winner[1].suit === '노기루',
      phase: 'floor_cards',
      current_turn: winner[0],
      updated_at: new Date().toISOString(),
    }).eq('id', gs.id);
  } else {
    await supabase.from('game_states').update({
      bids,
      current_turn: nextPlayer,
      updated_at: new Date().toISOString(),
    }).eq('id', gs.id);
  }
}

async function passBid() {
  const gs = onlineState.gameState;
  const room = await supabase.from('rooms').select('*').eq('id', onlineState.currentRoom).single();
  const players = room.data.players;
  const bids = { ...(gs.bids || {}), [onlineState.myName]: { passed: true } };

  const nextPlayer = getNextBidPlayer(players, gs, bids, onlineState.myName);
  if (nextPlayer === null) {
    const winner = Object.entries(bids)
      .filter(([, b]) => !b.passed)
      .sort((a, b) => b[1].amount - a[1].amount)[0];
    if (!winner) {
      // 전원 패스 - 비딩 재시작
      await supabase.from('game_states').update({
        bids: {},
        current_turn: gs.bid_start_player,
        updated_at: new Date().toISOString(),
      }).eq('id', gs.id);
      return;
    }
    await supabase.from('game_states').update({
      bids,
      jugong: winner[0],
      contract: winner[1].amount,
      contract_suit: winner[1].suit,
      no_giru: winner[1].suit === '노기루',
      phase: 'floor_cards',
      current_turn: winner[0],
      updated_at: new Date().toISOString(),
    }).eq('id', gs.id);
  } else {
    await supabase.from('game_states').update({
      bids,
      current_turn: nextPlayer,
      updated_at: new Date().toISOString(),
    }).eq('id', gs.id);
  }
}

function getNextBidPlayer(players, gs, bids, currentPlayer) {
  const activePlayers = players.filter(p => !bids[p]?.passed);
  if (activePlayers.length <= 1) return null;
  const idx = players.indexOf(currentPlayer);
  for (let i = 1; i <= players.length; i++) {
    const next = players[(idx + i) % players.length];
    if (!bids[next]?.passed) return next;
  }
  return null;
}

// ── 바닥패 단계 ────────────────────────────────────────────
function renderFloorCardsPhase(gs) {
  const isJugong = gs.jugong === onlineState.myName;
  const myHand = gs.hands[onlineState.myName] || [];
  const floorCards = gs.floor_cards || [];
  const fullHand = isJugong ? [...myHand, ...floorCards] : myHand;

  document.getElementById('game-area').innerHTML = `
    <div class="game-phase-container">
      <div class="phase-header">
        <span class="phase-badge">바닥패</span>
        <span class="phase-info">주공: ${gs.jugong} | 공약: ${gs.contract} ${gs.contract_suit}</span>
      </div>
      ${isJugong ? `
        <p class="action-hint">바닥패 3장을 확인하고 3장을 버려주세요.<br>
          <small>확인 전 공약 변경: +1 / 확인 후 변경: +2</small></p>
        <div class="floor-cards-area">
          <p class="hand-label">바닥패</p>
          <div class="card-hand">${floorCards.map(c => renderCardHTML(c, true)).join('')}</div>
        </div>
        <div class="my-hand-area">
          <p class="hand-label">내 패 (13장 중 3장 선택해서 버리기)</p>
          <div class="card-hand" id="jugong-full-hand">
            ${fullHand.map(c => renderCardHTML(c, true, 'toggleDiscard', true)).join('')}
          </div>
        </div>
        <div class="bid-controls" style="margin-top:0.75rem">
          <label style="font-size:0.85rem">공약 변경 (선택)</label>
          <select id="new-contract">${Array.from({length:8},(_,i)=>gs.contract+i)
            .map(n=>`<option value="${n}">${n}</option>`).join('')}</select>
          <select id="new-suit">
            <option value="">변경 안 함</option>
            <option value="스">♠ 스페이드</option>
            <option value="다">◆ 다이아</option>
            <option value="클">♣ 클럽</option>
            <option value="하">♥ 하트</option>
            <option value="노기루">노기루</option>
          </select>
        </div>
        <button class="game-btn btn-primary" style="margin-top:0.75rem" onclick="confirmFloorCards()">확인 완료</button>
      ` : `<p class="waiting-hint">⏳ 주공(${gs.jugong})이 바닥패를 확인 중...</p>
        <div class="my-hand-area">
          <p class="hand-label">내 패</p>
          <div class="card-hand">${myHand.map(c => renderCardHTML(c)).join('')}</div>
        </div>`}
    </div>`;

  if (isJugong) window._discardSet = new Set();
}

function toggleDiscard(cardId) {
  if (!window._discardSet) window._discardSet = new Set();
  const el = document.querySelector(`[data-card="${cardId}"]`);
  if (window._discardSet.has(cardId)) {
    window._discardSet.delete(cardId);
    el.classList.remove('selected-discard');
  } else if (window._discardSet.size < 3) {
    window._discardSet.add(cardId);
    el.classList.add('selected-discard');
  }
}

async function confirmFloorCards() {
  if (!window._discardSet || window._discardSet.size !== 3) {
    alert('버릴 카드 3장을 선택해주세요!'); return;
  }

  const gs = onlineState.gameState;
  const myHand = gs.hands[onlineState.myName] || [];
  const floorCards = gs.floor_cards || [];
  const fullHand = [...myHand, ...floorCards];

  const newHand = fullHand.filter(c => !window._discardSet.has(c.id));
  const newFloor = fullHand.filter(c => window._discardSet.has(c.id));

  const newContract = parseInt(document.getElementById('new-contract').value);
  const newSuit = document.getElementById('new-suit').value;

  let finalContract = gs.contract;
  let finalSuit = gs.contract_suit;
  let contractChanged = false;

  if (newSuit && newSuit !== gs.contract_suit) {
    // 확인 후 변경 → +2
    finalContract = Math.max(newContract, gs.contract) + 2;
    finalSuit = newSuit;
    contractChanged = true;
  } else if (newContract > gs.contract) {
    finalContract = newContract + 2;
    contractChanged = true;
  }

  const newHands = { ...gs.hands, [onlineState.myName]: newHand };

  const room = await supabase.from('rooms').select('*').eq('id', onlineState.currentRoom).single();
  const players = room.data.players;

  await supabase.from('game_states').update({
    hands: newHands,
    floor_cards: newFloor,
    contract: finalContract,
    contract_suit: finalSuit,
    no_giru: finalSuit === '노기루',
    phase: 'friend_select',
    current_turn: gs.jugong,
    updated_at: new Date().toISOString(),
  }).eq('id', gs.id);
}

// ── 프렌드 선택 단계 ───────────────────────────────────────
function renderFriendSelectPhase(gs) {
  const isJugong = gs.jugong === onlineState.myName;

  document.getElementById('game-area').innerHTML = `
    <div class="game-phase-container">
      <div class="phase-header">
        <span class="phase-badge">프렌드 선택</span>
        <span class="phase-info">주공: ${gs.jugong} | 공약: ${gs.contract} ${gs.contract_suit}</span>
      </div>
      ${isJugong ? `
        <p class="action-hint">프렌드 카드를 선택하거나 노프렌드를 선언하세요</p>
        <div class="friend-select-area">
          <select id="friend-suit">
            <option value="스">♠ 스페이드</option>
            <option value="다">◆ 다이아</option>
            <option value="클">♣ 클럽</option>
            <option value="하">♥ 하트</option>
          </select>
          <select id="friend-rank">
            ${RANKS.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
        </div>
        <div class="bid-btns">
          <button class="game-btn btn-primary" onclick="selectFriend()">프렌드 선언</button>
          <button class="game-btn btn-warning" onclick="declareNoFriend()">노프렌드</button>
        </div>` : `<p class="waiting-hint">⏳ 주공(${gs.jugong})이 프렌드를 선택 중...</p>`}
      <div class="my-hand-area">
        <p class="hand-label">내 패</p>
        <div class="card-hand">${(gs.hands[onlineState.myName] || []).map(c => renderCardHTML(c)).join('')}</div>
      </div>
    </div>`;
}

async function selectFriend() {
  const gs = onlineState.gameState;
  const suit = document.getElementById('friend-suit').value;
  const rank = document.getElementById('friend-rank').value;
  const friendCard = suit + rank;

  const room = await supabase.from('rooms').select('*').eq('id', onlineState.currentRoom).single();
  const players = room.data.players;
  const firstPlayer = players[players.indexOf(gs.jugong)];

  await supabase.from('game_states').update({
    friend_card: friendCard,
    no_friend: false,
    phase: 'playing',
    current_turn: gs.jugong,
    updated_at: new Date().toISOString(),
  }).eq('id', gs.id);
}

async function declareNoFriend() {
  const gs = onlineState.gameState;
  await supabase.from('game_states').update({
    friend_card: null,
    friend: null,
    no_friend: true,
    phase: 'playing',
    current_turn: gs.jugong,
    updated_at: new Date().toISOString(),
  }).eq('id', gs.id);
}

// ── 플레이 단계 ────────────────────────────────────────────
function renderPlayingPhase(gs) {
  const myHand = gs.hands[onlineState.myName] || [];
  const isMyTurn = gs.current_turn === onlineState.myName;
  const currentTrick = gs.current_trick || [];
  const tricks = gs.tricks || [];
  const room = onlineState.roomData;
  const players = room ? room.players : [];

  const mightyId = getMighty(gs.contract_suit);
  const jokerCallerId = getJokerCaller(gs.contract_suit);

  // 프렌드 공개 여부
  let friendReveal = '';
  if (gs.friend) {
    friendReveal = `<span class="friend-badge">🤝 프렌드: ${gs.friend}</span>`;
  } else if (gs.no_friend) {
    friendReveal = `<span class="friend-badge nofriend">노프렌드</span>`;
  }

  document.getElementById('game-area').innerHTML = `
    <div class="game-phase-container playing-phase">
      <div class="phase-header">
        <span class="phase-badge">플레이</span>
        <span class="phase-info">주공: ${gs.jugong} | ${gs.contract}${gs.contract_suit}${gs.no_giru?' 노기루':''}</span>
        ${friendReveal}
      </div>
      <div class="score-board">
        ${players.map(p => {
          const s = (gs.scores || {})[p] || 0;
          const isJugong = p === gs.jugong;
          const isFriend = p === gs.friend;
          return `<div class="score-item ${isJugong?'jugong':''} ${isFriend?'friend':''}">
            <span>${p}${isJugong?' 👑':''}${isFriend?' 🤝':''}</span>
            <span class="score-val">${s}점</span>
          </div>`;
        }).join('')}
      </div>
      <div class="trick-area">
        <p class="hand-label">현재 트릭 (${currentTrick.length}/5)</p>
        <div class="current-trick">
          ${currentTrick.map(t => `
            <div class="trick-card-wrapper">
              <span class="trick-player">${t.player}</span>
              ${renderCardHTML(t.card)}
            </div>`).join('')}
        </div>
      </div>
      <div class="my-hand-area">
        <p class="hand-label">내 패 ${isMyTurn ? '(카드를 선택하세요)' : `(${gs.current_turn} 차례)`}</p>
        <div class="card-hand">
          ${myHand.map(c => renderCardHTML(c, isMyTurn, 'playCard', true)).join('')}
        </div>
      </div>
      <div class="tricks-summary">
        완료된 트릭: ${tricks.length}
      </div>
    </div>`;
}

async function playCard(cardId) {
  const gs = onlineState.gameState;
  if (gs.current_turn !== onlineState.myName) return;

  const myHand = [...(gs.hands[onlineState.myName] || [])];
  const cardIdx = myHand.findIndex(c => c.id === cardId);
  if (cardIdx === -1) return;

  const card = myHand.splice(cardIdx, 1)[0];
  const newHands = { ...gs.hands, [onlineState.myName]: myHand };
  const currentTrick = [...(gs.current_trick || []), { player: onlineState.myName, card }];

  // 프렌드 공개 체크
  let friend = gs.friend;
  if (!friend && !gs.no_friend && gs.friend_card && card.id === gs.friend_card) {
    friend = onlineState.myName;
  }

  const room = await supabase.from('rooms').select('*').eq('id', onlineState.currentRoom).single();
  const players = room.data.players;

  if (currentTrick.length === 5) {
    // 트릭 완료
    const mightyId = getMighty(gs.contract_suit);
    const jokerCallerId = getJokerCaller(gs.contract_suit);
    const winner = getWinner(currentTrick, gs.contract_suit, mightyId, jokerCallerId, gs.no_giru);

    const tricks = [...(gs.tricks || []), { cards: currentTrick, winner }];
    const scores = { ...(gs.scores || {}) };
    currentTrick.forEach(t => {
      if (RANK_SCORES[t.card.rank]) scores[winner] = (scores[winner] || 0) + 1;
    });

    // 바닥패 점수도 winner에게
    (gs.floor_cards || []).forEach(c => {
      if (RANK_SCORES[c.rank]) scores[winner] = (scores[winner] || 0) + 1;
    });

    // 모든 트릭 완료?
    if (tricks.length >= 10) {
      await supabase.from('game_states').update({
        hands: newHands, current_trick: [], tricks, scores, friend,
        phase: 'round_end',
        current_turn: null,
        updated_at: new Date().toISOString(),
      }).eq('id', gs.id);
    } else {
      await supabase.from('game_states').update({
        hands: newHands, current_trick: [], tricks, scores, friend,
        current_turn: winner,
        updated_at: new Date().toISOString(),
      }).eq('id', gs.id);
    }
  } else {
    // 다음 플레이어
    const idx = players.indexOf(onlineState.myName);
    const nextPlayer = players[(idx + 1) % players.length];
    await supabase.from('game_states').update({
      hands: newHands, current_trick: currentTrick, friend,
      current_turn: nextPlayer,
      updated_at: new Date().toISOString(),
    }).eq('id', gs.id);
  }
}

// ── 라운드 종료 ────────────────────────────────────────────
function renderRoundEndPhase(gs) {
  const scores = gs.scores || {};
  const jugong = gs.jugong;
  const friend = gs.friend;
  const noFriend = gs.no_friend;
  const contract = gs.contract;
  const gongak = contract;

  // 주공 팀 점수 합산
  const jugongTeamScore = noFriend
    ? (scores[jugong] || 0)
    : (scores[jugong] || 0) + (scores[friend] || 0);

  const jugongWon = jugongTeamScore >= gongak;
  const isRun = jugongWon && jugongTeamScore >= 20;
  const isBackRun = !jugongWon && jugongTeamScore < 10;

  let multiplier = 1;
  if (jugongWon) {
    if (isRun) multiplier *= 2;
    if (gs.no_giru) multiplier *= 2;
    if (noFriend) multiplier *= 2;
  } else {
    if (isBackRun) multiplier *= 2;
    if (gs.no_giru) multiplier *= 2;
  }

  const room = onlineState.roomData;
  const players = room ? room.players : [];
  const pointChanges = {};

  if (jugongWon) {
    const base = gongak + jugongTeamScore - 26;
    pointChanges[jugong] = base * 2 * multiplier;
    if (!noFriend && friend) pointChanges[friend] = base * multiplier;
    players.forEach(p => {
      if (p !== jugong && p !== friend) pointChanges[p] = -(base * multiplier);
    });
  } else {
    const base = gongak - jugongTeamScore;
    pointChanges[jugong] = -(base * 2 * multiplier);
    if (!noFriend && friend) pointChanges[friend] = -(base * multiplier);
    players.forEach(p => {
      if (p !== jugong && p !== friend) pointChanges[p] = base * multiplier;
    });
  }

  // 딜미스 팟 처리
  const pot = gs.deal_miss_pot || 0;
  if (pot > 0 && jugongWon) {
    if (!noFriend && friend) {
      pointChanges[jugong] = (pointChanges[jugong] || 0) + Math.ceil(pot / 2);
      pointChanges[friend] = (pointChanges[friend] || 0) + Math.floor(pot / 2);
    } else {
      pointChanges[jugong] = (pointChanges[jugong] || 0) + pot;
    }
  }

  const totalScores = { ...(gs.total_scores || {}) };
  players.forEach(p => {
    totalScores[p] = (totalScores[p] || 0) + (pointChanges[p] || 0);
  });

  document.getElementById('game-area').innerHTML = `
    <div class="game-phase-container">
      <div class="phase-header">
        <span class="phase-badge ${jugongWon ? 'badge-jugong-win' : 'badge-citizen-win'}">
          ${jugongWon ? '주공 승리 🎉' : '시민 승리 🎊'}
        </span>
      </div>
      <div class="round-result">
        <p>주공: ${jugong} | 공약: ${contract} | 달성: ${jugongTeamScore}</p>
        ${noFriend ? '<p>노프렌드</p>' : friend ? `<p>프렌드: ${friend}</p>` : ''}
      </div>
      <div class="score-changes">
        ${players.map(p => {
          const change = pointChanges[p] || 0;
          const cls = change > 0 ? 'score-pos' : change < 0 ? 'score-neg' : '';
          return `<div class="result-row">
            <span>${p}</span>
            <span class="${cls}">${change > 0 ? '+' : ''}${change}</span>
            <span style="color:var(--text-muted)">(합계: ${totalScores[p]})</span>
          </div>`;
        }).join('')}
      </div>
      ${gs.jugong === onlineState.myName || room?.host === onlineState.myName ? `
        <button class="game-btn btn-primary" style="margin-top:1rem" onclick="nextRound(${JSON.stringify(totalScores).replace(/"/g,'&quot;')})">
          다음 라운드
        </button>` : '<p class="waiting-hint">방장이 다음 라운드를 시작할 때까지 기다려주세요...</p>'}
    </div>`;

  // 자동으로 총점 업데이트
  supabase.from('game_states').update({
    total_scores: totalScores,
    updated_at: new Date().toISOString(),
  }).eq('id', gs.id);
}

async function nextRound(totalScores) {
  const gs = onlineState.gameState;
  const room = await supabase.from('rooms').select('*').eq('id', onlineState.currentRoom).single();
  const roomData = room.data;
  const players = roomData.players;
  const nextRound = gs.round + 1;

  if (nextRound > roomData.max_rounds) {
    // 게임 종료
    await supabase.from('game_states').update({
      phase: 'game_end',
      updated_at: new Date().toISOString(),
    }).eq('id', gs.id);
    return;
  }

  // 다음 라운드 비딩 시작자 결정
  const jugongWon = true; // 이미 계산됨
  let nextBidStarter = gs.bid_start_player;

  const { hands, floorCards } = dealCards(players);
  const gsId = onlineState.currentRoom + '_' + nextRound;

  await supabase.from('game_states').insert({
    id: gsId,
    room_id: onlineState.currentRoom,
    round: nextRound,
    phase: 'deal_miss',
    hands,
    floor_cards: floorCards,
    bids: {},
    current_turn: nextBidStarter,
    bid_start_player: nextBidStarter,
    scores: Object.fromEntries(players.map(p => [p, 0])),
    total_scores: totalScores,
    tricks: [],
    current_trick: [],
    deal_miss_pot: 0,
  });

  await supabase.from('rooms').update({ current_round: nextRound }).eq('id', onlineState.currentRoom);
}

// ── 게임 종료 ──────────────────────────────────────────────
function renderGameEndPhase(gs) {
  const totalScores = gs.total_scores || {};
  const room = onlineState.roomData;
  const players = room ? room.players : Object.keys(totalScores);
  const sorted = [...players].sort((a, b) => (totalScores[b] || 0) - (totalScores[a] || 0));

  document.getElementById('game-area').innerHTML = `
    <div class="game-phase-container">
      <div class="phase-header">
        <span class="phase-badge">🏆 게임 종료</span>
      </div>
      <div class="final-ranking">
        ${sorted.map((p, i) => {
          const medals = ['🥇','🥈','🥉'];
          const score = totalScores[p] || 0;
          const cls = score > 0 ? 'score-pos' : score < 0 ? 'score-neg' : '';
          return `<div class="result-row rank-${i+1}">
            <span>${medals[i] || (i+1)+'위'} ${p}</span>
            <span class="${cls}" style="font-weight:800">${score > 0 ? '+' : ''}${score}</span>
          </div>`;
        }).join('')}
      </div>
      <button class="game-btn btn-primary" style="margin-top:1.5rem" onclick="leaveRoom('${onlineState.currentRoom}')">
        방 나가기
      </button>
    </div>`;
}

// ── 카드 HTML 렌더링 ───────────────────────────────────────
function renderCardHTML(card, clickable = false, clickFn = '', showId = false) {
  const isJoker = card.id === 'JK';
  const color = isJoker ? '#888' : SUIT_COLORS[card.suit];
  const symbol = isJoker ? '🃏' : SUIT_SYMBOLS[card.suit];
  const onclick = clickable && clickFn ? `onclick="${clickFn}('${card.id}')"` : '';
  const cursor = clickable && clickFn ? 'cursor:pointer' : '';

  return `<div class="play-card ${clickable && clickFn ? 'clickable' : ''}" 
    data-card="${card.id}" ${onclick}
    style="color:${color};${cursor}">
    <div class="card-rank">${isJoker ? 'JK' : card.rank}</div>
    <div class="card-suit">${symbol}</div>
  </div>`;
}

// ── 튜토리얼 ──────────────────────────────────────────────
function showTutorial() {
  document.getElementById('tutorial-modal').classList.remove('hidden');
}
function hideTutorial() {
  document.getElementById('tutorial-modal').classList.add('hidden');
}
