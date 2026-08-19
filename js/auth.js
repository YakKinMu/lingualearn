/* ===== Firebase-backed auth (Firebase Authentication — Email/Password) =====
   Accounts use the user's real email address, so Firebase can send working
   password-reset and (optionally) verification emails.

   A small localStorage cache mirrors "who's currently logged in" (keyed by
   the Firebase UID) so pages can check auth synchronously the instant they
   load (no flash of protected content while Firebase is still starting up).
   firebase.auth().onAuthStateChanged() is the source of truth and
   corrects/clears that cache if it's ever wrong (session signed out
   elsewhere, expired token, etc.). */

const AUTH_SESSION_KEY = 'lingualearn_session_v1';
const AUTH_DISPLAYNAMES_KEY = 'lingualearn_displaynames_v1';

const AuthStore = {
  _getDisplayNames() {
    try {
      const raw = localStorage.getItem(AUTH_DISPLAYNAMES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  _saveDisplayName(uid, displayName) {
    try {
      const map = this._getDisplayNames();
      map[uid] = displayName;
      localStorage.setItem(AUTH_DISPLAYNAMES_KEY, JSON.stringify(map));
    } catch { /* storage unavailable */ }
  },

  _setSession(uid) {
    try { localStorage.setItem(AUTH_SESSION_KEY, uid); } catch { /* storage unavailable */ }
  },

  _clearSession() {
    try { localStorage.removeItem(AUTH_SESSION_KEY); } catch { /* storage unavailable */ }
  },

  _friendlyError(err) {
    const code = err?.code || '';
    if (code === 'auth/email-already-in-use') return 'อีเมลนี้มีบัญชีอยู่แล้ว';
    if (code === 'auth/invalid-email') return 'รูปแบบอีเมลไม่ถูกต้อง';
    if (code === 'auth/weak-password') return 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร';
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    }
    if (code === 'auth/too-many-requests') return 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่';
    if (code === 'auth/network-request-failed') return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาลองใหม่';
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  },

  // register/login/logout/forgotPassword are async (they talk to Firebase
  // over the network) — callers must `await` them.
  async register(email, password, displayName) {
    email = (email || '').trim();
    password = password || '';
    displayName = (displayName || '').trim();

    if (!email || !password || !displayName) return { ok: false, error: 'กรุณากรอกข้อมูลให้ครบ' };
    if (password.length < 6) return { ok: false, error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' };

    try {
      const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName });
      this._saveDisplayName(cred.user.uid, displayName);
      this._setSession(cred.user.uid);
      cred.user.sendEmailVerification?.().catch(() => { /* non-critical */ });
      return { ok: true, uid: cred.user.uid, displayName };
    } catch (err) {
      return { ok: false, error: this._friendlyError(err) };
    }
  },

  async login(email, password) {
    email = (email || '').trim();
    password = password || '';

    try {
      const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
      const displayName = cred.user.displayName || email;
      this._saveDisplayName(cred.user.uid, displayName);
      this._setSession(cred.user.uid);
      return { ok: true, uid: cred.user.uid, displayName };
    } catch (err) {
      return { ok: false, error: this._friendlyError(err) };
    }
  },

  async logout() {
    try { await firebase.auth().signOut(); } catch { /* ignore network errors on sign-out */ }
    this._clearSession();
  },

  async forgotPassword(email) {
    email = (email || '').trim();
    if (!email) return { ok: false, error: 'กรุณากรอกอีเมล' };
    try {
      await firebase.auth().sendPasswordResetEmail(email);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: this._friendlyError(err) };
    }
  },

  // Kept as "getCurrentUsername" so the rest of the app (stats-store.js,
  // app.js) doesn't need to change — it now returns the Firebase UID, which
  // is stable and unique per account (unlike a freely-typed username).
  getCurrentUsername() {
    try { return localStorage.getItem(AUTH_SESSION_KEY) || null; } catch { return null; }
  },

  isLoggedIn() {
    return !!this.getCurrentUsername();
  },

  getDisplayName(uid) {
    const map = this._getDisplayNames();
    return map[uid] || 'ผู้ใช้';
  },
};

// Keep the local session cache honest. If Firebase says "signed out" but we
// still have a cached session (token expired, signed out in another tab,
// account deleted, etc.), clear the cache and send the user back to login.
// If Firebase says "signed in" but our cache doesn't know it yet, fill it in.
firebase.auth().onAuthStateChanged(user => {
  const page = document.body?.dataset.page;
  if (!user && AuthStore.isLoggedIn()) {
    AuthStore._clearSession();
    if (page !== 'login') window.location.href = 'login.html';
    return;
  }
  if (user && !AuthStore.isLoggedIn()) {
    AuthStore._saveDisplayName(user.uid, user.displayName || user.email);
    AuthStore._setSession(user.uid);
  }
});
