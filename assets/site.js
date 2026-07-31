/* ============================================================
   ⚙️ 表單設定 —— 要讓預購表單真的收到資料，改這一行就好
   ------------------------------------------------------------
   1. 到 https://formspree.io 用你的 Gmail 註冊（免費方案每月 50 筆）
   2. 建立一個新表單，它會給你一個像這樣的網址：
        https://formspree.io/f/xabcdefg
   3. 把那串網址整個貼進下面的引號裡，存檔後跑 ./deploy.sh

   留空的話，表單會誠實告訴訪客「登記尚未開放」，
   而不是假裝收到資料。
   ============================================================ */
const FORM_ENDPOINT = '';


// 進場動畫（漸進增強：JS 不可用時內容照常顯示）
document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); }
    });
  }, { threshold: .1 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // 手機版選單
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  document.querySelectorAll('form[data-preorder]').forEach(initPreorderForm);
});

function initPreorderForm(form) {
  const okBox  = document.querySelector(form.dataset.preorder);
  const errBox = document.querySelector(form.dataset.error);
  const button = form.querySelector('button[type="submit"]');
  const label  = button ? button.textContent : '';

  const showError = msg => {
    if (!errBox) return;
    errBox.textContent = msg;
    errBox.style.display = 'block';
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (errBox) errBox.style.display = 'none';

    // 蜜罐欄位：真人看不到，機器人會填
    if (form.querySelector('[name="_gotcha"]')?.value) return;

    if (!FORM_ENDPOINT) {
      showError('預購登記系統尚未開放，我們正在準備中。請稍後再回來，或直接透過上方的合作管道與我們聯繫。');
      return;
    }

    if (button) { button.disabled = true; button.textContent = '送出中…'; }

    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.errors?.map(x => x.message).join('、') || `伺服器回應 ${res.status}`);
      }

      form.style.display = 'none';
      if (okBox) okBox.style.display = 'block';
      okBox?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    } catch (err) {
      showError(`送出失敗：${err.message}。請稍後再試一次。`);
      if (button) { button.disabled = false; button.textContent = label; }
    }
  });
}
