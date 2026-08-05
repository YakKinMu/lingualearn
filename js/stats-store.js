const STORAGE_KEY = 'lingualearn_stats_v1';
const THAI_DAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

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
      const raw = localStorage.getItem(STORAGE_KEY);
      this._stats = raw ? JSON.parse(raw) : this._createDefault();
    } catch {
      this._stats = this._createDefault();
    }
    this._handleDayRollover();
    this._handleWeekRollover();
    if (!this._stats.counters) this._stats.counters = { chatMessages: 0, placementTests: 0, levelsViewed: 0 };
    if (!this._stats.viewedLevels) this._stats.viewedLevels = [...DATA.levels];
    if (!this._stats.battle) {
      this._stats.battle = { rankPoints: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, totalBattles: 0 };
    }
    this.save();
    this._syncToData();
    return this._stats;
  },

  get() { return this._stats; },

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._stats));
    } catch {
      /* localStorage unavailable (e.g. opened via file:// or blocked storage) — continue in-memory only */
    }
    this._syncToData();
  },

  exportJSON() { return JSON.stringify(this._stats, null, 2); },

  updateProfile(fields) {
    Object.assign(this._stats.user, fields);
    this.save();
  },

  importJSON(json) {
    this._stats = { ...this._createDefault(), ...(typeof json === 'string' ? JSON.parse(json) : json), version: 1 };
    this.save();
  },

  reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* localStorage unavailable */ }
    this._stats = this._createDefault();
    this.save();
  },

  _createDefault() {
    const today = this._todayKey();
    const activityLog = DATA.progress.weeklyActivity.map((a, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { date: d.toISOString().slice(0, 10), minutes: a.minutes, lessons: a.lessons, vocab: a.vocab };
    });

    return {
      version: 2,
      lastVisit: today,
      weekStart: this._weekStartKey(),
      currentLevel: DATA.currentLevel,
      user: { ...DATA.user },
      counters: { chatMessages: 0, placementTests: 0, levelsViewed: DATA.levels.length },
      viewedLevels: [...DATA.levels],
      battle: { rankPoints: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, totalBattles: 0 },
      activityLog,
      monthlyStats: { ...DATA.progress.monthlyStats },
      events: [],
    };
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
    b.totalBattles += 1;

    let rpChange = 0;
    if (won) {
      b.wins += 1;
      b.streak += 1;
      if (b.streak > b.bestStreak) b.bestStreak = b.streak;
      rpChange = 25 + Math.floor(b.streak / 2) * 5 + Math.floor((20 - battleState.turn) * 2);
      s.user.xp += 40 + rpChange;
    } else {
      b.losses += 1;
      b.streak = 0;
      rpChange = -15;
      s.user.xp += 10;
    }

    b.rankPoints = Math.max(0, b.rankPoints + rpChange);
    const today = this._getTodayActivity();
    today.minutes += 8;
    s.user.minutesToday += 8;
    s.monthlyStats.totalMinutes += 8;
    this.save();

    return {
      won,
      rpChange,
      rankPoints: b.rankPoints,
      wins: b.wins,
      losses: b.losses,
      streak: b.streak,
    };
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
