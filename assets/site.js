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

  // 預購表單（MVP 市場驗證版，尚未串接後端）
  document.querySelectorAll('form[data-mvp]').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      form.style.display = 'none';
      const ok = document.querySelector(form.dataset.mvp);
      if (ok) ok.style.display = 'block';
    });
  });
});
