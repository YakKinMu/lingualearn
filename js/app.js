let activeLevel = DATA.currentLevel;
let activeDataTab = 'grammar';
const PAGE = document.body?.dataset.page || 'levels';

document.addEventListener('DOMContentLoaded', () => {
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
  if (PAGE === 'progress') {
    renderProgress();
    initStatsActions();
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
  if (PAGE === 'progress') renderProgress();
}

function refreshUI() {
  renderUser();
  if (PAGE === 'levels') renderLevelTabs();
  if (PAGE === 'battle') renderBattleSection();
  if (PAGE === 'progress') renderProgress();
}

function renderUser() {
  const u = DATA.user;
  const battle = StatsStore.get().battle || {};
  const rank = RankSystem.getRank(battle.rankPoints || 0);
  setText('.streak-badge', `🔥 ${u.streak} วัน`);
  setText('.user-avatar', u.avatar);
  setText('#nav-level', `${rank.icon} ${rank.label}`);
  setHtml('#hero-stats', `
    <div class="stat-card"><span class="stat-value">${rank.icon}</span><span class="stat-label">${rank.label}</span></div>
    <div class="stat-card"><span class="stat-value">${battle.rankPoints || 0}</span><span class="stat-label">Rank Points</span></div>
    <div class="stat-card"><span class="stat-value">${battle.wins || 0}</span><span class="stat-label">ชนะ ${battle.losses || 0} แพ้</span></div>
  `);
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

  const allPlayers = [
    ...DATA.rankLeaderboard.map(p => ({ ...p, isYou: false })),
    { name: DATA.user.name, avatar: DATA.user.avatar, rankRP: battle.rankPoints, wins: battle.wins, isYou: true },
  ].sort((a, b) => b.rankRP - a.rankRP);

  const lbHtml = allPlayers.map((p, i) => {
    const pr = RankSystem.getRank(p.rankRP);
    const cls = p.isYou ? 'you' : i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
    return `
      <div class="rank-lb-row ${cls}">
        <span class="lb-pos">${i + 1}</span>
        <span>${p.avatar}</span>
        <span>${escapeHtml(p.name)}${p.isYou ? ' (คุณ)' : ''}</span>
        <span>${pr.icon}</span>
        <span class="lb-rp">${p.rankRP} RP</span>
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
        ${lbHtml}
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