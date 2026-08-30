/* ============================================================
   ROOTED FUTURES — 登入頁
   ------------------------------------------------------------
   ⚠️ 示範系統：沒有伺服器，帳號存在 localStorage，密碼為明文，
      因此畫面上明確要求不要使用真實密碼。
      驗證成功後把帳號寫進 sessionStorage，再跳轉到 dashboard.html。
   ============================================================ */

const SESSION = 'rf_app_session';

Store.onReady(() => {
  const gate = document.getElementById('auth');
  if (!gate) return;

  // 已經登入的話，不要無聲跳走 —— 直接跳轉會讓人按了「登入平台」
  // 卻莫名其妙被丟進後台。改成問一下要繼續還是換帳號。
  const already = sessionStorage.getItem(SESSION);
  if (already) {
    showAlreadySignedIn(already);
    return;
  }

  buildDrift();
  applyAuthMode();

  /* ---- 登入／註冊切換 ---- */
  document.querySelectorAll('[data-goto]').forEach(b =>
    b.addEventListener('click', () => {
      const to = b.dataset.goto;
      document.querySelectorAll('[data-gate]').forEach(p =>
        p.classList.toggle('on', p.dataset.gate === to));
      document.getElementById('form-title').textContent = to === 'login' ? '登入平台' : '建立帳號';
      document.getElementById('form-sub').textContent = to === 'login'
        ? '用你的帳號進入果農或收購商後台'
        : '選擇身分，馬上開始上架或認養果樹';
      document.querySelector('.auth-card').scrollTop = 0;
    }));

  /* ---- 登入 ---- */
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('login-err');
    const btn = e.target.querySelector('button[type="submit"]');
    const fail = msg => {
      err.textContent = msg;
      err.style.display = 'block';
      const card = document.querySelector('.auth-card');
      card.classList.remove('shake');
      void card.offsetWidth;                 // 重觸發動畫
      card.classList.add('shake');
    };

    if (Auth.on) {
      btn.disabled = true;
      const r = await Auth.signIn(
        document.getElementById('g-email').value,
        document.getElementById('g-pass').value);
      btn.disabled = false;
      if (!r.ok) return fail(r.error);

      // 登入成功後把 users 表的側寫抓回來，才知道這個人的角色
      const profile = await profileFor(r.user);
      if (!profile) {
        return fail('登入成功，但資料庫裡找不到對應的帳號資料。'
                  + '請管理員到 Supabase 跑一次 supabase-setup-v3.sql，'
                  + '或確認 users 表裡有這個 Email。');
      }
      err.style.display = 'none';
      return handoff(profile);
    }

    const user = Store.findUser(
      document.getElementById('g-user').value,
      document.getElementById('g-pass').value);
    if (!user) return fail('帳號或密碼不正確，請再確認一次。');
    err.style.display = 'none';
    handoff(user);
  });

  /* ---- 註冊 ---- */
  document.getElementById('reg-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, err = document.getElementById('reg-err');
    const u = f.u.value.trim();
    const fail = msg => { err.textContent = msg; err.style.display = 'block'; };

    if (!/^[A-Za-z0-9_]{3,20}$/.test(u)) return fail('帳號請用 3–20 個英數字或底線。');

    if (Auth.on) {
      const email = document.getElementById('r-email').value.trim();
      if (!email) return fail('請填 Email —— 登入時用的是 Email，不是帳號。');
      if (f.pass.value.length < 6) return fail('密碼至少要 6 個字元。');

      const btn = f.querySelector('button[type="submit"]');
      btn.disabled = true;
      const r = await Auth.signUp(email, f.pass.value, {
        u, name: f.name.value.trim(), org: f.org.value.trim(),
        phone: f.phone.value.trim(), area: f.area.value.trim(), role: f.role.value,
      });
      btn.disabled = false;
      if (!r.ok) return fail(r.error);

      if (r.needsConfirm) {
        err.style.display = 'none';
        return fail('帳號建好了，但這個 Supabase 專案開著 Email 驗證 —— '
                  + '請到信箱點確認連結之後再回來登入。');
      }
      // 側寫由資料庫的 trigger 建立，這裡等它一下再讀回來
      await new Promise(res => setTimeout(res, 600));
      const profile = await profileFor(r.user);
      err.style.display = 'none';
      return handoff(profile || { u, role: f.role.value, name: f.name.value.trim() }, true);
    }

    if (Store.userExists(u)) return fail('這個帳號已經有人用了，換一個試試。');
    err.style.display = 'none';

    const user = {
      u, pass: f.pass.value, role: f.role.value, perm: f.role.value,
      name: f.name.value.trim(), org: f.org.value.trim(),
      phone: f.phone.value.trim(), email: '', area: f.area.value.trim(),
    };
    Store.addUser(user);
    handoff(user, true);
  });
});

/* ---------- 轉場後跳轉 ---------- */
const ROLE_WORD = { admin: '平台管理員', farmer: '果農', buyer: '收購商' };

function handoff(user, isNew) {
  sessionStorage.setItem(SESSION, user.u);

  const box = document.getElementById('handoff');
  document.getElementById('handoff-text').textContent =
    `${isNew ? '帳號建立完成，' : ''}歡迎回來，${user.name}（${ROLE_WORD[user.role]}）`;

  document.getElementById('auth').classList.add('leaving');
  box.classList.add('on');

  /* 去哪裡：
       1. 網址指定的 next（他原本要去的地方）
       2. 沒指定就照角色 —— 溝通者與果農直接進溝通者平台，
          管理端才停在入口頁選要去哪 */
  const perm = user.perm || (user.role === 'admin' ? 'super' : user.role);
  const go = nextPage()
    || (['coord', 'farmer'].includes(perm) ? 'coordinator.html' : 'dashboard.html');

  // 讓進度條跑完再換頁，避免畫面瞬間閃動
  setTimeout(() => location.assign(go), 1100);
}

/* ---------- 背景飄浮的果實圖示 ---------- */
function buildDrift() {
  const box = document.getElementById('drift');
  if (!box || typeof CROP_ICON === 'undefined') return;

  const crops = ['dabai', 'durian', 'rambutan'];
  // 固定位置，不用亂數，避免每次載入跳動
  const spots = [
    [8, 18, 1.6, 0], [78, 12, 1.1, 2.5], [22, 72, 1.3, 1.2],
    [64, 60, 1.8, 3.4], [45, 32, 0.9, 4.1], [88, 78, 1.2, 2.0],
  ];
  box.innerHTML = spots.map(([x, y, s, d], i) =>
    `<span class="drift-i" style="left:${x}%;top:${y}%;transform:scale(${s});animation-delay:${d}s">
       ${CROP_ICON[crops[i % 3]]}
     </span>`).join('');
}


/* ============================================================
   Auth 模式的畫面調整
   ============================================================ */

/**
 * 依 config.js 的 AUTH_MODE 調整登入頁：
 * Auth 模式用 Email 登入、沒有「快速身分」那些捷徑，
 * 示範模式維持原本的帳號密碼。
 */
function applyAuthMode() {
  const on = typeof Auth !== 'undefined' && Auth.on;
  /* 有些元素（示範帳號提示、快速身分）已經拿掉了，
     這裡用安全存取，少了也不會整段停掉。 */
  const $ = id => document.getElementById(id) || { style:{}, dataset:{}, classList:{ toggle(){} } };

  $('fld-email').hidden = !on;
  $('fld-user').hidden  = on;
  $('g-email').required = on;
  $('g-user').required  = !on;
  $('fld-reg-email').hidden = !on;
  $('r-email').required = on;
  $('r-pass-hint').hidden = !on;

  if (on) {
    const cred = $('demo-cred');
    cred.hidden = false;
    cred.innerHTML =
      '🔐 <b>已啟用 Supabase Auth</b> —— 用你的 Email 與密碼登入。'
      + '密碼由伺服器加鹽雜湊保管，權限由資料庫強制執行。';
    /* 正式模式下密碼有雜湊保護，那句「明文儲存」的提醒就不該再出現 */
    const hint = $('pass-hint');
    if (hint.style) hint.textContent = '密碼由伺服器加鹽雜湊保管。忘記密碼請聯絡管理員重設。';
  }
  if (typeof I18N !== 'undefined') I18N.refresh(document.querySelector('.auth-card'));
}

/**
 * 登入後要去哪裡。
 *
 * 網址帶 ?next= 就回那一頁 —— 有人是先點「溝通者平台」撞到登入牆才來的，
 * 登入完應該回到他原本要去的地方，而不是丟到一個他沒要去的首頁。
 *
 * 只認白名單裡的頁面。直接吃網址參數會變成開放轉址：
 * 別人寄一條 app.html?next=https://釣魚網站 給你的果農，
 * 登入後就被送去假網站了。
 */
const NEXT_OK = ['coordinator.html', 'erp.html', 'dashboard.html', 'trees.html', 'index.html'];

function nextPage() {
  const n = new URLSearchParams(location.search).get('next');
  return NEXT_OK.includes(n) ? n : null;
}

/** 用 auth 使用者去 users 表撈側寫（角色、權限都在那裡） */
async function profileFor(authUser) {
  if (!authUser) return null;
  try {
    const token = await Auth.token();
    const r = await fetch(
      `${Auth.url}/rest/v1/users?select=*&or=(uid.eq.${authUser.id},email.eq.${encodeURIComponent(authUser.email)})&limit=1`,
      { headers: { apikey: Auth.key, Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!rows.length) return null;
    const p = rows[0];
    return { u: p.u, role: p.role, perm: p.perm, name: p.name,
             org: p.org, phone: p.phone, email: p.email, area: p.area };
  } catch (e) {
    console.warn('[讀取側寫失敗]', e.message);
    return null;
  }
}


/** 已經登入時顯示的畫面：讓人自己決定要進去還是換帳號。 */
function showAlreadySignedIn(username) {
  const user = (Store.read().users || []).find(x => x.u === username);
  const card = document.querySelector('.auth-card');
  if (!card) { location.replace('dashboard.html'); return; }

  const name = (user && user.name) || username;
  const perm = user && (user.perm || (user.role === 'admin' ? 'super' : user.role));
  const label = { super:'超級管理員', admin:'一般管理員', finance:'財務', editor:'編輯',
                  coord:'溝通者', farmer:'果農', buyer:'收購商' }[perm] || '';

  /* 兩個平台是分開的，權限也不一樣：
       TANJU Portal —— 管理用，訂單、客戶、金額、帳號權限都在這裡
       溝通者平台   —— 現場用，派工、樹況回報、採收標籤
     溝通者進不了 TANJU Portal，所以按角色只給他真正能進的入口。 */
  const portal = ['super', 'admin', 'finance', 'editor'].includes(perm);
  const onField = perm === 'coord' || perm === 'farmer';

  const doors = [];
  if (portal) {
    doors.push(['erp.html', 'TANJU Portal', '訂單、果樹、客戶、佣金與帳號權限', true]);
    doors.push(['coordinator.html', '溝通者平台', '現場派工、樹況回報與採收標籤', false]);
  } else if (onField) {
    doors.push(['coordinator.html', '溝通者平台',
      perm === 'farmer' ? '我的果樹、樹況回報與採收標籤' : '現場派工、樹況回報與採收標籤', true]);
  } else {
    doors.push(['dashboard.html', '進入我的後台', '', true]);
  }

  card.innerHTML = `
    <div class="signed-in">
      <h2 id="form-title">你已經登入了</h2>
      <p id="form-sub">目前的身分是 <b>${name}</b>${label ? `（${label}）` : ''}。</p>
      ${doors.length > 1 ? '<p class="signed-sub">選一個要進去的平台：</p>' : ''}
      <div class="door-row">
        ${doors.map(([href, title, desc, primary]) => `
          <a class="door ${primary ? 'primary' : ''}" href="${href}">
            <b>${title}</b>
            ${desc ? `<span>${desc}</span>` : ''}
          </a>`).join('')}
      </div>
      <div class="btn-row" style="justify-content:center;margin-top:18px">
        <button class="btn btn-outline" type="button" id="switch-user">換一個帳號</button>
      </div>
      <button class="btn-back" id="go-site">← 回官網</button>
    </div>`;

  document.getElementById('switch-user').addEventListener('click', async () => {
    sessionStorage.removeItem(SESSION);
    if (typeof Auth !== 'undefined' && Auth.on) await Auth.signOut();
    location.reload();
  });
  document.getElementById('go-site').addEventListener('click', () => {
    location.href = 'index.html';
  });
  if (typeof I18N !== 'undefined') I18N.apply(card);
}
