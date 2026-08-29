function buildBattleSentences() {
  const pool = [];
  DATA.levels.forEach(lv => {
    const c = DATA.levelContent[lv];
    c.sentences?.forEach(s => pool.push({ text: s.en, level: lv, hint: s.th }));
    c.phrases?.forEach(p => pool.push({ text: p.en, level: lv, hint: p.th }));
    c.grammar?.forEach(g => g.examples.forEach(ex => {
      pool.push({ text: ex.en || ex, level: lv, hint: g.topic });
    }));
    c.dialogues?.forEach(d => d.lines.forEach(l => {
      pool.push({ text: l.en, level: lv, hint: l.th });
    }));
    c.vocabulary?.forEach(v => {
      if (v.example) pool.push({ text: v.example, level: lv, hint: v.meaning });
    });
  });
  return pool.filter(s => {
    const words = tokenize(s.text);
    return words.length >= 3 && words.length <= 12;
  });
}

function tokenize(sentence) {
  return sentence.replace(/[.,!?;:'"]/g, '').split(/\s+/).filter(Boolean);
}

function normalizeSentence(s) {
  return tokenize(s).join(' ').toLowerCase();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const WordBattle = {
  modal: null,
  canvas: null,
  sentences: [],
  state: null,
  timerId: null,

  init() {
    this.modal = document.getElementById('battle-modal');
    this.canvas = document.getElementById('battle-canvas');
    this.screen = this.modal?.querySelector('.battle-screen');
    this.sentences = buildBattleSentences();
    document.getElementById('battle-close')?.addEventListener('click', () => this.close());
    this.modal?.addEventListener('click', e => { if (e.target === this.modal) this.close(); });
    document.querySelectorAll('[data-start-battle]').forEach(btn => {
      btn.addEventListener('click', () => this.start(btn.dataset.startBattle || 'auto'));
    });
  },

  start(mode) {
    const battle = StatsStore.get().battle || {};
    const rp = battle.rankPoints || 0;
    const opponent = mode === 'auto'
      ? RankSystem.getOpponentForRP(rp)
      : DATA.battleOpponents.find(o => o.id === mode) || RankSystem.getOpponentForRP(rp);

    const playerRank = RankSystem.getRank(rp);
    const playerHP = 100;
    // Sentence difficulty must match the OPPONENT's level, not whatever
    // level page the player last happened to be browsing (DATA.currentLevel)
    // — mixing those in was letting a beginner opponent like Rookie Bot (A1)
    // hand out advanced C1/C2 sentences whenever the player had been
    // reading a higher-level page. Each level already has ~160 usable
    // sentences, so the exact-level pool alone is always enough; the
    // adjacent-level and full-pool fallbacks below only exist as a safety
    // net in case content is ever trimmed down later.
    const levelIdx = DATA.levels.indexOf(opponent.level);
    let pool = this.sentences.filter(s => s.level === opponent.level);
    if (pool.length < 8) {
      const adjacentLevels = [DATA.levels[levelIdx - 1], DATA.levels[levelIdx + 1]].filter(Boolean);
      pool = this.sentences.filter(s => s.level === opponent.level || adjacentLevels.includes(s.level));
    }
    if (pool.length < 5) pool = this.sentences;

    this.state = {
      opponent,
      playerHP,
      enemyHP: opponent.hp,
      turn: 1,
      maxTurns: 12,
      playerRank,
      enemyRank: RankSystem.getRank(opponent.rankRP),
      pool,
      used: [],
      log: [],
      timeLeft: 20,
      phase: 'player',
    };

    this.modal?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    this.nextRound();
  },

  close() {
    this.stopTimer();
    this.modal?.classList.add('hidden');
    document.body.style.overflow = '';
    if (typeof renderBattleSection === 'function') renderBattleSection();
    if (typeof refreshUI === 'function') refreshUI();
  },

  stopTimer() {
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
  },

  pickSentence() {
    const available = this.state.pool.filter(s => !this.state.used.includes(s.text));
    const list = available.length ? available : this.state.pool;
    const s = list[Math.floor(Math.random() * list.length)];
    this.state.used.push(s.text);
    this.state.current = s;
    this.state.words = shuffle(tokenize(s.text));
    this.state.answer = [];
    this.state.timeLeft = 20;
    return s;
  },

  nextRound() {
    if (this.state.playerHP <= 0 || this.state.enemyHP <= 0 || this.state.turn > this.state.maxTurns) {
      this.endBattle();
      return;
    }

    this.state.phase = 'player';
    const s = this.pickSentence();
    this.render();
    this.startTimer();

    this.log(`เทิร์น ${this.state.turn}: เรียงประโยคให้ถูกต้อง!`, 'info');
    if (s.hint) this.log(`💡 ${s.hint}`, 'hint');
  },

  startTimer() {
    this.stopTimer();
    this.timerId = setInterval(() => {
      this.state.timeLeft--;
      const el = document.getElementById('battle-timer');
      if (el) {
        el.textContent = this.state.timeLeft;
        el.classList.toggle('warn', this.state.timeLeft <= 5);
      }
      if (this.state.timeLeft <= 0) {
        this.stopTimer();
        this.onPlayerFail('หมดเวลา!');
      }
    }, 1000);
  },

  render() {
    const s = this.state;
    if (!this.canvas) return;

    this.canvas.innerHTML = `
      <div class="battle-arena">
        <div class="fighter player-side">
          <div class="fighter-avatar">${getPlayerAvatarHTML()}</div>
          <div class="fighter-info">
            <strong>${escapeHtml(DATA.user.nickname || DATA.user.name)}</strong>
            <span class="fighter-rank" style="color:${s.playerRank.color}">${s.playerRank.icon} ${s.playerRank.label}</span>
            <div class="hp-bar"><div class="hp-fill player-hp" style="width:${s.playerHP}%"></div></div>
            <span class="hp-text">${s.playerHP} HP</span>
          </div>
        </div>
        <div class="battle-vs">
          <span class="turn-badge">เทิร์น ${s.turn}</span>
          <span class="vs-text">⚔️ VS ⚔️</span>
          <span class="timer-badge" id="battle-timer">${s.timeLeft}</span>
        </div>
        <div class="fighter enemy-side">
          <div class="fighter-info align-right">
            <strong>${escapeHtml(s.opponent.name)}</strong>
            <span class="fighter-rank" style="color:${s.enemyRank.color}">${s.enemyRank.icon} ${s.enemyRank.label}</span>
            <div class="hp-bar"><div class="hp-fill enemy-hp" style="width:${s.enemyHP}%"></div></div>
            <span class="hp-text">${s.enemyHP} HP</span>
          </div>
          <div class="fighter-avatar">${avatarHTML(s.opponent)}</div>
        </div>
      </div>

      <div class="battle-puzzle">
        <p class="puzzle-label">เรียงคำให้เป็นประโยคที่ถูกต้อง แล้วกดโจมตี!</p>
        <div class="answer-zone" id="answer-zone">
          ${s.answer.length ? s.answer.map((a, i) =>
            `<button class="word-chip in-answer" data-idx="${i}">${escapeHtml(a.word)}</button>`
          ).join('') : '<span class="answer-placeholder">คลิกคำด้านล่างเพื่อเรียง...</span>'}
        </div>
        <div class="word-bank" id="word-bank-real">
          ${getAvailableWords(s).map(item =>
            `<button class="word-chip in-bank" data-word="${escapeHtml(item.word)}" data-id="${item.id}">${escapeHtml(item.word)}</button>`
          ).join('') || '<span class="answer-placeholder">คำครบแล้ว — กดโจมตี!</span>'}
        </div>
        <div class="battle-actions">
          <button class="btn btn-outline btn-sm" id="battle-reset">รีเซ็ต</button>
          <button class="btn btn-primary" id="battle-attack">⚔️ โจมตี!</button>
        </div>
      </div>

      <div class="battle-log" id="battle-log">
        ${s.log.slice(-6).map(l => `<div class="log-line ${l.type}">${escapeHtml(l.text)}</div>`).join('')}
      </div>
    `;

    this.bindPuzzleEvents();
  },

  bindPuzzleEvents() {
    document.getElementById('word-bank-real')?.querySelectorAll('.word-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (this.state.phase !== 'player') return;
        const word = chip.dataset.word;
        const id = chip.dataset.id;
        if (!this.state.answer.find(a => a.id === id)) {
          this.state.answer.push({ word, id });
          this.render();
        }
      });
    });

    document.getElementById('answer-zone')?.querySelectorAll('.word-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (this.state.phase !== 'player') return;
        const idx = Number(chip.dataset.idx);
        this.state.answer.splice(idx, 1);
        this.render();
      });
    });

    document.getElementById('battle-reset')?.addEventListener('click', () => {
      this.state.answer = [];
      this.render();
    });

    document.getElementById('battle-attack')?.addEventListener('click', () => this.submitAttack());
  },

  submitAttack() {
    if (this.state.phase !== 'player') return;
    const playerStr = normalizeSentence(this.state.answer.map(a => a.word).join(' '));
    const correctStr = normalizeSentence(this.state.current.text);

    if (playerStr === correctStr) {
      const bonus = Math.floor(this.state.timeLeft / 2);
      const dmg = 15 + bonus;
      this.state.enemyHP = Math.max(0, this.state.enemyHP - dmg);
      this.stopTimer();
      this.log(`✓ ถูกต้อง! โจมตี ${dmg} damage`, 'good');
      this.flash('enemy');
      this.popup('✓ ถูกต้อง!', `โจมตี -${dmg} HP`, 'hit');
      setTimeout(() => this.afterPlayerTurn(true), 1500);
    } else {
      this.onPlayerFail('ผิด!');
    }
  },

  onPlayerFail(reason) {
    this.stopTimer();
    const correctText = this.state.current.text;
    this.log(`✗ ${reason} คำตอบ: "${correctText}"`, 'bad');
    this.flash('player');
    this.popup(`✗ ${reason}`, 'พลาดจังหวะโจมตี!', 'miss', `เฉลย: "${correctText}"`);
    setTimeout(() => this.afterPlayerTurn(false), 2800);
  },

  afterPlayerTurn(success) {
    if (this.state.enemyHP <= 0 || this.state.playerHP <= 0) {
      this.endBattle();
      return;
    }

    this.state.phase = 'enemy';
    this.renderEnemyTurn(success);
  },

  renderEnemyTurn(playerSucceeded) {
    const s = this.state;
    const enemySentence = this.pickSentence();
    const enemySuccess = Math.random() < s.opponent.accuracy;

    this.canvas.innerHTML = `
      <div class="battle-arena compact">
        <div class="fighter player-side mini">
          <span>${getPlayerAvatarHTML()} ${s.playerHP} HP</span>
        </div>
        <div class="battle-vs"><span>เทิร์น ${s.turn} — ตาคู่ต่อสู้</span></div>
        <div class="fighter enemy-side mini">
          <span>${avatarHTML(s.opponent)} ${s.enemyHP} HP</span>
        </div>
      </div>
      <div class="enemy-turn-panel">
        <p class="enemy-thinking">${avatarHTML(s.opponent)} ${escapeHtml(s.opponent.name)} กำลังเรียงคำ...</p>
        <div class="enemy-sentence">${shuffle(tokenize(enemySentence.text)).map(w =>
          `<span class="word-chip static">${escapeHtml(w)}</span>`
        ).join('')}</div>
        <p class="enemy-hint">${enemySentence.hint ? '💡 ' + escapeHtml(enemySentence.hint) : ''}</p>
      </div>
      <div class="battle-log" id="battle-log">
        ${s.log.slice(-4).map(l => `<div class="log-line ${l.type}">${escapeHtml(l.text)}</div>`).join('')}
      </div>
    `;

    setTimeout(() => {
      const enemyAnswer = `เฉลย: "${enemySentence.text}"`;
      if (enemySuccess && !playerSucceeded) {
        const dmg = s.opponent.damage + Math.floor(Math.random() * 8);
        s.playerHP = Math.max(0, s.playerHP - dmg);
        this.log(`${s.opponent.name} เรียงถูก! โต้กลับ ${dmg} damage`, 'enemy');
        this.popup('โดนโจมตี!', `-${dmg} HP`, 'enemy-hit', enemyAnswer);
      } else if (enemySuccess) {
        this.log(`${s.opponent.name} เรียงถูก แต่คุณรับมือได้!`, 'info');
        this.popup('ป้องกันสำเร็จ!', '', 'enemy-block', enemyAnswer);
      } else {
        this.log(`${s.opponent.name} เรียงผิด! คุณไม่โดนโจมตีเลย`, 'good');
        this.popup('รอดแล้ว!', '', 'enemy-miss', enemyAnswer);
      }

      s.turn++;
      setTimeout(() => {
        if (s.playerHP <= 0 || s.enemyHP <= 0 || s.turn > s.maxTurns) {
          this.endBattle();
        } else {
          this.nextRound();
        }
      }, 2900);
    }, 1800);
  },

  endBattle() {
    this.stopTimer();
    const s = this.state;
    const win = s.enemyHP <= 0 && s.playerHP > 0;
    const draw = s.playerHP <= 0 && s.enemyHP <= 0;
    const result = StatsStore.recordBattle(win && !draw, s);

    const pr = RankSystem.getRank(result.rankPoints);

    this.canvas.innerHTML = `
      <div class="battle-result">
        <div class="result-banner ${win ? 'win' : 'lose'}">${win ? '🏆 ชนะ!' : draw ? '🤝 เสมอ' : '💀 แพ้'}</div>
        <p>vs ${escapeHtml(s.opponent.name)} ${avatarHTML(s.opponent)}</p>
        <div class="result-rp ${result.rpChange >= 0 ? 'up' : 'down'}">
          ${result.rpChange >= 0 ? '+' : ''}${result.rpChange} RP
        </div>
        <div class="result-rank" style="color:${pr.color}">
          ${pr.icon} ${pr.labelTh} (${pr.rp} RP)
        </div>
        <p class="result-record">ชนะ ${result.wins} | แพ้ ${result.losses} | สถิติต่อเนื่อง ${result.streak}</p>
        <div class="result-actions">
          <button class="btn btn-primary" id="battle-again">⚔️ ต่อสู้อีกครั้ง</button>
          <button class="btn btn-outline" id="battle-done">กลับ Arena</button>
        </div>
      </div>
    `;
    document.getElementById('battle-again')?.addEventListener('click', () => this.start('auto'));
    document.getElementById('battle-done')?.addEventListener('click', () => this.close());
  },

  log(text, type = 'info') {
    this.state.log.push({ text, type });
  },

  popup(title, sub, type, detail) {
    // Don't depend on this.screen having been captured correctly at init time —
    // re-resolve it here too, and fall back further if needed, so the popup can
    // never silently fail to show just because of a stale reference.
    const screen = this.screen || this.modal?.querySelector('.battle-screen') || document.querySelector('.battle-screen') || this.modal;
    if (!screen) return;

    screen.querySelectorAll('.battle-popup').forEach(el => el.remove());

    const colors = {
      hit: '#10b981',
      miss: '#ef4444',
      'enemy-hit': '#ef4444',
      'enemy-block': '#3b82f6',
      'enemy-miss': '#3b82f6',
    };
    const color = colors[type] || '#e8eaed';

    // Make sure the popup's positioning is anchored to this container even if
    // the stylesheet hasn't set position:relative on it for some reason.
    const computedPos = window.getComputedStyle(screen).position;
    if (computedPos === 'static') screen.style.position = 'relative';

    const el = document.createElement('div');
    el.className = `battle-popup ${type}${detail ? ' has-detail' : ''}`;
    el.style.cssText = `
      position: absolute; top: 50%; left: 50%;
      z-index: 999; text-align: center; min-width: 180px; max-width: min(90%, 420px);
      padding: 0.9rem 1.75rem; border-radius: 20px;
      background: rgba(15, 17, 23, 0.96); border: 2px solid ${color};
      box-shadow: 0 12px 40px rgba(0,0,0,0.6);
      font-family: inherit; cursor: pointer;
      opacity: 0; transform: translate(-50%, -50%) scale(0.6);
      transition: opacity 0.22s ease, transform 0.22s cubic-bezier(.34,1.56,.64,1);
    `;
    el.innerHTML = `
      <span style="display:block;font-size:1.5rem;font-weight:800;letter-spacing:.03em;color:${color}">${escapeHtml(title)}</span>
      ${sub ? `<span style="display:block;margin-top:.15rem;font-size:1rem;font-weight:600;color:#e8eaed;opacity:.9">${escapeHtml(sub)}</span>` : ''}
      ${detail ? `<span style="display:block;margin-top:.5rem;padding-top:.5rem;border-top:1px solid rgba(255,255,255,.15);font-size:.85rem;font-weight:500;color:#9aa0b0;line-height:1.4">${escapeHtml(detail)}</span>` : ''}
    `;
    screen.appendChild(el);

    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    const life = detail ? 2600 : 1400;
    const hide = () => {
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%, -50%) scale(0.92) translateY(-10px)';
      setTimeout(() => el.remove(), 220);
    };
    const timer = setTimeout(hide, life);
    el.addEventListener('click', () => { clearTimeout(timer); hide(); });
  },

  flash(target) {
    const el = this.canvas?.querySelector(target === 'enemy' ? '.enemy-side' : '.player-side');
    el?.classList.add('hit-flash');
    setTimeout(() => el?.classList.remove('hit-flash'), 500);
  },
};

function getAvailableWords(state) {
  const allWords = state.words.map((w, i) => ({ word: w, id: `${w}-${i}` }));
  const usedIds = new Set(state.answer.map(a => a.id));
  return allWords.filter(w => !usedIds.has(w.id));
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

const SLIME_SVG = `<svg class="avatar-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="slimeGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6ee7b7"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
  </defs>
  <path d="M24 6c9 0 16 7.5 16 16.5 0 3-1 5-2.4 6.7 1 .9 1.6 2 1.2 3.2-.5 1.6-2.4 2.1-3.8 1.1-1.7 1.3-3.9 2-6.3 2.2.2 1-.6 2-1.7 2s-1.9-1-1.7-2c-1 .1-2 .1-3 0 .2 1-.6 2-1.7 2s-1.9-1-1.7-2c-2.3-.3-4.4-1-6.1-2.2-1.4 1-3.3.5-3.8-1.1-.4-1.2.2-2.3 1.2-3.2C9 27.5 8 25.5 8 22.5 8 13.5 15 6 24 6z" fill="url(#slimeGrad)" stroke="#059669" stroke-width="1.4" stroke-linejoin="round"/>
  <ellipse cx="16.5" cy="10.5" rx="4" ry="2.6" fill="#ffffff" opacity="0.35" transform="rotate(-18 16.5 10.5)"/>
  <circle cx="18" cy="21" r="2.2" fill="#0f1117"/>
  <circle cx="30" cy="21" r="2.2" fill="#0f1117"/>
  <path d="M17 27c2 2 6 2 8 0" stroke="#0f1117" stroke-width="1.6" stroke-linecap="round" fill="none"/>
</svg>`;

function avatarHTML(entity) {
  const avatar = (entity && entity.avatar) || '';
  if (avatar.trim().startsWith('<')) return avatar; // custom raw HTML (e.g. <img> tag) — use as-is
  if (entity && entity.avatarType === 'slime') return SLIME_SVG;
  return escapeHtml(avatar);
}