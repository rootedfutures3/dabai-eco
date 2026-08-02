/* ============================================================
   ROOTED FUTURES — 登入頁
   ------------------------------------------------------------
   ⚠️ 示範系統：沒有伺服器，帳號存在 localStorage，密碼為明文，
      因此畫面上明確要求不要使用真實密碼。
      驗證成功後把帳號寫進 sessionStorage，再跳轉到 dashboard.html。
   ============================================================ */

const SESSION = 'rf_app_session';

document.addEventListener('DOMContentLoaded', () => {
  const gate = document.getElementById('auth');
  if (!gate) return;

  // 已登入就直接跳過登入頁
  if (sessionStorage.getItem(SESSION)) {
    location.replace('dashboard.html');
    return;
  }

  buildDrift();

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

  /* ---- 快速身分 ---- */
  document.querySelectorAll('[data-quick]').forEach(b =>
    b.addEventListener('click', () => {
      document.getElementById('g-user').value = b.dataset.quick;
      document.getElementById('g-pass').value = 'admin';
      document.getElementById('login-form').requestSubmit();
    }));

  /* ---- 登入 ---- */
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const err = document.getElementById('login-err');
    const user = Store.findUser(
      document.getElementById('g-user').value,
      document.getElementById('g-pass').value);

    if (!user) {
      err.textContent = '帳號或密碼不正確。預設帳號 admin、密碼 admin。';
      err.style.display = 'block';
      document.querySelector('.auth-card').classList.remove('shake');
      void document.querySelector('.auth-card').offsetWidth;   // 重觸發動畫
      document.querySelector('.auth-card').classList.add('shake');
      return;
    }
    err.style.display = 'none';
    handoff(user);
  });

  /* ---- 註冊 ---- */
  document.getElementById('reg-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, err = document.getElementById('reg-err');
    const u = f.u.value.trim();

    if (!/^[A-Za-z0-9_]{3,20}$/.test(u)) {
      err.textContent = '帳號請用 3–20 個英數字或底線。';
      err.style.display = 'block'; return;
    }
    if (Store.userExists(u)) {
      err.textContent = '這個帳號已經有人用了，換一個試試。';
      err.style.display = 'block'; return;
    }
    err.style.display = 'none';

    const user = {
      u, pass: f.pass.value, role: f.role.value,
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

  // 讓進度條跑完再換頁，避免畫面瞬間閃動
  setTimeout(() => location.assign('dashboard.html'), 1100);
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
