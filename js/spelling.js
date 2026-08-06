function shuffleSpelling(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function blankOutWord(example, word) {
  if (!example) return '';
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'i');
  const blank = '_'.repeat(Math.max(3, word.length));
  return re.test(example) ? example.replace(re, blank) : example;
}

function buildSpellingPool(levelFilter) {
  const all = getAllVocabFlat();
  const filtered = levelFilter && levelFilter !== 'all' ? all.filter(v => v.level === levelFilter) : all;
  const seen = new Set();
  const unique = [];
  filtered.forEach(v => {
    const key = v.word.toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(v); }
  });
  return unique;
}

const SpellingGame = {
  modal: null,
  canvas: null,
  state: null,

  init() {
    this.modal = document.getElementById('spelling-modal');
    this.canvas = document.getElementById('spelling-canvas');
    document.getElementById('spelling-close')?.addEventListener('click', () => this.close());
    this.modal?.addEventListener('click', e => { if (e.target === this.modal) this.close(); });
    document.addEventListener('click', e => {
      if (e.target.matches('[data-start-spelling]')) this.start(e.target.dataset.startSpelling || 'all');
      if (e.target.id === 'spelling-submit') this.submit();
      if (e.target.id === 'spelling-hint') this.giveHint();
      if (e.target.id === 'spelling-next') this.nextQuestion();
      if (e.target.id === 'spelling-play-again') this.start(this.state?.levelFilter || 'all');
      if (e.target.id === 'spelling-finish-close') this.close();
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (document.activeElement?.id !== 'spelling-input') return;
      e.preventDefault();
      const btn = document.getElementById('spelling-submit');
      if (btn && !btn.disabled) this.submit();
      else document.getElementById('spelling-next')?.click();
    });
  },

  start(levelFilter) {
    const pool = shuffleSpelling(buildSpellingPool(levelFilter));
    const questions = pool.slice(0, Math.min(10, pool.length));

    if (questions.length < 3) {
      alert('คำศัพท์ในระดับนี้มีน้อยเกินไปสำหรับเล่นเกม ลองเลือก "ทุกระดับ" แทนครับ');
      return;
    }

    this.state = {
      levelFilter,
      questions,
      index: 0,
      score: 0,
      correct: 0,
      wrong: 0,
      streak: 0,
      bestStreakThisRound: 0,
      hintsUsedThisQ: 0,
      revealed: '',
      answered: false,
    };

    this.modal?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    this.renderQuestion();
  },

  close() {
    this.modal?.classList.add('hidden');
    document.body.style.overflow = '';
    if (typeof renderSpellingSection === 'function') renderSpellingSection();
    if (typeof refreshUI === 'function') refreshUI();
  },

  currentWord() {
    return this.state.questions[this.state.index];
  },

  renderQuestion() {
    const s = this.state;
    const q = this.currentWord();
    const total = s.questions.length;
    const blanked = blankOutWord(q.example, q.word);

    this.canvas.innerHTML = `
      <div class="spelling-progress">
        <span>ข้อที่ ${s.index + 1} / ${total}</span>
        <span class="spelling-score">คะแนน: ${s.score}</span>
      </div>
      <div class="spelling-card">
        <p class="spelling-level-tag">${q.level}</p>
        <p class="spelling-meaning">${escapeHtml(q.meaning)}</p>
        <p class="spelling-example">${escapeHtml(blanked)}</p>
        <div class="spelling-input-row">
          <input type="text" id="spelling-input" class="spelling-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="พิมพ์คำศัพท์ภาษาอังกฤษ..." />
          <button class="btn btn-primary" id="spelling-submit">ตรวจคำตอบ</button>
        </div>
        <div class="spelling-actions-row">
          <button class="btn btn-outline btn-sm" id="spelling-hint">💡 คำใบ้ (${q.word.length - s.revealed.length} ตัวเหลือ)</button>
          <span class="spelling-streak">🔥 สตรีค: ${s.streak}</span>
        </div>
        <div class="spelling-feedback" id="spelling-feedback"></div>
      </div>
    `;
    document.getElementById('spelling-input')?.focus();
  },

  giveHint() {
    const s = this.state;
    if (s.answered) return;
    const q = this.currentWord();
    if (s.revealed.length >= q.word.length - 1) return;
    s.revealed = q.word.slice(0, s.revealed.length + 1);
    s.hintsUsedThisQ += 1;
    const input = document.getElementById('spelling-input');
    if (input) { input.value = s.revealed; input.focus(); }
    this.renderQuestion();
    const input2 = document.getElementById('spelling-input');
    if (input2) { input2.value = s.revealed; input2.setSelectionRange(input2.value.length, input2.value.length); }
  },

  submit() {
    const s = this.state;
    if (s.answered) return;
    const q = this.currentWord();
    const input = document.getElementById('spelling-input');
    const given = (input?.value || '').trim().toLowerCase();
    const correctWord = q.word.toLowerCase();
    const isCorrect = given === correctWord;

    s.answered = true;
    const feedback = document.getElementById('spelling-feedback');
    const submitBtn = document.getElementById('spelling-submit');
    if (submitBtn) submitBtn.disabled = true;

    if (isCorrect) {
      const points = Math.max(4, 10 - s.hintsUsedThisQ * 2);
      s.score += points;
      s.correct += 1;
      s.streak += 1;
      s.bestStreakThisRound = Math.max(s.bestStreakThisRound, s.streak);
      if (feedback) {
        feedback.innerHTML = `<p class="spelling-fb good">✅ ถูกต้อง! +${points} คะแนน</p>`;
      }
    } else {
      s.wrong += 1;
      s.streak = 0;
      if (feedback) {
        feedback.innerHTML = `<p class="spelling-fb bad">❌ ยังไม่ถูก คำที่ถูกต้องคือ: <strong>${escapeHtml(q.word)}</strong></p>`;
      }
    }

    const isLast = s.index >= s.questions.length - 1;
    if (feedback) {
      feedback.innerHTML += `<button class="btn btn-primary btn-sm" id="spelling-next">${isLast ? 'ดูผลสรุป' : 'ข้อถัดไป →'}</button>`;
    }
    document.getElementById('spelling-hint')?.setAttribute('disabled', 'true');
  },

  nextQuestion() {
    const s = this.state;
    if (s.index >= s.questions.length - 1) {
      this.finish();
      return;
    }
    s.index += 1;
    s.hintsUsedThisQ = 0;
    s.revealed = '';
    s.answered = false;
    this.renderQuestion();
  },

  finish() {
    const s = this.state;
    const result = StatsStore.recordSpelling({
      correct: s.correct,
      wrong: s.wrong,
      score: s.score,
      bestStreakThisRound: s.bestStreakThisRound,
    });

    this.canvas.innerHTML = `
      <div class="spelling-result">
        <p class="spelling-result-banner">🎉 จบเกมแล้ว!</p>
        <p class="spelling-result-score">${s.score} คะแนน</p>
        <p class="spelling-result-detail">ถูก ${s.correct} / ${s.questions.length} ข้อ • สตรีคสูงสุด ${s.bestStreakThisRound}</p>
        <p class="spelling-result-xp">+${result.xpGain} XP</p>
        <div class="spelling-result-actions">
          <button class="btn btn-primary" id="spelling-play-again">🔄 เล่นอีกครั้ง</button>
          <button class="btn btn-outline" id="spelling-finish-close">ปิด</button>
        </div>
      </div>
    `;
    if (typeof refreshUI === 'function') refreshUI();
  },
};
