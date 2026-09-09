/* ============================================================
   用 Google 帳號登入（不需要後端）
   ------------------------------------------------------------
   走 Google Identity Services。和 Supabase 那條路的差別：

     Supabase OAuth —— 需要一個活著的 Supabase 專案，
                       client secret 由 Supabase 保管，
                       登入後拿 JWT，權限由資料庫的 RLS 強制執行。
     這一條        —— 只需要 Client ID（本來就公開），
                       純前端，Google 直接回一張簽好名的 ID token。

   為什麼先做這一條：專案的 Supabase 網域目前在 DNS 上查不到，
   那條路現在接不起來。這一條今天就能用，而且達成了「不要再存密碼」——
   我們這邊完全不保管任何密碼。

   要說清楚的限制：
     沒有伺服器就沒辦法驗證 ID token 的簽章，所以這是「證明你是誰」，
     不是「強制你只能做什麼」。懂技術的人一樣能改瀏覽器裡的 session ——
     這點和現在的示範模式一樣。等 Supabase 回來，把 AUTH_MODE 改成
     'supabase'，權限才會由資料庫那一層真的擋住。

   設定步驟見 GOOGLE-LOGIN.md。
   ============================================================ */

const GAuth = {
  /** 目前是不是走 Google 登入。config.js 沒填 Client ID 就不是。 */
  get on() {
    return typeof AUTH_MODE !== 'undefined' && AUTH_MODE === 'google'
        && typeof GOOGLE_CLIENT_ID !== 'undefined' && !!GOOGLE_CLIENT_ID;
  },

  get clientId() {
    return typeof GOOGLE_CLIENT_ID !== 'undefined' ? GOOGLE_CLIENT_ID : '';
  },

  /**
   * 解出 ID token 裡的內容。
   *
   * 這裡只做解碼，沒有驗章 —— 前端本來就驗不了（公鑰要跟 Google 拿、
   * 還要比對 aud / iss / exp，而且就算全做了，攻擊者也能直接改
   * sessionStorage 繞過去）。所以不假裝這是安全檢查，
   * 只是把 Google 回來的內容讀出來。
   */
  decode(jwt) {
    try {
      const body = jwt.split('.')[1];
      const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
      // atob 出來是 latin1，中文名字要再轉一次才不會變亂碼
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch (e) {
      console.warn('[Google 登入] token 解不開', e.message);
      return null;
    }
  },

  /** 把 Google 帳號對到系統裡的使用者。沒有的話就開一個最低權限的。 */
  linkUser(claim) {
    const email = String(claim.email || '').trim().toLowerCase();
    if (!email) return null;

    const db = Store.read();
    const found = (db.users || []).find(u =>
      String(u.email || '').trim().toLowerCase() === email);
    if (found) {
      /* 已經有帳號的話沿用它的角色 —— 除非它在 SUPER_EMAILS 名單上
         卻還不是超管（例如先用 Google 登入建了果農帳號，之後才把
         信箱加進名單）。那種情況直接補上去，不用再進後台改一次。 */
      const supers0 = (typeof SUPER_EMAILS !== 'undefined' ? SUPER_EMAILS : [])
        .map(e => String(e).trim().toLowerCase());
      if (supers0.includes(email) && found.perm !== 'super') {
        Store.setUserPerm(found.u, 'super');
        return { ...found, perm: 'super' };
      }
      return found;
    }

    /* config.js 的 SUPER_EMAILS 列出來的信箱，第一次登入就直接是超管。
       這是為了解決一個很容易踩的順序問題：貼上 Client ID 之後密碼欄位
       就不見了，如果那時候你的 Gmail 還沒對到任何管理員帳號，
       用 Google 登入只會拿到果農權限 —— 而且沒有密碼可以進去改。
       名單寫在專案裡、只有能推 code 的人改得動，和其他前端權限同一個信任層級。

       不在名單上的人一律開成果農 —— 權限最小的那個。
       要升成管理員由超級管理員在「帳號與權限」指派，
       不讓登入的人自己決定自己是誰。 */
    const supers = (typeof SUPER_EMAILS !== 'undefined' ? SUPER_EMAILS : [])
      .map(e => String(e).trim().toLowerCase());
    const isSuper = supers.includes(email);
    const base = email.split('@')[0].replace(/[^a-z0-9_]/gi, '').slice(0, 20).toLowerCase();
    let u = base || 'user';
    let i = 2;
    while (Store.userExists(u)) u = `${base}${i++}`;

    return Store.addUser({
      u,
      pass:  '',                       // 沒有密碼，登入完全靠 Google
      role:  isSuper ? 'admin'  : 'farmer',
      perm:  isSuper ? 'super'  : 'farmer',
      name:  claim.name || email.split('@')[0],
      org:   '',
      phone: '',
      email,
      area:  '',
      via:   'google',
    });
  },

  /** 載入 Google 的腳本。重複呼叫只會載一次。 */
  load() {
    if (GAuth._loading) return GAuth._loading;
    GAuth._loading = new Promise((res, rej) => {
      if (window.google?.accounts?.id) return res();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error('連不上 Google 的登入服務'));
      document.head.appendChild(s);
    });
    return GAuth._loading;
  },

  /**
   * 把 Google 的按鈕畫進 box 裡。
   * onUser(使用者) 會在登入成功、而且對到系統帳號之後被呼叫。
   */
  async render(box, onUser, onError) {
    await GAuth.load();
    google.accounts.id.initialize({
      client_id: GAuth.clientId,
      callback: resp => {
        const claim = GAuth.decode(resp.credential);
        if (!claim || !claim.email) {
          return onError('Google 沒有回傳 Email，請確認你選的帳號有 Email。');
        }
        /* email_verified 是 Google 自己標的。沒驗證過的 Email
           不該拿來當身分 —— 那代表 Google 也不確定這個信箱是他的。 */
        if (claim.email_verified === false) {
          return onError('這個 Google 帳號的 Email 還沒驗證，請先到 Google 完成驗證。');
        }
        const user = GAuth.linkUser(claim);
        if (!user) return onError('無法建立帳號，請再試一次。');
        onUser(user);
      },
    });

    box.innerHTML = '';
    google.accounts.id.renderButton(box, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'signin_with',
      logo_alignment: 'left',
      width: Math.min(box.clientWidth || 320, 400),
      locale: (typeof I18N !== 'undefined' && I18N.lang === 'ms') ? 'ms'
            : (typeof I18N !== 'undefined' && I18N.lang === 'en') ? 'en' : 'zh_TW',
    });
  },

  /** 登出。讓 Google 下次不要自動選同一個帳號。 */
  signOut() {
    try { window.google?.accounts?.id?.disableAutoSelect?.(); } catch (e) {}
  },
};
