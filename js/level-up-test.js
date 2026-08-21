/* ===== Level-Up Test =====
 * A 10-question exam covering the learner's CURRENT CEFR level (4 grammar
 * questions + 6 vocabulary questions). Passing (>=80%) advances
 * DATA.currentLevel to the next step; failing just records the attempt.
 * Unlike the Daily Challenge, questions are freshly randomized every time
 * this is opened (it's a real re-takeable exam, not a once-a-day thing).
 */
const LevelUpTest = {
  PASS_RATIO: 0.8,
  GRAMMAR_COUNT: 4,
  VOCAB_COUNT: 6,

  _questions: [],
  _index: 0,
  _correct: 0,
  _answered: false,
  _fromLevel: null,
  _toLevel: null,

  _shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  },

  isMaxLevel(level) {
    const idx = DATA.levels.indexOf(level);
    return idx === -1 || idx === DATA.levels.length - 1;
  },

  nextLevel(level) {
    const idx = DATA.levels.indexOf(level);
    if (idx === -1 || idx === DATA.levels.length - 1) return null;
    return DATA.levels[idx + 1];
  },

  // Reuse the fixed 30-question grammar bank in DATA.placementTest — it's
  // laid out in rising difficulty, 5 questions per CEFR level in order, so
  // slice out the band matching this level.
  _grammarPool(level) {
    const idx = DATA.levels.indexOf(level);
    const all = DATA.placementTest.questions;
    const perLevel = Math.floor(all.length / DATA.levels.length);
    const start = idx * perLevel;
    return all.slice(start, start + perLevel);
  },

  _buildVocabQuestion(word, pool) {
    const distractorPool = pool.filter(w => w.word !== word.word);
    const distractors = this._shuffle(distractorPool).slice(0, 3).map(w => w.meaning);
    const options = this._shuffle([word.meaning, ...distractors]);
    return {
      type: 'vocab',
      prompt: word.word,
      phonetic: word.phonetic || '',
      example: word.example || '',
      options,
      answer: options.indexOf(word.meaning),
    };
  },

  _buildGrammarQuestion(q) {
    return { type: 'grammar', prompt: q.q, options: q.options, answer: q.answer };
  },

  _generate(level) {
    const grammarPool = this._shuffle(this._grammarPool(level)).slice(0, this.GRAMMAR_COUNT);
    const vocabPool = DATA.levelContent[level]?.vocabulary || [];
    const vocabPicks = this._shuffle(vocabPool).slice(0, Math.min(this.VOCAB_COUNT, vocabPool.length));

    const questions = [
      ...grammarPool.map(q => this._buildGrammarQuestion(q)),
      ...vocabPicks.map(w => this._buildVocabQuestion(w, vocabPool)),
    ];
    this._questions = this._shuffle(questions);
  },

  _modal() { return document.getElementById('levelup-modal'); },
  _body() { return document.getElementById('levelup-body'); },

  open() {
    const modal = this._modal();
    if (!modal) return;
    const level = DATA.currentLevel || DATA.levels[0];

    if (this.isMaxLevel(level)) {
      modal.classList.remove('hidden');
      this._renderMaxLevel();
      return;
    }

    this._fromLevel = level;
    this._toLevel = this.nextLevel(level);
    this._generate(level);
    this._index = 0;
    this._correct = 0;
    this._answered = false;

    modal.classList.remove('hidden');
    this._renderQuestion();
  },

  close() {
    this._modal()?.classList.add('hidden');
  },

  _setProgress() {
    const total = this._questions.length;
    const bar = document.getElementById('levelup-bar');
    const label = document.getElementById('levelup-label');
    const wrap = document.getElementById('levelup-progress-wrap');
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
      <p class="levelup-tag">${q.type === 'vocab' ? '📖 คำศัพท์' : '📝 ไวยากรณ์'}</p>
      <p class="placement-q">${this._escapeHtml(q.prompt)}</p>
      ${q.type === 'vocab' && q.phonetic ? `<p class="challenge-phonetic">${this._escapeHtml(q.phonetic)}</p>` : ''}
      <div class="quiz-options vertical">
        ${q.options.map((o, i) => `<button class="quiz-option levelup-opt" data-i="${i}">${this._escapeHtml(o)}</button>`).join('')}
      </div>
      <p class="challenge-feedback" id="levelup-feedback"></p>
    `;

    body.querySelectorAll('.levelup-opt').forEach(btn => {
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

    body.querySelectorAll('.levelup-opt').forEach((btn, i) => {
      btn.classList.toggle('correct-answer', i === q.answer);
      if (i === choice && !correct) btn.classList.add('selected');
    });

    const fb = document.getElementById('levelup-feedback');
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
    const total = this._questions.length;
    const passed = this._correct / total >= this.PASS_RATIO;

    const result = StatsStore.recordLevelUp({
      fromLevel: this._fromLevel,
      toLevel: this._toLevel,
      passed,
      correct: this._correct,
      total,
    });

    const wrap = document.getElementById('levelup-progress-wrap');
    if (wrap) wrap.style.visibility = 'hidden';

    const body = this._body();
    if (!body) return;

    if (passed) {
      body.innerHTML = `
        <div class="challenge-result">
          <p class="challenge-result-score">🎉</p>
          <p class="challenge-result-detail">ตอบถูก ${this._correct}/${total} — ผ่านแล้ว!</p>
          <p class="levelup-promo">${this._fromLevel} → <strong>${this._toLevel}</strong></p>
          <p class="challenge-result-total">รวม +${result.xpGain} XP</p>
          <button class="btn btn-primary btn-sm" data-close-modal>ปิด</button>
        </div>
      `;
      activeLevel = this._toLevel;
    } else {
      body.innerHTML = `
        <div class="challenge-result">
          <p class="challenge-result-score">📚</p>
          <p class="challenge-result-detail">ตอบถูก ${this._correct}/${total} — ยังไม่ผ่าน (ต้องได้อย่างน้อย ${Math.ceil(total * this.PASS_RATIO)}/${total})</p>
          <p class="challenge-come-back">ทบทวนไวยากรณ์และคำศัพท์ระดับ ${this._fromLevel} แล้วลองใหม่ได้เลย</p>
          <p class="challenge-result-total">+${result.xpGain} XP จากความพยายาม</p>
          <button class="btn btn-outline btn-sm" data-close-modal>ปิด</button>
        </div>
      `;
    }

    if (typeof renderAll === 'function') renderAll();
  },

  _renderMaxLevel() {
    const wrap = document.getElementById('levelup-progress-wrap');
    if (wrap) wrap.style.visibility = 'hidden';
    const body = this._body();
    if (!body) return;
    body.innerHTML = `
      <div class="challenge-result">
        <p class="challenge-result-score">🏆</p>
        <p class="challenge-result-detail">คุณอยู่ระดับสูงสุด (C2) แล้ว — เก่งมาก!</p>
        <button class="btn btn-primary btn-sm" data-close-modal>ปิด</button>
      </div>
    `;
  },

  init() {
    if (!this._modal()) return;

    document.querySelectorAll('[data-action="level-up-test"]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        this.open();
      });
    });

    this._modal().addEventListener('click', e => {
      if (e.target === this._modal() || e.target.closest('[data-close-modal]')) this.close();
    });
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.body?.dataset.page === 'login') return;
  LevelUpTest.init();
});
