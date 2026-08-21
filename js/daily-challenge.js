/* ===== Daily Challenge =====
 * A short (5-question) multiple-choice vocab quiz that's the same for
 * everyone on a given calendar day (seeded by date + level), refreshes
 * automatically the next day, and can only be completed once per day.
 * Rewards ride on top of the existing daily-activity streak — see
 * StatsStore.recordDailyChallenge().
 */
const DailyChallenge = {
  QUESTION_COUNT: 5,
  _questions: [],
  _index: 0,
  _correct: 0,
  _answered: false,

  _todayKey() {
    return new Date().toISOString().slice(0, 10);
  },

  // Small deterministic string hash (FNV-1a) → seed for the RNG below, so
  // "today" always produces the exact same 5 questions on every reload,
  // but a new day (or a different current level) produces a new set.
  _hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  },

  // mulberry32 — tiny seeded PRNG, good enough for shuffling quiz options.
  _rng(seed) {
    let s = seed;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  _shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  },

  // Word pool for today's questions: mainly the learner's current level,
  // topped up with other levels if that level doesn't have enough words
  // for 5 questions + distractors.
  _buildPool(level) {
    let pool = (DATA.levelContent[level]?.vocabulary || []).map(v => ({ ...v, level }));
    if (pool.length < 10) {
      DATA.levels.forEach(lv => {
        if (lv === level) return;
        pool = pool.concat((DATA.levelContent[lv]?.vocabulary || []).map(v => ({ ...v, level: lv })));
      });
    }
    return pool;
  },

  _generate() {
    const level = DATA.currentLevel || DATA.levels[0];
    const seed = this._hashSeed(`${this._todayKey()}::${level}`);
    const rng = this._rng(seed);
    const pool = this._buildPool(level);
    const picks = this._shuffle(pool, rng).slice(0, Math.min(this.QUESTION_COUNT, pool.length));

    this._questions = picks.map(word => {
      const distractorPool = pool.filter(w => w.word !== word.word);
      const distractors = this._shuffle(distractorPool, rng).slice(0, 3).map(w => w.meaning);
      const options = this._shuffle([word.meaning, ...distractors], rng);
      return {
        word: word.word,
        phonetic: word.phonetic || '',
        example: word.example || '',
        options,
        answer: options.indexOf(word.meaning),
      };
    });
  },

  isDoneToday() {
    return typeof StatsStore !== 'undefined' && StatsStore.isDailyChallengeDoneToday();
  },

  _modal() { return document.getElementById('daily-challenge-modal'); },
  _body() { return document.getElementById('challenge-body'); },

  open() {
    const modal = this._modal();
    if (!modal) return;
    modal.classList.remove('hidden');

    if (this.isDoneToday()) {
      this._renderAlreadyDone();
      return;
    }

    this._generate();
    this._index = 0;
    this._correct = 0;
    this._answered = false;
    this._renderQuestion();
  },

  close() {
    this._modal()?.classList.add('hidden');
  },

  _setProgress() {
    const total = this._questions.length;
    const bar = document.getElementById('challenge-bar');
    const label = document.getElementById('challenge-label');
    const wrap = document.getElementById('challenge-progress-wrap');
    if (wrap) wrap.style.visibility = 'visible';
    if (bar) bar.style.width = `${((this._index + 1) / total) * 100}%`;
    if (label) label.textContent = `${this._index + 1} / ${total}`;
  },

  _renderQuestion() {
    const body = this._body();
    const q = this._questions[this._index];
    if (!body || !q) return;
    this._answered = false;

    this._setProgress();

    body.innerHTML = `
      <p class="challenge-word">${this._escapeHtml(q.word)}</p>
      ${q.phonetic ? `<p class="challenge-phonetic">${this._escapeHtml(q.phonetic)}</p>` : ''}
      <p class="placement-q">คำนี้แปลว่าอะไร?</p>
      <div class="quiz-options vertical">
        ${q.options.map((o, i) => `<button class="quiz-option challenge-opt" data-i="${i}">${this._escapeHtml(o)}</button>`).join('')}
      </div>
      <p class="challenge-feedback" id="challenge-feedback"></p>
    `;

    body.querySelectorAll('.challenge-opt').forEach(btn => {
      btn.addEventListener('click', () => this._handleAnswer(Number(btn.dataset.i)));
    });
  },

  _handleAnswer(choice) {
    if (this._answered) return;
    this._answered = true;

    const body = this._body();
    const q = this._questions[this._index];
    const correct = choice === q.answer;
    if (correct) this._correct++;

    body.querySelectorAll('.challenge-opt').forEach((btn, i) => {
      btn.classList.toggle('correct-answer', i === q.answer);
      if (i === choice && !correct) btn.classList.add('selected');
    });

    const fb = document.getElementById('challenge-feedback');
    if (fb) {
      fb.textContent = correct
        ? '✅ ถูกต้อง!'
        : `❌ คำตอบที่ถูกคือ "${q.options[q.answer]}"${q.example ? ` — ${q.example}` : ''}`;
      fb.className = `challenge-feedback ${correct ? 'good' : 'bad'}`;
    }

    setTimeout(() => {
      if (this._index < this._questions.length - 1) {
        this._index++;
        this._renderQuestion();
      } else {
        this._finish();
      }
    }, correct ? 700 : 1600);
  },

  _finish() {
    const result = StatsStore.recordDailyChallenge({ correct: this._correct, total: this._questions.length });
    const wrap = document.getElementById('challenge-progress-wrap');
    if (wrap) wrap.style.visibility = 'hidden';

    const body = this._body();
    if (!body) return;

    body.innerHTML = `
      <div class="challenge-result">
        <p class="challenge-result-score">${this._correct}/${this._questions.length}</p>
        <p class="challenge-result-detail">ตอบถูก ${this._correct} จาก ${this._questions.length} ข้อ</p>
        <div class="challenge-xp-breakdown">
          <span>+${this._correct * 8} XP จากคำตอบ</span>
          ${result.streakBonus ? `<span>+${result.streakBonus} XP โบนัสสตรีค 🔥 ${result.streak} วัน</span>` : ''}
          ${result.perfectBonus ? `<span>+${result.perfectBonus} XP ตอบถูกครบทุกข้อ! 🌟</span>` : ''}
        </div>
        <p class="challenge-result-total">รวม +${result.xpGain} XP</p>
        <p class="challenge-come-back">มาทำโจทย์ใหม่ได้อีกครั้งพรุ่งนี้นะ 👋</p>
        <button class="btn btn-primary btn-sm" data-close-modal>ปิด</button>
      </div>
    `;

    if (typeof renderAll === 'function') renderAll();
    this._updateDot();
  },

  _renderAlreadyDone() {
    const wrap = document.getElementById('challenge-progress-wrap');
    if (wrap) wrap.style.visibility = 'hidden';
    const body = this._body();
    if (!body) return;
    const dc = StatsStore.get().dailyChallenge || {};
    body.innerHTML = `
      <div class="challenge-result">
        <p class="challenge-result-score">✅</p>
        <p class="challenge-result-detail">ทำโจทย์ประจำวันนี้ไปแล้ว — ได้ +${dc.lastXpGain || 0} XP</p>
        <p class="challenge-come-back">มาทำโจทย์ใหม่ได้อีกครั้งพรุ่งนี้นะ 👋</p>
        <button class="btn btn-primary btn-sm" data-close-modal>ปิด</button>
      </div>
    `;
  },

  _updateDot() {
    const done = this.isDoneToday();
    document.querySelectorAll('.challenge-dot').forEach(dot => {
      dot.classList.toggle('hidden', done);
    });
    // The floating popup trigger hides itself entirely once today's
    // challenge is finished — it has nothing left to prompt.
    const fab = document.getElementById('daily-challenge-fab');
    if (fab) fab.classList.toggle('hidden', done);
  },

  init() {
    if (!this._modal()) return;

    document.querySelectorAll('[data-action="daily-challenge"]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        this.open();
      });
    });

    this._modal().addEventListener('click', e => {
      if (e.target === this._modal() || e.target.closest('[data-close-modal]')) this.close();
    });

    this._updateDot();
  },
};

document.addEventListener('DOMContentLoaded', () => {
  // Runs after app.js's own DOMContentLoaded listener (script tag order),
  // by which point StatsStore.init() has already run — safe to read
  // isDoneToday() / DATA.currentLevel here.
  if (document.body?.dataset.page === 'login') return;
  DailyChallenge.init();
});
