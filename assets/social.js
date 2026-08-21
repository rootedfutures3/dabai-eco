/* ============================================================
   社群一鍵發文（Social Composer）
   ------------------------------------------------------------
   做什麼：從平台的真實資料（果樹、訂單、產品）生成四個平台各自
   合適的文案，一鍵複製 + 開啟該平台的發文視窗，並把這筆貼文寫進
   資料庫（Supabase 的 posts 表）。

   為什麼不是全自動代發：
     Facebook / Instagram 要 Meta Graph API 的 Page Access Token，
     YouTube 要 OAuth 2.0 refresh token，兩者都必須放在伺服器上，
     而且要通過平台的 App Review。小紅書沒有公開的發文 API。
     這是靜態網站，沒有地方藏金鑰 —— 所以誠實做成「半自動」。

   之後要接真的自動發布：在 assets/config.js 設定 PUBLISH_ENDPOINT，
   本檔會改走 POST 到那個網址（見 publish()）。
   ============================================================ */

const CHANNELS = {
  facebook: {
    name: 'Facebook', icon: '📘', limit: 2000,
    /* sharer 只保證帶得動連結，內文一律靠剪貼簿 */
    composer: u => 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(u),
    hint: '貼文視窗開啟後，Ctrl/⌘+V 貼上文案',
  },
  instagram: {
    name: 'Instagram', icon: '📸', limit: 2200,
    composer: () => 'https://www.instagram.com/',
    hint: 'IG 的圖文發布只能在手機 App 或 Meta Business Suite 完成',
  },
  youtube: {
    name: 'YouTube', icon: '▶️', limit: 5000,
    composer: () => 'https://studio.youtube.com/',
    hint: '用於社群貼文或 Shorts 說明欄',
  },
  rednote: {
    name: '小紅書', icon: '📕', limit: 1000,
    composer: () => 'https://creator.xiaohongshu.com/publish/publish',
    hint: '標題建議 20 字以內，正文重點放前三行',
  },
};

const POST_CROP = {
  dabai:    { zh:'Dabai 黑橄欖', en:'Dabai (Sarawak black olive)', ms:'Dabai (buah zaitun hitam Sarawak)' },
  durian:   { zh:'榴槤',         en:'Durian',                      ms:'Durian' },
  rambutan: { zh:'紅毛丹',       en:'Rambutan',                    ms:'Rambutan' },
};

const SITE = 'https://rootedfutures3.github.io/dabai-eco/';

/* 產品題材（對應 products.html 的品項） */
const PRODUCTS = [
  { id:'fresh',  zh:'產季限定生鮮 Dabai', en:'Fresh seasonal Dabai',  ms:'Dabai segar bermusim',
    zhBody:'產季限定，長屋契作直採，冷鏈配送。附上「泡 60–70°C 熱水 10 分鐘」的正確吃法指南，第一次吃也不會踩雷。',
    enBody:'Season-limited, sourced straight from longhouse growers, cold-chain delivered. Comes with the soaking guide so your first Dabai tastes the way it should.',
    msBody:'Terhad ikut musim, terus daripada penanam rumah panjang, penghantaran rantaian sejuk. Disertakan panduan rendam supaya rasa pertama anda betul.' },
  { id:'kuaci',  zh:'Dabai Kuaci 果核零嘴', en:'Dabai Kuaci roasted seeds', ms:'Dabai Kuaci biji panggang',
    zhBody:'過去被丟棄的果核，烘焙成香脆涮嘴的堅果零食 —— 把廢棄物變成高毛利產品的最佳示範。',
    enBody:'The seed everyone used to throw away, roasted into a crisp, moreish snack. Waste turned into the highest-margin line we make.',
    msBody:'Biji yang dulu dibuang, dipanggang jadi snek rangup. Sisa bertukar menjadi produk paling menguntungkan kami.' },
  { id:'paste',  zh:'Dabai Paste 黑橄欖抹醬', en:'Dabai Paste', ms:'Dabai Paste',
    zhBody:'滑順濃郁的黑橄欖抹醬，突破生鮮保存限制，讓不在產地的人也吃得到砂拉越的味道。',
    enBody:'A smooth, savoury spread that outlives the short fresh season — Sarawak flavour that travels.',
    msBody:'Sapuan lembut dan pekat yang mengatasi musim pendek buah segar — rasa Sarawak yang boleh dibawa jauh.' },
  { id:'gift',   zh:'企業永續禮盒', en:'Corporate sustainability gift box', ms:'Kotak hadiah lestari korporat',
    zhBody:'結合葉材循環包裝、產品組合與社區故事卡，滿足企業永續採購與節慶送禮的雙重需求。',
    enBody:'Leaf-based circular packaging, a curated product set and a community story card — built for corporate sustainable procurement.',
    msBody:'Pembungkusan kitaran daripada daun, set produk terpilih dan kad cerita komuniti — untuk perolehan lestari korporat.' },
];

/* ---------- 文案生成 ---------- */

const TAGS = {
  zh: '#Dabai #黑橄欖 #砂拉越 #包樹認養 #永續農業 #TANJU #根築新局',
  en: '#Dabai #Sarawak #Borneo #AdoptATree #Sustainable #ZeroWaste #TANJU',
  ms: '#Dabai #Sarawak #Borneo #AngkatSePokok #Lestari #TANJU',
};

/** 依題材整理出一組素材，再由各平台各自組裝。 */
function material(topic, id, lang) {
  const db = Store.read();
  const L = s => s[lang] || s.zh;

  if (topic === 'tree') {
    const t = Store.treeList().find(x => x.id === id);
    if (!t) return null;
    const crop = L(POST_CROP[t.crop] || POST_CROP.dabai);
    const rpt = (db.reports || []).filter(r => r.treeId === t.id).slice(-1)[0];
    return {
      key: t.id,
      headline: { zh:`${t.id}｜${t.age} 年生的${crop}`,
                  en:`${t.id} — a ${t.age}-year-old ${crop}`,
                  ms:`${t.id} — pokok ${crop} berusia ${t.age} tahun` }[lang],
      facts: {
        zh:[`果園：${t.orchard}（${t.area}）`, `果農：${t.farmer}`,
            `樹齡 ${t.age} 年 · 預估產量 ${t.kg} 公斤`, `認養金 RM ${t.price}`],
        en:[`Orchard: ${t.orchard}, ${t.area}`, `Grower: ${t.farmer}`,
            `${t.age} years old · est. ${t.kg} kg`, `Adoption RM ${t.price}`],
        ms:[`Dusun: ${t.orchard}, ${t.area}`, `Petani: ${t.farmer}`,
            `${t.age} tahun · anggaran ${t.kg} kg`, `Angkat RM ${t.price}`],
      }[lang],
      story: rpt
        ? { zh:`溝通者最近一次回報：${rpt.stage}，樹況${rpt.health}。${rpt.note}`,
            en:`Latest field report: ${rpt.stage}, condition ${rpt.health}. ${rpt.note}`,
            ms:`Laporan lapangan terkini: ${rpt.stage}, keadaan ${rpt.health}. ${rpt.note}` }[lang]
        : { zh:'這棵樹是祖先種下的老欉，現在有了自己的編號、自己的檔案。',
            en:'An old tree planted by a previous generation — now with its own ID and its own record.',
            ms:'Pokok tua yang ditanam generasi terdahulu — kini ada nombor dan failnya sendiri.' }[lang],
      link: SITE + 'trees.html',
    };
  }

  if (topic === 'order') {
    const o = (db.orders || []).find(x => x.no === id);
    if (!o) return null;
    const t = Store.treeList().find(x => x.id === o.treeId) || {};
    const crop = L(POST_CROP[o.crop] || POST_CROP.dabai);
    const sp = Store.split(o);
    return {
      key: o.treeId,
      headline: { zh:`${o.treeId} 被認養了`,
                  en:`${o.treeId} has been adopted`,
                  ms:`${o.treeId} telah diangkat` }[lang],
      facts: {
        zh:[`作物：${crop}`, `果園：${t.orchard || '—'}`,
            `果農這一筆實拿 RM ${sp.farmer}（合約 RM ${sp.amount} 的 ${100 - sp.rate}%）`,
            `其中 RM ${sp.deposit} 在開花前就先撥`],
        en:[`Crop: ${crop}`, `Orchard: ${t.orchard || '—'}`,
            `Grower receives RM ${sp.farmer} — ${100 - sp.rate}% of the RM ${sp.amount} contract`,
            `RM ${sp.deposit} of it lands before the tree even flowers`],
        ms:[`Tanaman: ${crop}`, `Dusun: ${t.orchard || '—'}`,
            `Petani terima RM ${sp.farmer} — ${100 - sp.rate}% daripada kontrak RM ${sp.amount}`,
            `RM ${sp.deposit} sampai sebelum pokok berbunga`],
      }[lang],
      story: { zh:'認養不是捐款。錢在開花前到果農手上，收成整棵歸認養人 —— 兩邊都不用等中盤商開價。',
               en:'Adoption is not charity. The money arrives before flowering and the whole harvest goes to the adopter — neither side waits on a middleman’s price.',
               ms:'Mengangkat pokok bukan derma. Wang sampai sebelum berbunga, seluruh hasil untuk pengangkat — tiada siapa menunggu harga orang tengah.' }[lang],
      link: SITE + 'trees.html',
    };
  }

  if (topic === 'product') {
    const p = PRODUCTS.find(x => x.id === id) || PRODUCTS[0];
    return {
      key: p.id,
      headline: L({ zh:p.zh, en:p.en, ms:p.ms }),
      facts: {
        zh:['砂拉越 Song 產地直送', '長屋部落契作，收益回到社區', '全果利用，果肉果核果皮都有去處'],
        en:['Straight from Song, Sarawak', 'Contract-grown with longhouse communities', 'Whole-fruit use — flesh, seed and peel all find a home'],
        ms:['Terus dari Song, Sarawak', 'Kontrak tanam bersama komuniti rumah panjang', 'Guna seluruh buah — isi, biji dan kulit'],
      }[lang],
      story: L({ zh:p.zhBody, en:p.enBody, ms:p.msBody }),
      link: SITE + 'products.html',
    };
  }

  return {
    key: 'free',
    headline: { zh:'砂拉越的果子，值得更好的價錢',
                en:'Sarawak fruit deserves a better price',
                ms:'Buah Sarawak berhak dapat harga yang lebih baik' }[lang],
    facts: {
      zh:['一樹一碼，看得到果農與果園', '認養金在開花前直達果農', '農務顧問全程建檔，可稽核'],
      en:['One tree, one ID — grower and orchard visible', 'Adoption money reaches the grower before flowering', 'Every field visit logged and auditable'],
      ms:['Satu pokok, satu ID — petani dan dusun jelas', 'Wang sampai kepada petani sebelum berbunga', 'Setiap lawatan direkod dan boleh diaudit'],
    }[lang],
    story: { zh:'產季一到全部同時熟，價格崩盤、賣不掉就爛在樹上；另一頭的加工廠卻年年搶不到貨。問題不是產量，是連不起來。',
             en:'Everything ripens at once, prices collapse, fruit rots on the tree — while processors upstream cannot secure supply. The problem was never volume. It was connection.',
             ms:'Semua masak serentak, harga jatuh, buah reput di pokok — sementara kilang tidak dapat bekalan. Masalahnya bukan kuantiti, tetapi sambungan.' }[lang],
    link: SITE,
  };
}

/** 把素材組裝成某個平台的文案。每個平台的節奏不一樣。 */
function compose(channel, m, lang, tone) {
  const tags = TAGS[lang] || TAGS.zh;
  const bullets = m.facts.map(f => '· ' + f).join('\n');
  const cta = { zh:'看完整樹卡與果園檔案 → ', en:'See the full tree card → ', ms:'Lihat kad pokok penuh → ' }[lang];

  if (tone === 'short') {
    const punch = m.facts[0];
    if (channel === 'rednote')  return `${m.headline}\n\n${punch}\n${m.story.split(/[。.!！]/)[0]}。\n\n${cta}${m.link}\n${tags}`;
    if (channel === 'youtube')  return `${m.headline}\n\n${m.story}\n\n${m.link}`;
    return `${m.headline}\n\n${punch}\n\n${cta}${m.link}\n\n${tags}`;
  }

  if (channel === 'facebook') {
    const lead = tone === 'data'
      ? m.facts.join(' ｜ ')
      : m.story;
    return `${m.headline}\n\n${lead}\n\n${bullets}\n\n${cta}${m.link}\n\n${tags}`;
  }

  if (channel === 'instagram') {
    /* IG 前兩行決定有沒有人點「更多」，所以故事放最前面 */
    return `${m.story}\n\n${m.headline}\n${bullets}\n\n${cta}個人簡介連結\n.\n.\n${tags}`
      .replace('個人簡介連結', { zh:'個人簡介連結', en:'link in bio', ms:'pautan di bio' }[lang]);
  }

  if (channel === 'youtube') {
    return `${m.headline}\n\n${m.story}\n\n${bullets}\n\n${cta}${m.link}\n\n`
         + { zh:'TANJU 是 ROOTED FUTURES 根築新局在砂拉越 Song 經營的果樹媒合平台。',
             en:'TANJU is the orchard-matching platform run by ROOTED FUTURES in Song, Sarawak.',
             ms:'TANJU ialah platform padanan dusun oleh ROOTED FUTURES di Song, Sarawak.' }[lang]
         + `\n\n${tags}`;
  }

  /* 小紅書：短標題 + 分行短句 + 標籤在最後 */
  return `${m.headline}\n\n${m.story}\n\n${bullets}\n\n${cta}${m.link}\n${tags}`;
}

/* ---------- 發布 ---------- */

/**
 * 有設定 PUBLISH_ENDPOINT 就真的送去後端代發；
 * 沒有就走半自動：複製到剪貼簿 + 開啟該平台的發文視窗。
 */
async function publish(channel, text, post) {
  const ep = (typeof PUBLISH_ENDPOINT !== 'undefined' && PUBLISH_ENDPOINT) || '';
  if (ep) {
    const r = await fetch(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, text, topic: post.topic, topicId: post.topicId }),
    });
    if (!r.ok) throw new Error(`代發失敗（${r.status}）`);
    const data = await r.json().catch(() => ({}));
    return { mode: 'auto', link: data.link || '' };
  }

  await copy(text);
  window.open(CHANNELS[channel].composer(SITE), '_blank', 'noopener');
  return { mode: 'manual', link: '' };
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    /* 沒有剪貼簿權限（非 https 或使用者拒絕）時的退路 */
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/* ============================================================
   ERP 介面接線
   ============================================================ */

let POSTS_DRAFT = {};   // channel -> 目前顯示的文案

function renderSocial() {
  const wrap = document.getElementById('po-cards');
  if (!wrap) return;

  fillSubjects();
  renderPostLog();

  const topic = document.getElementById('po-topic');
  if (!topic.dataset.bound) {
    topic.dataset.bound = '1';
    topic.addEventListener('change', () => { fillSubjects(); document.getElementById('po-cards').innerHTML = ''; });
    document.getElementById('po-gen').addEventListener('click', generate);
    wrap.addEventListener('click', onCardClick);
  }
}

/** 「對象」下拉的內容跟著「題材」變 */
function fillSubjects() {
  const topic = document.getElementById('po-topic').value;
  const sel   = document.getElementById('po-subject');
  const db    = Store.read();
  let opts = [];

  if (topic === 'tree') {
    opts = Store.treeList().map(t => [t.id, `${t.id} · ${t.orchard}（${t.farmer}）`]);
  } else if (topic === 'order') {
    opts = (db.orders || []).map(o => [o.no, `${o.no} · ${o.treeId} · ${o.customer}`]).reverse();
  } else if (topic === 'product') {
    opts = PRODUCTS.map(p => [p.id, p.zh]);
  } else {
    opts = [['free', '平台總體介紹']];
  }

  sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')
                || '<option value="">（沒有資料）</option>';
}

function generate() {
  const topic = document.getElementById('po-topic').value;
  const id    = document.getElementById('po-subject').value;
  const lang  = document.getElementById('po-lang').value;
  const tone  = document.getElementById('po-tone').value;

  const m = material(topic, id, lang);
  const wrap = document.getElementById('po-cards');
  if (!m) { wrap.innerHTML = '<p class="dim">找不到這個對象的資料。</p>'; return; }

  POSTS_DRAFT = {};
  wrap.innerHTML = Object.entries(CHANNELS).map(([key, ch]) => {
    const text = compose(key, m, lang, tone);
    POSTS_DRAFT[key] = { text, topic, topicId: id, lang };
    const over = text.length > ch.limit;
    return `
      <div class="post-card" data-ch="${key}">
        <div class="post-head">
          <b>${ch.icon} ${ch.name}</b>
          <span class="post-count ${over ? 'over' : ''}">${text.length} / ${ch.limit}</span>
        </div>
        <textarea class="post-body" rows="9" spellcheck="false">${esc(text)}</textarea>
        <p class="post-hint">${ch.hint}</p>
        <div class="post-acts">
          <button class="mini-btn" data-act="copy">複製文案</button>
          <button class="mini-btn primary" data-act="publish">一鍵發布</button>
          <span class="post-msg"></span>
        </div>
      </div>`;
  }).join('');

  /* 使用者手改文案時，字數即時重算 */
  wrap.querySelectorAll('.post-body').forEach(ta => {
    ta.addEventListener('input', () => {
      const card = ta.closest('.post-card');
      const ch   = CHANNELS[card.dataset.ch];
      const c    = card.querySelector('.post-count');
      c.textContent = `${ta.value.length} / ${ch.limit}`;
      c.classList.toggle('over', ta.value.length > ch.limit);
      POSTS_DRAFT[card.dataset.ch].text = ta.value;
    });
  });
}

async function onCardClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const card = btn.closest('.post-card');
  const key  = card.dataset.ch;
  const d    = POSTS_DRAFT[key];
  const msg  = card.querySelector('.post-msg');
  const say  = (t, bad) => { msg.textContent = t; msg.className = 'post-msg' + (bad ? ' bad' : ' ok'); };

  if (btn.dataset.act === 'copy') {
    await copy(d.text);
    say('已複製到剪貼簿');
    return;
  }

  if (d.text.length > CHANNELS[key].limit
      && !confirm(`文案超過 ${CHANNELS[key].name} 的 ${CHANNELS[key].limit} 字上限，還是要繼續嗎？`)) return;

  const post = {
    at: stamp(), channel: key, topic: d.topic, topicId: d.topicId, lang: d.lang,
    title: d.text.split('\n')[0].slice(0, 60),
    body: d.text, tags: (d.text.match(/#[^\s#]+/g) || []).join(' '),
    status: '草稿', link: '', scheduled: '',
  };

  btn.disabled = true;
  try {
    const r = await publish(key, d.text, post);
    post.status = r.mode === 'auto' ? '已發布' : '已複製 · 待貼上';
    post.link = r.link;
    Store.addPost(post);
    say(r.mode === 'auto' ? '已透過後端發布' : '文案已複製，發文視窗已開啟');
    renderPostLog();
  } catch (err) {
    say('發布失敗：' + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

function renderPostLog() {
  const el = document.getElementById('t-posts');
  if (!el) return;
  const rows = [...(Store.read().posts || [])].reverse().map(p => [
    p.at || '—',
    `${(CHANNELS[p.channel] || {}).icon || ''} ${(CHANNELS[p.channel] || {}).name || p.channel}`,
    `<span class="pill">${p.topicId || p.topic}</span>`,
    (p.lang || 'zh').toUpperCase(),
    esc((p.title || '').slice(0, 40)),
    `<span class="badge-${p.status === '已發布' ? 'ok' : 'wait'}">${p.status || '草稿'}</span>`,
    p.link ? `<a href="${p.link}" target="_blank" rel="noopener">開啟</a>` : '—',
  ]);
  el.innerHTML = table(['時間', '平台', '題材', '語言', '標題', '狀態', '連結'], rows);
}

function stamp() {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}
