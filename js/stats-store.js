const STORAGE_KEY_PREFIX = 'lingualearn_stats_v1';
const THAI_DAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function getStorageKey() {
  const username = (typeof AuthStore !== 'undefined' && AuthStore.getCurrentUsername()) || 'guest';
  return `${STORAGE_KEY_PREFIX}_${username}`;
}

const RankSystem = {
  getRank(rankRP) {
    const rp = Math.max(0, rankRP || 0);
    let tier = DATA.rankTiers[0];
    for (const t of DATA.rankTiers) {
      if (rp >= t.minRP) tier = t;
    }
    const tierIdx = DATA.rankTiers.indexOf(tier);
    const nextTier = DATA.rankTiers[tierIdx + 1];
    const tierMax = nextTier ? nextTier.minRP : tier.minRP + 500;
    const tierMin = tier.minRP;
    const span = tierMax - tierMin;
    const progress = Math.min(100, Math.round(((rp - tierMin) / span) * 100));
    const division = rp >= tierMin + span * 0.66 ? 'I' : rp >= tierMin + span * 0.33 ? 'II' : 'III';

    return {
      rp,
      tier,
      division,
      label: `${tier.name} ${division}`,
      labelTh: `${tier.nameTh} ${division}`,
      icon: tier.icon,
      color: tier.color,
      progress,
      nextRP: nextTier ? nextTier.minRP : null,
      rpToNext: nextTier ? nextTier.minRP - rp : 0,
    };
  },

  getOpponentForRP(rp) {
    const sorted = [...DATA.battleOpponents].sort((a, b) => a.rankRP - b.rankRP);
    let pick = sorted[0];
    for (const o of sorted) {
      if (o.rankRP <= rp + 150) pick = o;
    }
    const harder = sorted.find(o => o.rankRP > pick.rankRP && o.rankRP <= rp + 250);
    return harder || pick;
  },
};

const StatsStore = {
  _stats: null,

  init() {
    try {
      const raw = localStorage.getItem(getStorageKey());
      this._stats = raw ? JSON.parse(raw) : this._createDefault();
    } catch {
      this._stats = this._createDefault();
    }
    this._migrateLegacyFakeSeed();
    this._handleDayRollover();
    this._handleWeekRollover();
    if (!this._stats.counters) this._stats.counters = { chatMessages: 0, placementTests: 0, levelsViewed: 0 };
    if (!this._stats.viewedLevels) this._stats.viewedLevels = [...DATA.levels];
    if (!this._stats.battle) {
      this._stats.battle = { rankPoints: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, totalBattles: 0 };
    }
    if (!this._stats.spelling) {
      this._stats.spelling = { gamesPlayed: 0, totalCorrect: 0, totalWrong: 0, bestStreak: 0, bestScore: 0 };
    }
    if (!this._stats.dailyChallenge) {
      this._stats.dailyChallenge = { lastCompletedDate: null, totalCompleted: 0, bestScore: 0, lastXpGain: 0 };
    }
    if (!this._stats.levelUpTests) {
      this._stats.levelUpTests = { attempts: 0, passedCount: 0, lastResult: null };
    }
    this.save({ skipCloud: true });
    this._syncToData();
    // Make sure this player has an up-to-date row on the shared Firestore
    // leaderboard as soon as they show up (not just after a battle).
    if (typeof LeaderboardStore !== 'undefined') LeaderboardStore.syncCurrentUser();
    // Pull this account's REAL saved progress from Firestore (works across
    // any device/browser they log into) and reconcile it with what we have
    // in this browser's localStorage cache. Fire-and-forget — the page
    // renders instantly from the local cache first, then re-renders once
    // the cloud copy (the source of truth) has loaded.
    this._loadFromCloud();
    return this._stats;
  },

  get() { return this._stats; },

  // opts.skipCloud: true = only write to localStorage, don't also push to
  // Firestore (used while we're still merging data we just pulled FROM
  // Firestore, to avoid an immediate pointless round-trip write).
  save(opts = {}) {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(this._stats));
    } catch {
      /* localStorage unavailable (e.g. opened via file:// or blocked storage) — continue in-memory only */
    }
    this._syncToData();
    if (!opts.skipCloud) this._pushToCloud();
  },

  // ===== Firestore-backed persistence (users/{uid}) =====
  // localStorage stays as a fast local cache so the UI always paints
  // instantly, but Firestore is the real, permanent copy of a player's
  // progress — the same account shows the same data on any device.
  _cloudSaveTimer: null,

  _getUserDocRef() {
    const uid = typeof AuthStore !== 'undefined' ? AuthStore.getCurrentUsername() : null;
    if (!uid || typeof firebase === 'undefined' || !firebase.firestore) return null;
    try { return firebase.firestore().collection('users').doc(uid); } catch { return null; }
  },

  _pushToCloud() {
    const ref = this._getUserDocRef();
    if (!ref) return;
    clearTimeout(this._cloudSaveTimer);
    // Debounce: several `record()`/save() calls can fire in quick succession
    // (chat messages, level views, etc.) — wait for things to settle before
    // writing, instead of hitting Firestore on every single change.
    this._cloudSaveTimer = setTimeout(() => {
      ref.set({
        stats: this._stats,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }).catch(err => {
        console.warn('StatsStore._pushToCloud failed:', err?.message || err);
      });
    }, 800);
  },

  async _loadFromCloud() {
    const ref = this._getUserDocRef();
    if (!ref) return;
    try {
      const doc = await ref.get();
      if (doc.exists && doc.data()?.stats) {
        // Cloud copy is the real, cross-device data for this account —
        // it replaces whatever this browser's local cache had.
        this._stats = { ...this._createDefault(), ...doc.data().stats, version: doc.data().stats.version || 2 };
        const wasLegacyFake = this._stats.version < 3;
        this._migrateLegacyFakeSeed();
        this._handleDayRollover();
        this._handleWeekRollover();
        // If we just cleaned up old fake demo numbers, push the corrected
        // copy back to Firestore so it's fixed everywhere, not just here.
        this.save({ skipCloud: !wasLegacyFake });
        if (typeof LeaderboardStore !== 'undefined') LeaderboardStore.syncCurrentUser();
        if (typeof renderAll === 'function') renderAll();
      } else {
        // First time this account has ever loaded — push what we have
        // locally (fresh defaults, or a pre-existing local cache) up as
        // the first cloud copy.
        this._pushToCloud();
      }
    } catch (err) {
      console.warn('StatsStore._loadFromCloud failed:', err?.message || err);
    }
  },

  exportJSON() { return JSON.stringify(this._stats, null, 2); },

  updateProfile(fields) {
    Object.assign(this._stats.user, fields);
    this.save();
    if (typeof LeaderboardStore !== 'undefined') LeaderboardStore.syncCurrentUser();
  },

  importJSON(json) {
    this._stats = { ...this._createDefault(), ...(typeof json === 'string' ? JSON.parse(json) : json), version: 1 };
    this.save();
  },

  reset() {
    try { localStorage.removeItem(getStorageKey()); } catch { /* localStorage unavailable */ }
    this._stats = this._createDefault();
    const ref = this._getUserDocRef();
    if (ref) ref.set({ stats: this._stats, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: false }).catch(() => {});
    this.save({ skipCloud: true });
  },

  _createDefault() {
    const today = this._todayKey();
    // Real new account = real zeros. The last 7 days are genuinely empty
    // (they'll fill in as the person actually studies) — not the fake demo
    // chart numbers from DATA.progress.weeklyActivity.
    const activityLog = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      activityLog.push({ date: d.toISOString().slice(0, 10), minutes: 0, lessons: 0, vocab: 0 });
    }

    const username = (typeof AuthStore !== 'undefined' && AuthStore.getCurrentUsername()) || null;
    const displayName = username ? AuthStore.getDisplayName(username) : null;
    // Real join date = this Firebase account's actual creation timestamp
    // (cached by auth.js from user.metadata.creationTime), falling back to
    // "today" only for the rare case it hasn't been cached yet.
    const joinDate = (username && typeof AuthStore !== 'undefined' && AuthStore.getJoinDate(username)) || new Date().toISOString();

    const userSeed = {
      name: displayName || 'ผู้เรียนใหม่',
      nickname: (displayName && displayName.split(' ')[0]) || displayName || 'เพื่อน',
      avatar: (displayName && displayName.trim().charAt(0)) || '👤',
      avatarImage: null,
      level: DATA.levels[0],
      streak: 0,
      xp: 0,
      minutesToday: 0,
      vocabCount: 0,
      lessonsToday: 0,
      vocabReviewedToday: 0,
      joinDate,
      dailyGoalMinutes: 60,
      weeklyGoalLessons: 5,
      weeklyLessonsDone: 0,
    };

    return {
      version: 3,
      lastVisit: today,
      weekStart: this._weekStartKey(),
      currentLevel: DATA.levels[0],
      user: userSeed,
      counters: { chatMessages: 0, placementTests: 0, levelsViewed: 0 },
      viewedLevels: [],
      battle: { rankPoints: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, totalBattles: 0 },
      battleHistory: [],
      spelling: { gamesPlayed: 0, totalCorrect: 0, totalWrong: 0, bestStreak: 0, bestScore: 0 },
      dailyChallenge: { lastCompletedDate: null, totalCompleted: 0, bestScore: 0, lastXpGain: 0 },
      levelUpTests: { attempts: 0, passedCount: 0, lastResult: null },
      activityLog,
      monthlyStats: { totalMinutes: 0, totalLessons: 0, totalVocab: 0, avgScore: 0, bestStreak: 0 },
      events: [],
    };
  },

  // One-time cleanup for accounts created before this fix, whose saved data
  // still carries the old hardcoded demo numbers (streak 14, XP 1840, 247
  // words, joined "2025-09-15", etc. — copied wholesale from DATA.user).
  // Detected by that exact fake combination so real progress is never
  // touched, then replaced with honest values / the real Firebase join date.
  _migrateLegacyFakeSeed() {
    const s = this._stats;
    if (!s || s.version >= 3 || !s.user) return;
    const u = s.user;
    const looksFake = u.joinDate === '2025-09-15' && u.xp === 1840 && u.streak === 14;
    if (looksFake) {
      const username = (typeof AuthStore !== 'undefined' && AuthStore.getCurrentUsername()) || null;
      const realJoinDate = (username && typeof AuthStore !== 'undefined' && AuthStore.getJoinDate(username)) || new Date().toISOString();
      Object.assign(u, {
        streak: 0,
        xp: 0,
        minutesToday: 0,
        vocabCount: 0,
        lessonsToday: 0,
        vocabReviewedToday: 0,
        weeklyLessonsDone: 0,
        joinDate: realJoinDate,
      });
      s.monthlyStats = { totalMinutes: 0, totalLessons: 0, totalVocab: 0, avgScore: 0, bestStreak: 0 };
      s.activityLog = s.activityLog.map(a => ({ ...a, minutes: 0, lessons: 0, vocab: 0 }));
      s.viewedLevels = [];
      s.counters.levelsViewed = 0;
    }
    s.version = 3;
  },

  _todayKey() { return new Date().toISOString().slice(0, 10); },

  _yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  },

  _weekStartKey() {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d.toISOString().slice(0, 10);
  },

  _handleDayRollover() {
    const today = this._todayKey();
    if (this._stats.lastVisit === today) return;
    const yesterday = this._yesterdayKey();
    const hadActivity = this._stats.user.minutesToday > 0;
    if (this._stats.lastVisit === yesterday && hadActivity) this._stats.user.streak += 1;
    else if (this._stats.lastVisit !== today) this._stats.user.streak = hadActivity ? 1 : 0;
    if (this._stats.user.streak > this._stats.monthlyStats.bestStreak) {
      this._stats.monthlyStats.bestStreak = this._stats.user.streak;
    }
    this._stats.user.minutesToday = 0;
    this._stats.lastVisit = today;
  },

  _handleWeekRollover() {
    const ws = this._weekStartKey();
    if (this._stats.weekStart !== ws) {
      this._stats.weekStart = ws;
      this._stats.user.weeklyLessonsDone = 0;
    }
  },

  _getTodayActivity() {
    const today = this._todayKey();
    let entry = this._stats.activityLog.find(a => a.date === today);
    if (!entry) {
      entry = { date: today, minutes: 0, lessons: 0, vocab: 0 };
      this._stats.activityLog.push(entry);
    }
    return entry;
  },

  record(type, opts = {}) {
    const s = this._stats;
    const u = s.user;
    const today = this._getTodayActivity();
    let xpGain = 0;

    switch (type) {
      case 'chat':
        s.counters.chatMessages += 1;
        xpGain = 5;
        today.minutes += 2;
        u.minutesToday += 2;
        s.monthlyStats.totalMinutes += 2;
        break;
      case 'placement':
        s.counters.placementTests += 1;
        if (opts.level) { s.currentLevel = opts.level; u.level = opts.level; }
        xpGain = 50;
        today.minutes += 10;
        u.minutesToday += 10;
        s.monthlyStats.totalMinutes += 10;
        break;
      case 'level_view':
        if (opts.level && !s.viewedLevels.includes(opts.level)) {
          s.viewedLevels.push(opts.level);
          s.counters.levelsViewed = s.viewedLevels.length;
          xpGain = 10;
          today.minutes += 3;
          u.minutesToday += 3;
          s.monthlyStats.totalMinutes += 3;
        }
        break;
    }

    if (xpGain > 0) u.xp += xpGain;
    s.events = [{ type, detail: opts, at: new Date().toISOString() }, ...(s.events || [])].slice(0, 50);
    this.save();
    return { xpGain, stats: s };
  },

  recordBattle(won, battleState) {
    const s = this._stats;
    const b = s.battle;

    // ===== Elo rating (same formula chess ratings use) =====
    // Player rating = current rankPoints. Opponent rating = their rankRP.
    // "Expected" is the player's win probability purely from the rating
    // gap — so beating a much stronger opponent (low expected) pays out
    // close to the full K, while beating a much weaker one (high expected)
    // pays out very little. Symmetrically, losing to a stronger opponent
    // barely costs anything, but losing to a weaker one costs a lot.
    const playerRating = b.rankPoints;
    const oppRating = battleState?.opponent?.rankRP ?? 50;
    const expected = 1 / (1 + Math.pow(10, (oppRating - playerRating) / 400));

    // K-factor: how volatile each result is. Higher while a player is still
    // "placing" (their rating hasn't found its real level yet) so it moves
    // fast toward the right range, then settles down once established —
    // the standard approach used by chess federations (e.g. FIDE uses 40
    // for new players, dropping to ~20 for experienced ones).
    const gamesSoFar = b.totalBattles;
    const K = gamesSoFar < 10 ? 40 : gamesSoFar < 30 ? 30 : 20;

    b.totalBattles += 1;
    const actual = won ? 1 : 0;
    let rpChange = Math.round(K * (actual - expected));

    if (won) {
      b.wins += 1;
      b.streak += 1;
      if (b.streak > b.bestStreak) b.bestStreak = b.streak;
      rpChange = Math.max(rpChange, 1); // a win always nets at least +1 RP
      s.user.xp += 40 + rpChange;
    } else {
      b.losses += 1;
      b.streak = 0;
      rpChange = Math.min(rpChange, -1); // a loss always costs at least -1 RP
      s.user.xp += 10;
    }

    b.rankPoints = Math.max(0, b.rankPoints + rpChange);

    // Keep a running table of recent battles so the player can see exactly
    // how much RP each individual match earned/cost — not just the fleeting
    // popup right after the fight. Capped to the most recent 20.
    if (!Array.isArray(s.battleHistory)) s.battleHistory = [];
    s.battleHistory.unshift({
      date: new Date().toISOString(),
      opponentName: battleState?.opponent?.name || 'ผู้เล่นนิรนาม',
      opponentAvatar: battleState?.opponent?.avatar || '⚔️',
      won,
      rpChange,
      rankPointsAfter: b.rankPoints,
    });
    if (s.battleHistory.length > 20) s.battleHistory.length = 20;

    const today = this._getTodayActivity();
    today.minutes += 8;
    s.user.minutesToday += 8;
    s.monthlyStats.totalMinutes += 8;
    this.save();
    // Push the new rank/wins/losses to the shared leaderboard right away so
    // other players see it next time they load the board.
    if (typeof LeaderboardStore !== 'undefined') LeaderboardStore.syncCurrentUser();

    return {
      won,
      rpChange,
      rankPoints: b.rankPoints,
      wins: b.wins,
      losses: b.losses,
      streak: b.streak,
    };
  },

  recordSpelling(result) {
    const s = this._stats;
    const sp = s.spelling;
    const { correct, wrong, score, bestStreakThisRound } = result;

    sp.gamesPlayed += 1;
    sp.totalCorrect += correct;
    sp.totalWrong += wrong;
    if (bestStreakThisRound > sp.bestStreak) sp.bestStreak = bestStreakThisRound;
    if (score > sp.bestScore) sp.bestScore = score;

    const xpGain = correct * 8 + Math.max(0, score - correct * 8);
    s.user.xp += xpGain;

    const today = this._getTodayActivity();
    today.minutes += 5;
    today.vocab += correct;
    s.user.minutesToday += 5;
    s.monthlyStats.totalMinutes += 5;
    this.save();

    return { xpGain, spelling: sp };
  },

  // ===== Daily Challenge =====
  // Rewards riding on top of the existing daily-activity streak (user.streak):
  // the bonus scales with however many consecutive days the learner has
  // already kept up, so a long streak makes today's challenge worth more —
  // and completing it counts as today's activity, which is what keeps that
  // same streak alive for tomorrow.
  isDailyChallengeDoneToday() {
    const dc = this._stats.dailyChallenge;
    return !!dc && dc.lastCompletedDate === this._todayKey();
  },

  recordDailyChallenge(result) {
    const s = this._stats;
    const u = s.user;
    const today = this._todayKey();
    const dc = s.dailyChallenge;

    if (dc.lastCompletedDate === today) {
      return { alreadyDone: true, xpGain: 0 };
    }

    const { correct, total } = result;
    const streakBonus = Math.min(u.streak, 20) * 2;
    const perfectBonus = total > 0 && correct === total ? 15 : 0;
    const xpGain = correct * 8 + streakBonus + perfectBonus;

    u.xp += xpGain;
    dc.lastCompletedDate = today;
    dc.totalCompleted += 1;
    dc.lastXpGain = xpGain;
    if (correct > dc.bestScore) dc.bestScore = correct;

    const todayActivity = this._getTodayActivity();
    todayActivity.minutes += 5;
    todayActivity.lessons += 1;
    u.minutesToday += 5;
    u.lessonsToday = (u.lessonsToday || 0) + 1;
    s.monthlyStats.totalMinutes += 5;
    s.monthlyStats.totalLessons += 1;

    this.save();

    return { alreadyDone: false, xpGain, streakBonus, perfectBonus, correct, total, streak: u.streak };
  },

  // ===== Level-Up Test =====
  // A focused exam on the learner's CURRENT level (not a generic re-placement
  // test) — passing advances DATA.currentLevel / user.level to the next
  // CEFR step. Failing just records the attempt so profile stats can show
  // how many tries it took.
  recordLevelUp({ fromLevel, toLevel, passed, correct, total }) {
    const s = this._stats;
    const u = s.user;
    if (!s.levelUpTests) s.levelUpTests = { attempts: 0, passedCount: 0, lastResult: null };
    const lt = s.levelUpTests;

    lt.attempts += 1;
    lt.lastResult = { fromLevel, toLevel, passed, correct, total, date: this._todayKey() };

    const xpGain = passed ? 100 : 20;
    u.xp += xpGain;

    if (passed) {
      lt.passedCount += 1;
      s.currentLevel = toLevel;
      u.level = toLevel;
    }

    const todayActivity = this._getTodayActivity();
    todayActivity.minutes += 10;
    todayActivity.lessons += 1;
    u.minutesToday += 10;
    u.lessonsToday = (u.lessonsToday || 0) + 1;
    s.monthlyStats.totalMinutes += 10;
    s.monthlyStats.totalLessons += 1;

    this.save();
    this._syncToData();

    return { xpGain, passed };
  },

  _buildWeeklyActivity() {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const entry = this._stats.activityLog.find(a => a.date === key) || { minutes: 0, lessons: 0, vocab: 0 };
      result.push({
        day: THAI_DAYS[d.getDay()],
        minutes: entry.minutes,
        lessons: entry.lessons,
        vocab: entry.vocab,
        today: key === this._todayKey(),
      });
    }
    return result;
  },

  _syncToData() {
    Object.assign(DATA.user, this._stats.user);
    DATA.currentLevel = this._stats.currentLevel;
    DATA.progress.weeklyActivity = this._buildWeeklyActivity();
    DATA.progress.monthlyStats = { ...this._stats.monthlyStats };
    if (this._stats.battle) DATA.user.battleRP = this._stats.battle.rankPoints;
  },
};
