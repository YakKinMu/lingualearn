let activeLevel = DATA.currentLevel;
let activeDataTab = 'grammar';
const PAGE = document.body?.dataset.page || 'levels';

const AUTH_REDIRECTING = (() => {
  if (typeof AuthStore === 'undefined') return false;
  if (PAGE === 'login') {
    if (AuthStore.isLoggedIn()) { window.location.href = 'index.html'; return true; }
    return false;
  }
  if (!AuthStore.isLoggedIn()) { window.location.href = 'login.html'; return true; }
  return false;
})();

document.addEventListener('DOMContentLoaded', () => {
  if (AUTH_REDIRECTING) return;

  if (PAGE === 'login') {
    initAuthPage();
    return;
  }

  StatsStore.init();
  activeLevel = DATA.currentLevel;
  renderUser();
  initNavigation();
  initMobileNav();
  initChatbot();

  if (PAGE === 'levels') {
    renderLevelTabs();
    renderLevelContent(activeLevel);
    initDataTabs();
    initModal();
  }
  if (PAGE === 'vocab') {
    renderAllVocabulary();
    initVocabFilter();
  }
  if (PAGE === 'battle') {
    renderBattleSection();
    WordBattle.init();
  }
  if (PAGE === 'spelling') {
    renderSpellingSection();
    SpellingGame.init();
  }
  if (PAGE === 'progress') {
    renderProgress();
    initStatsActions();
  }
  if (PAGE === 'profile') {
    renderProfile();
    renderProfileStats();
    initProfileEdit();
  }
});

function renderAll() {
  renderUser();
  if (PAGE === 'levels') {
    renderLevelTabs();
    renderLevelContent(activeLevel);
  }
  if (PAGE === 'vocab') renderAllVocabulary();
  if (PAGE === 'battle') renderBattleSection();
  if (PAGE === 'spelling') renderSpellingSection();
  if (PAGE === 'progress') renderProgress();
  if (PAGE === 'profile') { renderProfile(); renderProfileStats(); }
}

function refreshUI() {
  renderUser();
  if (PAGE === 'levels') renderLevelTabs();
  if (PAGE === 'battle') renderBattleSection();
  if (PAGE === 'spelling') renderSpellingSection();
  if (PAGE === 'progress') renderProgress();
}

function getPlayerAvatarHTML() {
  const u = DATA.user;
  if (u.avatarImage) {
    return `<img src="${u.avatarImage}" class="avatar-svg avatar-photo" alt="${escapeHtml(u.name)}" />`;
  }
  return escapeHtml(u.avatar);
}

function renderUser() {
  const u = DATA.user;
  const battle = StatsStore.get().battle || {};
  const rank = RankSystem.getRank(battle.rankPoints || 0);
  setText('.streak-badge', `🔥 ${u.streak} วัน`);
  setHtml('.user-avatar', getPlayerAvatarHTML());
  setText('#nav-level', `${rank.icon} ${rank.label}`);
  const navLevelEl = document.getElementById('nav-level');
  if (navLevelEl) navLevelEl.style.borderColor = `${rank.color}55`;
}

function renderBattleSection() {
  const el = document.getElementById('battle-section');
  if (!el) return;

  const battle = StatsStore.get().battle || { rankPoints: 0, wins: 0, losses: 0, streak: 0 };
  const rank = RankSystem.getRank(battle.rankPoints);
  const activeTierId = rank.tier.id;

  const tiersHtml = DATA.rankTiers.map(t => `
    <span class="rank-tier-chip${t.id === activeTierId ? ' active' : ''}" style="${t.id === activeTierId ? `color:${t.color};border-color:${t.color}` : ''}">
      ${t.icon} ${t.nameTh} (${t.minRP}+)
    </span>
  `).join('');

  const opponentsHtml = DATA.battleOpponents.map(o => {
    const or = RankSystem.getRank(o.rankRP);
    return `
      <div class="opponent-card">
        <span class="opp-avatar">${avatarHTML(o)}</span>
        <div class="opp-info">
          <strong>${escapeHtml(o.name)}</strong>
          <span>${or.icon} ${or.label} • ${o.hp} HP • ระดับ ${o.level}</span>
        </div>
        <button class="btn btn-primary btn-sm" data-start-battle="${o.id}">สู้!</button>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <div class="rank-hero">
      <div class="rank-emblem" style="border-color:${rank.color};background:${rank.color}18">${rank.icon}</div>
      <div class="rank-hero-info">
        <h3>${rank.labelTh}</h3>
        <p>${rank.rp} RP — ชนะ ${battle.wins || 0} แพ้ ${battle.losses || 0} — สถิติต่อเนื่อง ${battle.streak || 0}</p>
        <div class="rank-progress-wrap">
          <div class="rank-progress-label">
            <span>${rank.tier.nameTh} ${rank.division}</span>
            <span>${rank.nextRP ? `${rank.rpToNext} RP ถึงแรงค์ถัดไป` : 'แรงค์สูงสุด!'}</span>
          </div>
          <div class="progress-bar large"><span style="width:${rank.progress}%;background:${rank.color}"></span></div>
        </div>
      </div>
      <button class="btn btn-primary" data-start-battle="auto">⚔️ เริ่มต่อสู้!</button>
    </div>

    <div class="rank-tiers">${tiersHtml}</div>

    <div class="battle-layout">
      <div class="opponent-list">
        <h3>🎯 เลือกคู่ต่อสู้</h3>
        ${opponentsHtml}
      </div>
      <div class="rank-board">
        <h3>🏆 Rank Leaderboard</h3>
        <div id="rank-leaderboard-list">
          <p class="lb-status">กำลังโหลดอันดับ...</p>
        </div>
      </div>
      <div class="battle-how">
        <h4>วิธีเล่น — เทิร์นเบสเรียงคำ</h4>
        <ol>
          <li>คุณกับศัตรูมี HP — เรียงประโยคถูกเพื่อโจมตี</li>
          <li>คลิกคำจากกองด้านล่างเพื่อเรียงในช่องคำตอบ</li>
          <li>กด <strong>โจมตี!</strong> — ถูก = damage, ผิด/หมดเวลา = โดนโจมตี</li>
          <li>ศัตรูมีเทิร์นโต้กลับ — เรียงคำสำเร็จอาจโจมตีเพิ่ม</li>
          <li>ชนะได้ +RP เลื่อน Rank, แพ้เสีย RP</li>
          <li>ยิ่งตอบเร็ว damage ยิ่งสูง!</li>
        </ol>
      </div>
    </div>
  `;

  el.querySelectorAll('[data-start-battle]').forEach(btn => {
    btn.addEventListener('click', () => WordBattle.start(btn.dataset.startBattle));
  });

  renderLeaderboardList();
}

// Fetches the REAL, shared rank leaderboard from Firestore (see
// js/leaderboard.js) and fills in #rank-leaderboard-list. Runs async and
// separately from renderBattleSection() so opponent cards / buttons render
// instantly while the network request for the board is still in flight.
async function renderLeaderboardList() {
  const listEl = document.getElementById('rank-leaderboard-list');
  if (!listEl) return;

  if (typeof LeaderboardStore === 'undefined' || typeof firebase === 'undefined' || !firebase.firestore) {
    listEl.innerHTML = '<p class="lb-status">ไม่สามารถโหลดอันดับได้ในขณะนี้</p>';
    return;
  }

  const battle = StatsStore.get().battle || { rankPoints: 0, wins: 0, losses: 0 };
  const myUid = typeof AuthStore !== 'undefined' ? AuthStore.getCurrentUsername() : null;

  const others = (await LeaderboardStore.fetchTop(100)).filter(p => p.uid !== myUid);

  const players = [
    ...others,
    {
      uid: myUid,
      name: DATA.user.name,
      avatar: getPlayerAvatarHTML(),
      avatarIsHtml: true,
      rankRP: battle.rankPoints || 0,
      wins: battle.wins || 0,
      isYou: true,
    },
  ].sort((a, b) => b.rankRP - a.rankRP);

  if (others.length === 0) {
    listEl.innerHTML = `
      <p class="lb-status">ยังไม่มีผู้เล่นคนอื่นขึ้นบอร์ด — ชนะการต่อสู้เพื่อขึ้นเป็นอันดับ 1!</p>
      ${buildLbRow(players[0], 0)}
    `;
    return;
  }

  const TOP_N = 15;
  const top = players.slice(0, TOP_N);
  const myIndex = players.findIndex(p => p.isYou);

  let rowsHtml = top.map((p, i) => buildLbRow(p, i)).join('');
  if (myIndex >= TOP_N) {
    rowsHtml += `<div class="lb-divider">⋯</div>${buildLbRow(players[myIndex], myIndex)}`;
  }
  listEl.innerHTML = rowsHtml;
}

function buildLbRow(p, i) {
  const pr = RankSystem.getRank(p.rankRP);
  const cls = p.isYou ? 'you' : i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
  // p.avatar comes straight from Firestore for every player except "you",
  // and other players' rows can be written by other browsers — so it must
  // always be escaped (never rendered as raw HTML) to avoid stored XSS.
  const avatarOut = p.avatarIsHtml ? p.avatar : escapeHtml(p.avatar || '🙂');
  return `
    <div class="rank-lb-row ${cls}">
      <span class="lb-pos">${i + 1}</span>
      <span>${avatarOut}</span>
      <span>${escapeHtml(p.name)}${p.isYou ? ' (คุณ)' : ''}</span>
      <span>${pr.icon}</span>
      <span class="lb-rp">${p.rankRP} RP</span>
    </div>
  `;
}

function renderSpellingSection() {
  const el = document.getElementById('spelling-section');
  if (!el) return;

  const sp = StatsStore.get().spelling || { gamesPlayed: 0, totalCorrect: 0, totalWrong: 0, bestStreak: 0, bestScore: 0 };
  const totalAnswered = sp.totalCorrect + sp.totalWrong;
  const accuracy = totalAnswered > 0 ? Math.round((sp.totalCorrect / totalAnswered) * 100) : 0;

  const levelChips = ['all', ...DATA.levels].map(lv => `
    <button class="rank-tier-chip spelling-level-chip${lv === 'all' ? ' active' : ''}" data-spelling-level="${lv}">
      ${lv === 'all' ? '🔀 ทุกระดับ' : lv}
    </button>
  `).join('');

  el.innerHTML = `
    <div class="rank-hero">
      <div class="rank-emblem" style="border-color:var(--purple);background:var(--purple-bg)">✏️</div>
      <div class="rank-hero-info">
        <h3>Spelling Bee — เกมสะกดคำ</h3>
        <p>คะแนนสูงสุด ${sp.bestScore} • เล่นแล้ว ${sp.gamesPlayed} ครั้ง • ความแม่นยำ ${accuracy}% • สตรีคสูงสุด ${sp.bestStreak}</p>
      </div>
      <button class="btn btn-primary" id="spelling-start-btn" data-start-spelling="all">✏️ เริ่มเกม</button>
    </div>

    <div class="spelling-level-picker">
      <p class="puzzle-label">เลือกระดับที่จะฝึก:</p>
      <div class="rank-tiers">${levelChips}</div>
    </div>

    <div class="battle-how">
      <h4>วิธีเล่น — สะกดคำให้ถูกต้อง</h4>
      <ol>
        <li>ระบบสุ่มคำศัพท์ 10 คำ พร้อมความหมายและตัวอย่างประโยค</li>
        <li>พิมพ์คำศัพท์ภาษาอังกฤษที่ถูกต้องลงในช่อง</li>
        <li>ใช้ปุ่ม 💡 คำใบ้ได้ถ้าติด แต่คะแนนจะลดลง</li>
        <li>ตอบถูกไม่ใช้คำใบ้ = 10 คะแนน/ข้อ, ยิ่งสตรีคยาวยิ่งดี</li>
        <li>จบเกมแล้วได้ XP ตามคะแนนที่ทำได้</li>
      </ol>
    </div>
  `;

  let selectedLevel = 'all';
  el.querySelectorAll('.spelling-level-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      selectedLevel = chip.dataset.spellingLevel;
      el.querySelectorAll('.spelling-level-chip').forEach(c => c.classList.toggle('active', c === chip));
      document.getElementById('spelling-start-btn')?.setAttribute('data-start-spelling', selectedLevel);
    });
  });
}

function renderLevelTabs() {
  const container = document.getElementById('level-tabs');
  if (!container) return;
  container.innerHTML = DATA.levels.map(lv => {
    const c = DATA.levelContent[lv];
    return `<button class="level-tab${lv === activeLevel ? ' active' : ''}" data-level="${lv}" style="--lv-color:${c.color}">
      <span class="lv-code">${lv}</span>
      <span class="lv-name">${c.nameTh}</span>
    </button>`;
  }).join('');
  container.querySelectorAll('.level-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeLevel = btn.dataset.level;
      StatsStore.record('level_view', { level: activeLevel });
      renderLevelTabs();
      renderLevelContent(activeLevel);
      refreshUI();
    });
  });
}

function renderLevelContent(level) {
  const c = DATA.levelContent[level];
  if (!c) return;

  const overview = document.getElementById('level-overview');
  if (overview) {
    overview.innerHTML = `
      <div class="overview-card" style="--lv-color:${c.color}">
        <div class="overview-badge">${level}</div>
        <div class="overview-body">
          <h3>${c.name} — ${c.nameTh}</h3>
          <p>${escapeHtml(c.description)}</p>
          <div class="can-do">
            <strong>ทำอะไรได้บ้าง:</strong>
            <ul>${c.canDo.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          </div>
        </div>
      </div>
    `;
  }

  renderGrammar(c.grammar);
  renderLevelVocab(c.vocabulary, level);
  renderPhrases(c.phrases);
  renderDialogues(c.dialogues);
  renderSentences(c.sentences);
}

function renderGrammar(items) {
  const el = document.getElementById('ldata-grammar');
  if (!el) return;
  el.innerHTML = items.map(g => `
    <article class="data-card">
      <h3>${escapeHtml(g.topic)}</h3>
      <p class="data-rule">${escapeHtml(g.rule)}</p>
      <div class="examples-list">
        ${g.examples.map(ex => `<div class="example-item"><span class="ex-icon">✓</span><span>${escapeHtml(ex)}</span></div>`).join('')}
      </div>
    </article>
  `).join('');
}

function renderLevelVocab(items, level) {
  const el = document.getElementById('ldata-vocabulary');
  if (!el) return;
  el.innerHTML = `
    <table class="data-table">
      <thead><tr><th>คำศัพท์</th><th>ความหมาย</th><th>ตัวอย่างประโยค</th><th>ระดับ</th></tr></thead>
      <tbody>${items.map(v => `
        <tr>
          <td><strong>${escapeHtml(v.word)}</strong></td>
          <td>${escapeHtml(v.meaning)}</td>
          <td class="example-cell"><em>${escapeHtml(v.example)}</em></td>
          <td><span class="level-tag" style="background:${DATA.levelContent[level].color}22;color:${DATA.levelContent[level].color}">${level}</span></td>
        </tr>
      `).join('')}</tbody>
    </table>
  `;
}

function renderPhrases(items) {
  const el = document.getElementById('ldata-phrases');
  if (!el) return;
  el.innerHTML = items.map(p => `
    <article class="data-card phrase-card">
      <div class="phrase-en">${escapeHtml(p.en)}</div>
      <div class="phrase-th">${escapeHtml(p.th)}</div>
      <span class="phrase-context">${escapeHtml(p.context)}</span>
    </article>
  `).join('');
}

function renderDialogues(items) {
  const el = document.getElementById('ldata-dialogues');
  if (!el) return;
  el.innerHTML = items.map(d => `
    <article class="data-card dialogue-card">
      <h3>${escapeHtml(d.title)}</h3>
      <div class="dialogue-lines">
        ${d.lines.map(line => `
          <div class="dialogue-line">
            <span class="speaker">${escapeHtml(line.speaker)}</span>
            <div>
              <p class="line-en">${escapeHtml(line.en)}</p>
              <p class="line-th">${escapeHtml(line.th)}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </article>
  `).join('');
}

function renderSentences(items) {
  const el = document.getElementById('ldata-sentences');
  if (!el) return;
  el.innerHTML = items.map(s => `
    <article class="data-card sentence-card">
      <p class="sent-en">${escapeHtml(s.en)}</p>
      <p class="sent-th">${escapeHtml(s.th)}</p>
      <span class="sent-note">${escapeHtml(s.note)}</span>
    </article>
  `).join('');
}

function renderAllVocabulary() {
  const filter = document.getElementById('vocab-level-filter');
  if (filter) {
    filter.innerHTML = '<option value="">ทุกระดับ</option>' +
      DATA.levels.map(lv => `<option value="${lv}">${lv} — ${DATA.levelContent[lv].nameTh}</option>`).join('');
  }
  updateVocabTable();
}

function getAllVocabFlat() {
  const list = [];
  DATA.levels.forEach(lv => {
    (DATA.levelContent[lv]?.vocabulary || []).forEach(v => {
      list.push({ ...v, level: lv });
    });
  });
  return list;
}

function updateVocabTable() {
  const search = (document.getElementById('vocab-search')?.value || '').toLowerCase();
  const levelFilter = document.getElementById('vocab-level-filter')?.value || '';
  const tbody = document.getElementById('vocab-tbody');
  if (!tbody) return;

  const all = getAllVocabFlat();
  let items = all;
  if (levelFilter) items = items.filter(v => v.level === levelFilter);
  if (search) items = items.filter(v =>
    v.word.toLowerCase().includes(search) ||
    v.meaning.includes(search) ||
    v.example.toLowerCase().includes(search)
  );

  const countEl = document.getElementById('vocab-result-count');
  if (countEl) {
    countEl.innerHTML = search || levelFilter
      ? `พบ <strong>${items.length}</strong> คำ จากทั้งหมด ${all.length} คำ`
      : `คำศัพท์ทั้งหมด <strong>${all.length}</strong> คำ`;
  }

  const clearBtn = document.getElementById('vocab-clear');
  clearBtn?.classList.toggle('hidden', !search && !levelFilter);

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="4">
        <div class="table-empty-state">
          <span class="empty-icon">🔍</span>
          <strong>ไม่พบคำศัพท์ที่ตรงกับการค้นหา</strong>
          <span>ลองคำอื่น หรือเปลี่ยนตัวกรองระดับดูนะคะ</span>
        </div>
      </td></tr>
    `;
    return;
  }

  tbody.innerHTML = items.map(v => `
    <tr>
      <td><strong>${escapeHtml(v.word)}</strong></td>
      <td>${escapeHtml(v.meaning)}</td>
      <td class="example-cell"><em>${escapeHtml(v.example)}</em></td>
      <td><span class="level-tag" style="background:${DATA.levelContent[v.level].color}22;color:${DATA.levelContent[v.level].color}">${v.level}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="empty">ไม่พบคำศัพท์</td></tr>';
}

function renderProgress() {
  const u = DATA.user;
  const activity = DATA.progress.weeklyActivity;
  const maxMin = Math.max(...activity.map(a => a.minutes), 1);
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="dashboard-card">
      <h3>📊 กิจกรรมรายสัปดาห์</h3>
      <div class="activity-chart">
        ${activity.map(a => `
          <div class="chart-bar${a.today ? ' today' : ''}" style="height:${Math.round(a.minutes / maxMin * 100)}%">
            <span>${a.day}</span>
          </div>
        `).join('')}
      </div>
      <div class="daily-summary">
        <div class="summary-item"><span>${u.minutesToday} นาที</span><small>วันนี้</small></div>
        <div class="summary-item"><span>${u.level}</span><small>ระดับ</small></div>
        <div class="summary-item"><span>${u.xp.toLocaleString()}</span><small>XP</small></div>
      </div>
    </div>
    <div class="dashboard-card">
      <h3>🎯 เป้าหมาย</h3>
      <div class="goal-progress">
        <div class="goal-item">
          <div class="goal-header"><span>รายวัน ${u.dailyGoalMinutes} นาที</span><span>${u.minutesToday}/${u.dailyGoalMinutes}</span></div>
          <div class="progress-bar large"><span style="width:${Math.min(100, Math.round(u.minutesToday / u.dailyGoalMinutes * 100))}%"></span></div>
        </div>
        <div class="streak-display">
          <div class="streak-fire">🔥</div>
          <div class="streak-count">${u.streak}</div>
          <p>วันติดต่อกัน</p>
        </div>
      </div>
    </div>
    <div class="dashboard-card" id="stats-storage">
      <h3>💾 ข้อมูลที่บันทึก</h3>
      <div class="stats-detail">
        <span>ระดับ: <strong>${u.level}</strong></span>
        <span>Battle: <strong>${(StatsStore.get().battle?.wins || 0)}W / ${(StatsStore.get().battle?.losses || 0)}L</strong></span>
        <span>Rank: <strong>${RankSystem.getRank(StatsStore.get().battle?.rankPoints || 0).label}</strong></span>
      </div>
      <div class="stats-actions">
        <button class="btn btn-outline btn-sm" id="export-stats">Export JSON</button>
        <button class="btn btn-outline btn-sm" id="import-stats">Import JSON</button>
        <input type="file" id="import-file" accept=".json" hidden />
        <button class="btn btn-outline btn-sm stats-reset" id="reset-stats">รีเซ็ต</button>
      </div>
    </div>
  `;
}

function initLevelTabs() { /* handled in render */ }

function initDataTabs() {
  document.querySelectorAll('.ldata-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeDataTab = tab.dataset.ldata;
      document.querySelectorAll('.ldata-tab').forEach(t => t.classList.toggle('active', t.dataset.ldata === activeDataTab));
      document.querySelectorAll('.level-data-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`ldata-${activeDataTab}`)?.classList.add('active');
    });
  });
}

function initVocabFilter() {
  document.getElementById('vocab-search')?.addEventListener('input', updateVocabTable);
  document.getElementById('vocab-level-filter')?.addEventListener('change', updateVocabTable);
  document.getElementById('vocab-clear')?.addEventListener('click', () => {
    const search = document.getElementById('vocab-search');
    const level = document.getElementById('vocab-level-filter');
    if (search) search.value = '';
    if (level) level.value = '';
    updateVocabTable();
    search?.focus();
  });
}

function initNavigation() {
  const current = PAGE;
  document.querySelectorAll('.nav-links a[data-page]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === current);
  });
}

function initChatbot() {
  const fab = document.getElementById('chat-fab');
  const widget = document.getElementById('chatbot');
  const closeBtn = document.getElementById('close-chatbot');
  const openFooter = document.getElementById('open-chatbot-footer');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const messages = document.getElementById('chat-messages');

  if (messages) {
    messages.innerHTML = DATA.chatbot.greetings.map(g =>
      `<div class="chat-msg bot"><p>${escapeHtml(g)}</p></div>`
    ).join('');
  }

  const open = () => { widget?.classList.remove('hidden'); fab?.classList.add('hidden'); input?.focus(); };
  const close = () => { widget?.classList.add('hidden'); fab?.classList.remove('hidden'); };

  fab?.addEventListener('click', open);
  openFooter?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);

  function reply(text) {
    const lower = text.toLowerCase();
    for (const r of DATA.chatbot.responses) {
      if (r.keywords.some(k => lower.includes(k.toLowerCase()))) return r.reply;
    }
    return DATA.chatbot.defaultReplies[Math.floor(Math.random() * DATA.chatbot.defaultReplies.length)];
  }

  function send() {
    const text = input?.value.trim();
    if (!text || !messages) return;
    messages.innerHTML += `<div class="chat-msg user"><p>${escapeHtml(text)}</p></div>`;
    input.value = '';
    messages.scrollTop = messages.scrollHeight;
    StatsStore.record('chat');
    refreshUI();
    setTimeout(() => {
      messages.innerHTML += `<div class="chat-msg bot"><p>${escapeHtml(reply(text))}</p></div>`;
      messages.scrollTop = messages.scrollHeight;
    }, 500);
  }

  sendBtn?.addEventListener('click', send);
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
}

let placementIndex = 0;
let placementAnswers = [];

function initModal() {
  const modal = document.getElementById('placement-modal');

  function renderQ() {
    const q = DATA.placementTest.questions[placementIndex];
    const total = DATA.placementTest.totalQuestions;
    const body = document.getElementById('placement-body');
    if (!body || !q) return;

    body.innerHTML = `
      <p><strong>คำถาม ${placementIndex + 1}/${total}</strong></p>
      <p class="placement-q">${escapeHtml(q.q)}</p>
      <div class="quiz-options vertical">
        ${q.options.map((o, i) => `<button class="quiz-option placement-opt" data-i="${i}">${escapeHtml(o)}</button>`).join('')}
      </div>
    `;

    document.getElementById('placement-bar').style.width = `${((placementIndex + 1) / total) * 100}%`;
    document.getElementById('placement-label').textContent = `${placementIndex + 1} / ${total}`;

    body.querySelectorAll('.placement-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        placementAnswers[placementIndex] = Number(btn.dataset.i);
        if (placementIndex < total - 1) {
          placementIndex++;
          renderQ();
        } else {
          showResult(body);
        }
      });
    });
  }

  function showResult(body) {
    let correct = 0;
    DATA.placementTest.questions.forEach((q, i) => {
      if (placementAnswers[i] === q.answer) correct++;
    });
    const pct = Math.round(correct / DATA.placementTest.totalQuestions * 100);
    const level = pct >= 90 ? 'C1' : pct >= 75 ? 'B2' : pct >= 60 ? 'B1' : pct >= 40 ? 'A2' : 'A1';

    body.innerHTML = `
      <h3>ผลการทดสอบ</h3>
      <p>ตอบถูก <strong>${correct}/30</strong> (${pct}%)</p>
      <p>ระดับที่แนะนำ: <strong class="highlight">${level}</strong></p>
      <button class="btn btn-primary btn-sm" data-close-modal>ปิด</button>
    `;
    DATA.currentLevel = level;
    activeLevel = level;
    StatsStore.record('placement', { level });
    renderAll();
  }

  document.querySelectorAll('[data-action="placement-test"]').forEach(btn => {
    btn.addEventListener('click', () => {
      placementIndex = 0;
      placementAnswers = [];
      modal?.classList.remove('hidden');
      renderQ();
    });
  });

  modal?.addEventListener('click', e => {
    if (e.target === modal || e.target.closest('[data-close-modal]')) modal.classList.add('hidden');
  });
}

function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  toggle?.addEventListener('click', () => navLinks?.classList.toggle('open'));
  navLinks?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));
}

function initStatsActions() {
  document.addEventListener('click', e => {
    if (e.target.id === 'export-stats') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([StatsStore.exportJSON()], { type: 'application/json' }));
      a.download = `lingualearn-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    }
    if (e.target.id === 'import-stats') document.getElementById('import-file')?.click();
    if (e.target.id === 'reset-stats' && confirm('รีเซ็ตข้อมูลทั้งหมด?')) {
      StatsStore.reset();
      renderAll();
    }
  });
  document.getElementById('import-file')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { StatsStore.importJSON(reader.result); renderAll(); alert('นำเข้าสำเร็จ'); }
      catch { alert('ไฟล์ไม่ถูกต้อง'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}

function initAuthPage() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const forgotForm = document.getElementById('forgot-form');
  const errorEl = document.getElementById('auth-error');

  const showError = msg => { if (errorEl) errorEl.textContent = msg; };
  const showOnly = form => {
    [loginForm, registerForm, forgotForm].forEach(f => f?.classList.toggle('hidden', f !== form));
    showError('');
  };

  document.getElementById('show-register')?.addEventListener('click', () => showOnly(registerForm));
  document.getElementById('show-login')?.addEventListener('click', () => showOnly(loginForm));
  document.getElementById('show-forgot')?.addEventListener('click', () => showOnly(forgotForm));
  document.getElementById('show-login-from-forgot')?.addEventListener('click', () => showOnly(loginForm));

  const setFormBusy = (form, busy) => {
    form?.querySelectorAll('button, input').forEach(el => { el.disabled = busy; });
  };

  // Clear any stale error message as soon as the person edits a field again,
  // so an old error from a previous (incomplete) attempt doesn't linger on
  // screen and look like it applies to what's currently typed.
  [loginForm, registerForm, forgotForm].forEach(form => {
    form?.addEventListener('input', () => showError(''));
  });

  loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('login-email')?.value || '';
    const password = document.getElementById('login-password')?.value || '';
    showError('');
    setFormBusy(loginForm, true);
    const res = await AuthStore.login(email, password);
    setFormBusy(loginForm, false);
    if (!res.ok) { showError(res.error); return; }
    window.location.href = 'index.html';
  });

  registerForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const displayName = document.getElementById('register-displayname')?.value || '';
    const email = document.getElementById('register-email')?.value || '';
    const password = document.getElementById('register-password')?.value || '';
    const confirm = document.getElementById('register-confirm')?.value || '';
    if (password !== confirm) { showError('รหัสผ่านไม่ตรงกัน'); return; }
    showError('');
    setFormBusy(registerForm, true);
    const res = await AuthStore.register(email, password, displayName);
    setFormBusy(registerForm, false);
    if (!res.ok) { showError(res.error); return; }
    window.location.href = 'index.html';
  });

  forgotForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('forgot-email')?.value || '';
    showError('');
    setFormBusy(forgotForm, true);
    const res = await AuthStore.forgotPassword(email);
    setFormBusy(forgotForm, false);
    if (!res.ok) { showError(res.error); return; }
    showError('ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย');
  });
}

function renderProfile() {
  const card = document.getElementById('profile-card');
  if (!card) return;
  const u = DATA.user;
  const battle = StatsStore.get().battle || {};
  const rank = RankSystem.getRank(battle.rankPoints || 0);
  const joined = new Date(u.joinDate);
  const daysSince = Math.max(0, Math.floor((Date.now() - joined.getTime()) / 86400000));
  const joinedLabel = isNaN(joined.getTime())
    ? u.joinDate
    : joined.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

  const avatarInner = u.avatarImage
    ? `<img src="${u.avatarImage}" alt="${escapeHtml(u.name)}" />`
    : escapeHtml(u.avatar);

  card.innerHTML = `
    <div class="profile-identity">
      <div class="profile-avatar-wrap">
        <div class="profile-avatar-lg" id="profile-avatar-lg">${avatarInner}</div>
        <button type="button" class="profile-avatar-edit-btn" id="profile-avatar-trigger" title="เปลี่ยนรูปโปรไฟล์">📷</button>
        <input type="file" id="profile-avatar-input" accept="image/*" class="visually-hidden" />
      </div>
      <div class="profile-identity-info">
        <h3>${escapeHtml(u.name)}</h3>
        <p class="profile-nickname">เรียกฉันว่า "${escapeHtml(u.nickname)}"</p>
        <div class="profile-badges">
          <span class="rank-tier-chip active" style="color:${rank.color};border-color:${rank.color}">${rank.icon} ${rank.labelTh}</span>
          <span class="streak-badge">🔥 ${u.streak} วัน</span>
        </div>
        <p class="profile-joined">สมาชิกตั้งแต่ ${joinedLabel} • ${daysSince} วันที่แล้ว</p>
        ${u.avatarImage ? '<button type="button" class="auth-link" id="profile-avatar-remove">ลบรูป ใช้ตัวอักษรแทน</button>' : ''}
      </div>
      <div class="profile-actions">
        <button class="btn btn-outline btn-sm" id="profile-edit-btn" type="button">✏️ แก้ไขโปรไฟล์</button>
        <button class="btn btn-outline btn-sm stats-reset" id="profile-logout-btn" type="button">🚪 ออกจากระบบ</button>
      </div>
    </div>
    <form class="profile-edit-form hidden" id="profile-edit-form">
      <label for="profile-input-name">ชื่อเต็ม</label>
      <input type="text" id="profile-input-name" value="${escapeHtml(u.name)}" maxlength="60" required />
      <label for="profile-input-nickname">ชื่อเล่น (ใช้เป็นตัวอักษรอวาตาร์ ถ้าไม่มีรูป)</label>
      <input type="text" id="profile-input-nickname" value="${escapeHtml(u.nickname)}" maxlength="20" required />
      <div class="profile-edit-actions">
        <button type="submit" class="btn btn-primary btn-sm">บันทึก</button>
        <button type="button" class="btn btn-outline btn-sm" id="profile-cancel-btn">ยกเลิก</button>
      </div>
    </form>
  `;
}

function renderProfileStats() {
  const grid = document.getElementById('profile-stats-grid');
  if (!grid) return;
  const u = DATA.user;
  const battle = StatsStore.get().battle || {};
  const spelling = StatsStore.get().spelling || { gamesPlayed: 0, totalCorrect: 0, totalWrong: 0, bestStreak: 0, bestScore: 0 };
  const rank = RankSystem.getRank(battle.rankPoints || 0);
  const weeklyPct = Math.min(100, Math.round((u.weeklyLessonsDone / u.weeklyGoalLessons) * 100));
  const spellAnswered = spelling.totalCorrect + spelling.totalWrong;
  const spellAccuracy = spellAnswered > 0 ? Math.round((spelling.totalCorrect / spellAnswered) * 100) : 0;

  grid.innerHTML = `
    <div class="dashboard-card">
      <h3>⭐ ภาพรวม</h3>
      <div class="stats-detail">
        <span>ระดับ: <strong>${u.level}</strong></span>
        <span>XP รวม: <strong>${u.xp.toLocaleString()}</strong></span>
        <span>Streak ต่อเนื่อง: <strong>${u.streak} วัน</strong></span>
        <span>คำศัพท์ที่รู้จัก: <strong>${u.vocabCount.toLocaleString()}</strong></span>
      </div>
    </div>
    <div class="dashboard-card">
      <h3>⚔️ สถิติ Word Battle</h3>
      <div class="stats-detail">
        <span>Rank: <strong>${rank.icon} ${rank.labelTh}</strong></span>
        <span>RP: <strong>${battle.rankPoints || 0}</strong></span>
        <span>สถิติ: <strong>${battle.wins || 0}W / ${battle.losses || 0}L</strong></span>
        <span>Win streak สูงสุด: <strong>${battle.bestStreak || 0}</strong></span>
      </div>
    </div>
    <div class="dashboard-card">
      <h3>✏️ สถิติ Spelling Bee</h3>
      <div class="stats-detail">
        <span>คะแนนสูงสุด: <strong>${spelling.bestScore}</strong></span>
        <span>เล่นแล้ว: <strong>${spelling.gamesPlayed} ครั้ง</strong></span>
        <span>ความแม่นยำ: <strong>${spellAccuracy}%</strong></span>
        <span>สตรีคสูงสุด: <strong>${spelling.bestStreak}</strong></span>
      </div>
    </div>
    <div class="dashboard-card">
      <h3>📚 เป้าหมายรายสัปดาห์</h3>
      <div class="goal-progress">
        <div class="goal-item">
          <div class="goal-header"><span>บทเรียนต่อสัปดาห์</span><span>${u.weeklyLessonsDone}/${u.weeklyGoalLessons}</span></div>
          <div class="progress-bar large"><span style="width:${weeklyPct}%"></span></div>
        </div>
      </div>
    </div>
  `;
}

function resizeImageToDataURL(file, size, callback) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => callback(null);
    img.src = e.target.result;
  };
  reader.onerror = () => callback(null);
  reader.readAsDataURL(file);
}

function initProfileEdit() {
  document.addEventListener('click', e => {
    if (e.target.id === 'profile-edit-btn') {
      document.getElementById('profile-edit-form')?.classList.remove('hidden');
      document.getElementById('profile-input-name')?.focus();
    }
    if (e.target.id === 'profile-cancel-btn') {
      document.getElementById('profile-edit-form')?.classList.add('hidden');
    }
    if (e.target.id === 'profile-avatar-trigger' || e.target.id === 'profile-avatar-lg') {
      document.getElementById('profile-avatar-input')?.click();
    }
    if (e.target.id === 'profile-avatar-remove') {
      StatsStore.updateProfile({ avatarImage: null });
      renderUser();
      renderProfile();
    }
    if (e.target.id === 'profile-logout-btn') {
      if (confirm('ต้องการออกจากระบบใช่ไหม?')) {
        AuthStore.logout().then(() => { window.location.href = 'login.html'; });
      }
    }
  });

  document.addEventListener('change', e => {
    if (e.target.id !== 'profile-avatar-input') return;
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) { alert('ไฟล์รูปใหญ่เกินไป (สูงสุด 8MB)'); return; }
    resizeImageToDataURL(file, 240, dataUrl => {
      if (!dataUrl) { alert('ไม่สามารถอ่านไฟล์รูปนี้ได้'); return; }
      StatsStore.updateProfile({ avatarImage: dataUrl });
      renderUser();
      renderProfile();
    });
    e.target.value = '';
  });

  document.addEventListener('submit', e => {
    if (e.target.id !== 'profile-edit-form') return;
    e.preventDefault();
    const name = document.getElementById('profile-input-name')?.value.trim();
    const nickname = document.getElementById('profile-input-nickname')?.value.trim();
    if (!name || !nickname) return;
    const u = DATA.user;
    const avatarUpdate = u.avatarImage ? {} : { avatar: nickname[0] };
    StatsStore.updateProfile({ name, nickname, ...avatarUpdate });
    renderUser();
    renderProfile();
    renderProfileStats();
  });
}

function setText(sel, text) {
  const el = document.querySelector(sel);
  if (el) el.textContent = text;
}

function setHtml(sel, html) {
  const el = document.querySelector(sel);
  if (el) el.innerHTML = html;
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}