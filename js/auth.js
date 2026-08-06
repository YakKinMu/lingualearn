/* ===== Simple client-side auth (localStorage only — no real backend/server) =====
   This is NOT secure authentication (no server, no encryption of transport,
   passwords hashed only with a weak non-cryptographic hash for basic obscurity).
   It's meant for a personal/portfolio project so each device/browser can keep
   separate named profiles — do not reuse these passwords anywhere real. */

const AUTH_ACCOUNTS_KEY = 'lingualearn_accounts_v1';
const AUTH_SESSION_KEY = 'lingualearn_session_v1';

const AuthStore = {
  _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h.toString(36);
  },

  _getAccounts() {
    try {
      const raw = localStorage.getItem(AUTH_ACCOUNTS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  _saveAccounts(accounts) {
    try { localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(accounts)); } catch { /* storage unavailable */ }
  },

  _setSession(username) {
    try { localStorage.setItem(AUTH_SESSION_KEY, username); } catch { /* storage unavailable */ }
  },

  register(username, password, displayName) {
    username = (username || '').trim().toLowerCase();
    password = password || '';
    displayName = (displayName || '').trim();

    if (!username || !password) return { ok: false, error: 'กรุณากรอกข้อมูลให้ครบ' };
    if (!/^[a-z0-9_.]{3,30}$/.test(username)) {
      return { ok: false, error: 'ชื่อผู้ใช้ต้องเป็นอักษรภาษาอังกฤษ/ตัวเลข 3-30 ตัว' };
    }
    if (password.length < 4) return { ok: false, error: 'รหัสผ่านต้องยาวอย่างน้อย 4 ตัวอักษร' };

    const accounts = this._getAccounts();
    if (accounts[username]) return { ok: false, error: 'มีชื่อผู้ใช้นี้อยู่แล้ว' };

    accounts[username] = {
      passwordHash: this._hash(password),
      displayName: displayName || username,
      createdAt: new Date().toISOString(),
    };
    this._saveAccounts(accounts);
    this._setSession(username);
    return { ok: true, username, displayName: accounts[username].displayName };
  },

  login(username, password) {
    username = (username || '').trim().toLowerCase();
    password = password || '';
    const accounts = this._getAccounts();
    const acc = accounts[username];
    if (!acc || acc.passwordHash !== this._hash(password)) {
      return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    }
    this._setSession(username);
    return { ok: true, username, displayName: acc.displayName };
  },

  logout() {
    try { localStorage.removeItem(AUTH_SESSION_KEY); } catch { /* storage unavailable */ }
  },

  getCurrentUsername() {
    try { return localStorage.getItem(AUTH_SESSION_KEY) || null; } catch { return null; }
  },

  isLoggedIn() {
    return !!this.getCurrentUsername();
  },

  getDisplayName(username) {
    const accounts = this._getAccounts();
    return accounts[username]?.displayName || username;
  },
};
