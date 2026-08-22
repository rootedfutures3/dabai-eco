/* ============================================================
   Supabase Auth
   ------------------------------------------------------------
   真正的登入：密碼由 Supabase 加鹽雜湊保管，前端永遠拿不到它，
   登入後拿到的是有時效的 JWT，之後所有讀寫都帶著它，
   由資料庫的 RLS 政策決定這個人能看到什麼、能改什麼。

   和舊的示範登入差在哪：
     示範模式 —— 帳號密碼是明文，存在瀏覽器裡，權限只是前端藏按鈕
     Auth 模式 —— 密碼雜湊存在伺服器，權限由資料庫強制執行

   為什麼還留著示範模式：
     Auth 需要先在 Supabase 後台把 Email provider 打開、決定要不要
     寄確認信，還要手動建立第一個管理員。這些沒弄好之前，
     整個網站不該直接掛掉 —— 所以 config.js 有一個開關。

   金鑰安全：這裡只用 publishable key，它本來就是設計成公開的。
   建立別人的帳號需要 service_role key，那一把絕對不能進前端 ——
   所以「超級管理員替別人開帳號」在 Auth 模式下改成邀請對方自己註冊，
   註冊完再由超級管理員指派角色。
   ============================================================ */

const SB_AUTH_KEY = 'rf_sb_session';

const Auth = {
  /** 目前是不是走真正的 Auth。config.js 沒設就是示範模式。 */
  get on() {
    return typeof AUTH_MODE !== 'undefined' && AUTH_MODE === 'supabase'
        && typeof CLOUD_ON !== 'undefined' && CLOUD_ON;
  },

  get url() { return typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : ''; },
  get key() { return typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : ''; },

  /* ---------- session ---------- */

  session() {
    try { return JSON.parse(localStorage.getItem(SB_AUTH_KEY) || 'null'); }
    catch (e) { return null; }
  },

  save(s) {
    if (!s) { localStorage.removeItem(SB_AUTH_KEY); return null; }
    // expires_at 是秒，換算成毫秒方便比對
    s.expires_ms = Date.now() + (Number(s.expires_in || 3600) - 60) * 1000;
    localStorage.setItem(SB_AUTH_KEY, JSON.stringify(s));
    return s;
  },

  /** 目前有效的 access token；快過期就先換一張。 */
  async token() {
    let s = Auth.session();
    if (!s) return null;
    if (Date.now() < (s.expires_ms || 0)) return s.access_token;
    s = await Auth.refresh();
    return s ? s.access_token : null;
  },

  async refresh() {
    const s = Auth.session();
    if (!s || !s.refresh_token) return null;
    try {
      const r = await fetch(`${Auth.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: Auth.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      if (!r.ok) { Auth.save(null); return null; }
      return Auth.save(await r.json());
    } catch (e) {
      console.warn('[換發 token 失敗]', e.message);
      return null;
    }
  },

  /* ---------- 登入 / 註冊 / 登出 ---------- */

  /** 回傳 { ok:true, user } 或 { ok:false, error:'給人看的訊息' } */
  async signIn(email, password) {
    try {
      const r = await fetch(`${Auth.url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: Auth.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(email).trim(), password }),
      });
      const data = await r.json();
      if (!r.ok) return { ok: false, error: Auth.explain(data) };
      Auth.save(data);
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, error: '連不上伺服器，請檢查網路連線。' };
    }
  },

  /**
   * 自己註冊。role 只能是 farmer 或 buyer ——
   * 管理權限一律由超級管理員在後台指派，不讓註冊的人自己選。
   */
  async signUp(email, password, meta) {
    try {
      const r = await fetch(`${Auth.url}/auth/v1/signup`, {
        method: 'POST',
        headers: { apikey: Auth.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(email).trim(),
          password,
          data: {
            u:    meta.u,
            name: meta.name || '',
            org:  meta.org || '',
            phone: meta.phone || '',
            area: meta.area || '',
            role: meta.role === 'buyer' ? 'buyer' : 'farmer',
          },
        }),
      });
      const data = await r.json();
      if (!r.ok) return { ok: false, error: Auth.explain(data) };

      // 有開 Email 確認時，signup 不會直接給 session
      if (data.access_token) { Auth.save(data); return { ok: true, user: data.user }; }
      return { ok: true, user: data.user || data, needsConfirm: true };
    } catch (e) {
      return { ok: false, error: '連不上伺服器，請檢查網路連線。' };
    }
  },

  /**
   * 用 Google 登入。
   *
   * 走的是 OAuth 轉址：把人送到 Supabase 的 authorize 端點，
   * Supabase 再轉去 Google，使用者在 Google 自己的頁面上輸入密碼 ——
   * 密碼從頭到尾不會經過我們的網站，這正是 OAuth 的重點。
   * 回來時 token 掛在網址的 # 後面，由 catchOAuth() 接住。
   *
   * 要能用，必須先在 Supabase 後台把 Google provider 打開，
   * 並在 Google Cloud Console 建立 OAuth 用戶端。詳細步驟見 README。
   */
  signInWithGoogle(redirectTo) {
    const back = redirectTo || (location.origin + location.pathname);
    location.href = `${Auth.url}/auth/v1/authorize`
      + `?provider=google&redirect_to=${encodeURIComponent(back)}`;
  },

  /**
   * 接住 OAuth 轉回來時掛在網址 # 後面的 token。
   * 成功就存起來並把網址清乾淨（不要讓 token 留在網址列或瀏覽紀錄裡）。
   */
  catchOAuth() {
    const hash = location.hash || '';
    if (!hash.includes('access_token=') && !hash.includes('error=')) return null;

    const q = new URLSearchParams(hash.slice(1));
    // 先把網址清掉，避免 token 被記進瀏覽紀錄或被分享出去
    history.replaceState(null, '', location.pathname + location.search);

    if (q.get('error')) {
      return { ok: false, error: Auth.explain({ msg: q.get('error_description') || q.get('error') }) };
    }
    const token = q.get('access_token');
    if (!token) return null;

    Auth.save({
      access_token: token,
      refresh_token: q.get('refresh_token'),
      expires_in: Number(q.get('expires_in') || 3600),
      token_type: q.get('token_type') || 'bearer',
    });
    return { ok: true };
  },

  async signOut() {
    const t = await Auth.token();
    if (t) {
      fetch(`${Auth.url}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: Auth.key, Authorization: 'Bearer ' + t },
      }).catch(() => {});
    }
    Auth.save(null);
  },

  /** 目前登入者在 auth 裡的樣子（不是 users 表的側寫） */
  async me() {
    const t = await Auth.token();
    if (!t) return null;
    try {
      const r = await fetch(`${Auth.url}/auth/v1/user`, {
        headers: { apikey: Auth.key, Authorization: 'Bearer ' + t },
      });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  },

  /** 把 Supabase 的英文錯誤換成看得懂的中文 */
  explain(data) {
    const msg = String((data && (data.error_description || data.msg || data.message)) || '');
    if (/Invalid login credentials/i.test(msg)) return 'Email 或密碼不正確。';
    if (/Email not confirmed/i.test(msg))
      return ' 這個 Email 還沒完成驗證。請收信點確認連結，'
           + '或請管理員到 Supabase 後台把 Confirm email 關掉。';
    if (/User already registered|already been registered/i.test(msg))
      return '這個 Email 已經註冊過了，直接登入即可。';
    if (/Password should be at least/i.test(msg)) return '密碼太短，至少要 6 個字元。';
    if (/Signups not allowed|signup is disabled/i.test(msg))
      return '目前沒有開放自行註冊，請聯絡管理員替你開帳號。';
    if (/rate limit|too many/i.test(msg)) return '嘗試次數太多，請等幾分鐘再試。';
    if (/provider is not enabled|Unsupported provider/i.test(msg))
      return 'Google 登入還沒在 Supabase 後台啟用。請到 Authentication → Providers 打開 Google。';
    if (/access_denied|cancell?ed/i.test(msg)) return '你取消了 Google 登入。';
    return msg || '登入失敗，請再試一次。';
  },
};
