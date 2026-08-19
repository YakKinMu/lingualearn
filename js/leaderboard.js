/* ===== Firestore-backed Rank Leaderboard =====
   Replaces the old hardcoded fake `DATA.rankLeaderboard` with real data
   shared across every signed-in player, via a single Firestore collection:

     leaderboard/{uid} = {
       name: string,        // display name shown on the board
       avatar: string,      // 1-2 char avatar text (emoji or initial)
       rankRP: number,      // current Word Battle rank points
       wins: number,
       losses: number,
       bestStreak: number,
       updatedAt: server timestamp
     }

   Each browser writes ONLY its own signed-in user's doc (uid == the
   Firebase Auth uid), and can read the whole collection to build the
   board. That maps directly onto these Firestore Security Rules
   (Firebase Console → Firestore Database → Rules):

     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /leaderboard/{uid} {
           allow read: if true;
           allow write: if request.auth != null
                        && request.auth.uid == uid
                        && request.resource.data.rankRP is number;
         }
       }
     }

   Requires firebase-firestore-compat.js to be loaded (after
   firebase-app-compat.js) before this file. All calls are fire-and-forget
   / fail-silent so a slow or offline connection never blocks gameplay. */

const LeaderboardStore = {
  _db: null,
  _syncing: false,
  _pendingSync: false,

  _getDb() {
    if (this._db) return this._db;
    try {
      if (typeof firebase !== 'undefined' && firebase.firestore) {
        this._db = firebase.firestore();
      }
    } catch {
      this._db = null;
    }
    return this._db;
  },

  // Push the current signed-in user's latest stats to the shared board.
  async syncCurrentUser() {
    const db = this._getDb();
    const uid = typeof AuthStore !== 'undefined' ? AuthStore.getCurrentUsername() : null;
    if (!db || !uid) return;

    if (this._syncing) { this._pendingSync = true; return; }
    this._syncing = true;

    try {
      const stats = (typeof StatsStore !== 'undefined' && StatsStore.get()) || null;
      if (!stats) return;
      const battle = stats.battle || { rankPoints: 0, wins: 0, losses: 0, bestStreak: 0 };
      const displayName = (typeof AuthStore !== 'undefined' && AuthStore.getDisplayName(uid))
        || stats.user?.name || 'ผู้เล่น';
      const avatarSrc = stats.user?.avatar || displayName.trim().charAt(0) || '🙂';

      await db.collection('leaderboard').doc(uid).set({
        name: String(displayName).slice(0, 40),
        avatar: String(avatarSrc).slice(0, 2),
        rankRP: Math.max(0, Math.round(battle.rankPoints || 0)),
        wins: battle.wins || 0,
        losses: battle.losses || 0,
        bestStreak: battle.bestStreak || 0,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.warn('LeaderboardStore.syncCurrentUser failed:', err?.message || err);
    } finally {
      this._syncing = false;
      if (this._pendingSync) { this._pendingSync = false; this.syncCurrentUser(); }
    }
  },

  // Fetch the top N real players, sorted by rankRP descending.
  async fetchTop(n = 50) {
    const db = this._getDb();
    if (!db) return [];
    try {
      const snap = await db.collection('leaderboard').orderBy('rankRP', 'desc').limit(n).get();
      return snap.docs.map(doc => {
        const d = doc.data() || {};
        return {
          uid: doc.id,
          name: typeof d.name === 'string' && d.name ? d.name : 'ผู้เล่น',
          avatar: typeof d.avatar === 'string' && d.avatar ? d.avatar : '🙂',
          rankRP: typeof d.rankRP === 'number' ? d.rankRP : 0,
          wins: typeof d.wins === 'number' ? d.wins : 0,
          losses: typeof d.losses === 'number' ? d.losses : 0,
        };
      });
    } catch (err) {
      console.warn('LeaderboardStore.fetchTop failed:', err?.message || err);
      return [];
    }
  },
};
