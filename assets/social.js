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

/** 取得已綁定的帳號設定（config.js）。沒設定就回空物件，不要炸掉。 */
function acct(key) {
  return (typeof SOCIAL_ACCOUNTS !== 'undefined' && SOCIAL_ACCOUNTS[key]) || {};
}

const CHANNELS = {
  facebook: {
    name: 'Facebook', icon: '📘', limit: 2000,
    /* 直接開 Meta Business Suite 的發文視窗，而且指定我們自己的粉專。
       原本開的是通用的 sharer.php，還要自己找粉專、還不能同時發 IG。
       Business Suite 的 composer 可以一次勾選粉專和 IG。 */
    composer() {
      const id = acct('facebook').pageId;
      return id
        ? `https://business.facebook.com/latest/composer/?asset_id=${id}`
        : 'https://business.facebook.com/latest/composer/';
    },
    open: () => acct('facebook').url || 'https://www.facebook.com/',
    hint: '會開啟 Business Suite 的發文視窗，可以同時勾選粉專與 IG',
  },
  instagram: {
    name: 'Instagram', icon: '📸', limit: 2200,
    /* IG 網頁版不能發圖文，所以一樣送去 Business Suite；
       手機上則走系統的分享面板（見 publish()）。 */
    composer() {
      const id = acct('facebook').pageId;
      return id
        ? `https://business.facebook.com/latest/composer/?asset_id=${id}`
        : 'https://www.instagram.com/';
    },
    open: () => acct('instagram').url || 'https://www.instagram.com/',
    hint: '手機用分享面板最快；桌機走 Business Suite（IG 網頁版不能發圖文）',
  },
  youtube: {
    name: 'YouTube', icon: '▶️', limit: 5000,
    composer() {
      const id = acct('youtube').channelId;
      return id
        ? `https://studio.youtube.com/channel/${id}/posts`
        : 'https://studio.youtube.com/';
    },
    open: () => acct('youtube').url || 'https://www.youtube.com/',
    hint: '用於社群貼文或 Shorts 說明欄',
  },
  rednote: {
    name: '小紅書', icon: '📕', limit: 1000,
    composer: () => 'https://creator.xiaohongshu.com/publish/publish',
    open: () => acct('rednote').url || 'https://www.xiaohongshu.com/',
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
      body: JSON.stringify({
        channel, text,
        /* IG 規定貼文一定要有圖，純文字發不了。
           先用網站上那張 Dabai 照片當預設，之後有產品照再換。 */
        imageUrl: postImage(post),
        topic: post.topic, topicId: post.topicId,
        key: (typeof PUBLISH_KEY !== 'undefined' && PUBLISH_KEY) || '',
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      /* 把後端的原話帶出來 —— 「代發失敗（502）」對使用者沒有幫助，
         「Meta API：權限不足」才知道下一步要做什麼。 */
      throw new Error(data.error || `代發失敗（${r.status}）`);
    }
    return { mode: 'auto', link: data.link || '' };
  }

  /* 手機上先試原生分享 —— 圖片和文案一起交給 IG / FB 的 App，
     比「複製再貼上」少一半步驟，也不會漏掉圖。 */
  if (canShareFiles()) {
    try {
      await copy(text);                 // 先複製，分享面板沒帶到文字時還有得貼
      return await shareNative(text);
    } catch (e) {
      /* 使用者按取消也會走到這裡，不當成錯誤，退回原本的方式 */
    }
  }

  await copy(text);
  window.open(CHANNELS[channel].composer(), '_blank', 'noopener');
  return { mode: 'manual', link: '' };
}

/** 這篇貼文要配哪張圖。之後有產品照，改這裡就好。 */
function postImage(post) {
  const base = SITE + 'assets/img/photo/';
  return base + 'dabai-square.jpg';
}

/* ============================================================
   沒有 API 時的最快路徑
   ------------------------------------------------------------
   Meta 的 App Review 要跑幾天到兩週。在那之前，最接近「一鍵」的
   合法做法是手機的原生分享 —— 把圖片和文案交給系統的分享面板，
   使用者選 Instagram / Facebook，App 會自己帶入內容。
   兩下就發完，而且完全不碰帳號密碼、不違反任何條款。

   刻意不做的事：用無頭瀏覽器模擬登入去點「發布」。
   那違反 Meta 的服務條款（帳號會被停權），而且要把密碼存起來。
   為了省兩下點擊冒這種險並不值得。
   ============================================================ */

/** 這台裝置能不能用原生分享面板送出圖片 */
function canShareFiles() {
  return typeof navigator !== 'undefined'
      && navigator.canShare
      && navigator.share;
}

/**
 * 交給系統的分享面板。
 * 帶得動圖片就一起帶（IG 需要圖），帶不動就只送文字。
 */
async function shareNative(text) {
  const payload = { text };

  try {
    const url = postImage({});
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      const file = new File([blob], 'tanju-dabai.jpg', { type: blob.type || 'image/jpeg' });
      if (navigator.canShare({ files: [file] })) payload.files = [file];
    }
  } catch (e) {
    /* 拿不到圖就只分享文字 —— 總比整個失敗好 */
  }

  await navigator.share(payload);
  return { mode: 'share' };
}

/** 把圖片存成檔案，配合已複製的文案，桌機上用這個 */
async function downloadImage() {
  const url = postImage({});
  const res = await fetch(url);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tanju-dabai.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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
  renderConnections();
  renderAccountBar();
  initCalendar();

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
          <button class="mini-btn" data-act="image">下載配圖</button>
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

  if (btn.dataset.act === 'image') {
    try { await downloadImage(); say('配圖已下載'); }
    catch (e) { say('下載失敗：' + e.message, true); }
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
    post.status = { auto:'已發布', share:'已送出分享' }[r.mode] || '已複製 · 待貼上';
    post.link = r.link;
    Store.addPost(post);
    say({
      auto:  '已透過後端發布',
      share: '已交給手機的分享面板，選 App 就送出',
    }[r.mode] || '文案已複製，發文視窗已開啟');
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

/* ============================================================
   帳號綁定
   ------------------------------------------------------------
   這一區告訴你：每個平台現在能不能真的自動發文、還差什麼。

   ⚠️ 這裡「不」收任何金鑰。
      Facebook 的 Page Access Token、YouTube 的 refresh token —— 這些
      東西一旦寫進前端，任何人打開原始碼就拿得到，等於把你的粉專
      交給陌生人。它們必須放在伺服器的環境變數裡。

      所以這一區只做兩件事：顯示狀態、告訴你下一步該做什麼。
      真正的金鑰在你部署的後端（見 tools/publish-worker.js）。
   ============================================================ */

const CONN_STEPS = {
  facebook: {
    name: 'Facebook 粉絲專頁',
    needs: [
      '在 Meta for Developers 建立一個 App',
      '把粉專加進 App，取得長效的 Page Access Token',
      '申請 pages_manage_posts 權限並通過 App Review（幾天到兩週）',
    ],
    envs: ['FB_PAGE_ID', 'FB_PAGE_TOKEN'],
    doc: 'https://developers.facebook.com/docs/pages-api/posts',
  },
  instagram: {
    name: 'Instagram 商業帳號',
    needs: [
      'IG 帳號要轉成「商業帳號」並連到那個粉專',
      '用同一個 Meta App 取得 IG Business Account ID',
      '申請 instagram_content_publish 權限',
      '注意：IG 發圖文一定要有圖片網址，純文字發不了',
      'IG Business Account ID 不用手動找，後端會用粉專 token 自動查',
    ],
    envs: ['IG_USER_ID', 'FB_PAGE_TOKEN'],
    doc: 'https://developers.facebook.com/docs/instagram-api/guides/content-publishing',
  },
  youtube: {
    name: 'YouTube 社群貼文',
    needs: [
      '在 Google Cloud Console 建立 OAuth 用戶端',
      '用你的頻道授權一次，換到 refresh token',
      '社群貼文 API 目前只開放部分頻道，影片上傳則是公開的',
    ],
    envs: ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN'],
    doc: 'https://developers.google.com/youtube/v3/docs',
  },
  rednote: {
    name: '小紅書',
    needs: [
      '目前沒有公開的發文 API',
      '只能用「複製文案 + 開啟發文視窗」的半自動方式',
      '若之後開放，補上 XHS_TOKEN 即可',
    ],
    envs: [],
    doc: '',
    manualOnly: true,
  },
};

function renderConnections() {
  const box = document.getElementById('conn-grid');
  if (!box) return;

  const ep = (typeof PUBLISH_ENDPOINT !== 'undefined' && PUBLISH_ENDPOINT) || '';
  const acc = (typeof SOCIAL_ACCOUNTS !== 'undefined' && SOCIAL_ACCOUNTS) || {};
  const note = document.getElementById('conn-note');

  box.innerHTML = Object.entries(CONN_STEPS).map(([key, c]) => {
    const ch = CHANNELS[key];
    const a = acc[key] || {};
    const state = c.manualOnly ? 'manual' : (ep ? 'ready' : 'pending');
    const label = { ready:'後端已設定', pending:'審核中 · 先用半自動', manual:'只能半自動' }[state];

    return `
      <div class="conn ${state}">
        <div class="conn-top">
          <b>${ch.icon} ${c.name}</b>
          <span class="conn-badge ${state}">${label}</span>
        </div>
        ${a.url
          ? `<p class="conn-acct">已開好：
               <a href="${a.url}" target="_blank" rel="noopener">
                 ${a.handle ? '@' + a.handle : (a.pageId || a.channelId || '看帳號')}
               </a></p>`
          : '<p class="conn-acct dim">帳號尚未建立</p>'}
        <ol class="conn-steps">
          ${c.needs.map(n => `<li>${n}</li>`).join('')}
        </ol>
        ${c.envs.length
          ? `<p class="conn-env">後端環境變數：${c.envs.map(e => `<code>${e}</code>`).join('　')}</p>`
          : ''}
        ${c.doc ? `<a class="conn-doc" href="${c.doc}" target="_blank" rel="noopener">官方文件 →</a>` : ''}
      </div>`;
  }).join('');

  note.innerHTML = ep
    ? `目前的發布後端：<code>${ep}</code>。
       按「一鍵發布」會把文案送到那裡，由後端拿著金鑰去呼叫各平台的 API。`
    : `<b>API 還在審核，這段期間有兩條路：</b>
       <br><br>
       <b>① 手機上按「一鍵發布」</b> —— 會把配圖和文案一起交給手機的分享面板，
       選 Instagram 或 Facebook，App 會自己帶入內容，兩下就發完。
       這是沒有 API 時最快的合法做法。
       <br><br>
       <b>② 用 Meta Business Suite 排程</b> —— Meta 官方的免費工具，
       不需要 API、不需要審核，可以一次排好一週的貼文，
       同時發到粉專和 IG。下面的「排程表」可以匯出成 CSV 帶過去。
       <br><br>
       <span class="dim">關於「用程式自動登入去發文」：那違反 Meta 的服務條款，
       帳號會被停權，而且要把密碼存起來。我們不做那個。</span>`;
}

/* ============================================================
   排程表
   ------------------------------------------------------------
   API 還在審核時最實際的做法：一次把一週的內容排好，
   匯出 CSV 帶到 Meta Business Suite 的規劃工具上傳。
   那是 Meta 自己的免費工具，不需要 API 也不需要審核。

   內容從平台的真實資料輪流取材 —— 樹、產品、平台介紹交替，
   免得連續七天都在講同一件事。
   ============================================================ */

let CAL_ROWS = [];

function initCalendar() {
  const gen = document.getElementById('cal-gen');
  if (!gen || gen.dataset.bound) return;
  gen.dataset.bound = '1';

  const d = new Date();
  document.getElementById('cal-start').value =
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  gen.addEventListener('click', buildCalendar);
  document.getElementById('cal-csv').addEventListener('click', exportCalendarCsv);
  buildCalendar();
}

function buildCalendar() {
  const start = document.getElementById('cal-start').value;
  const days  = Number(document.getElementById('cal-days').value || 7);
  if (!start) return;

  const trees = Store.treeList().filter(t => t.crop === 'dabai');
  const orders = (Store.read().orders || []);

  /* 題材輪流，不要連續幾天都在講同一種事 */
  const plan = [];
  for (let i = 0; i < days; i++) {
    const kind = ['tree', 'product', 'free', 'tree', 'order', 'product', 'free'][i % 7];
    let id = 'free';
    if (kind === 'tree')    id = trees.length ? trees[i % trees.length].id : 'free';
    if (kind === 'product') id = PRODUCTS[i % PRODUCTS.length].id;
    if (kind === 'order')   id = orders.length ? orders[i % orders.length].no : 'free';
    plan.push({ kind: (kind === 'order' && !orders.length) ? 'free' : kind, id });
  }

  const base = new Date(start + 'T09:00:00');
  CAL_ROWS = plan.map((p, i) => {
    const day = new Date(base.getTime() + i * 86400000);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    /* 早上九點與晚上八點交替 —— 砂拉越的兩個上網高峰 */
    const time = i % 2 ? '20:00' : '09:00';
    const m = material(p.kind, p.id, 'zh');
    const text = m ? compose('facebook', m, 'zh', 'warm') : '';
    return {
      date, time,
      topic: { tree:'果樹', product:'產品', order:'認養捷報', free:'平台介紹' }[p.kind],
      subject: p.id,
      title: text.split('\n')[0],
      text,
    };
  });

  const el = document.getElementById('t-calendar');
  el.innerHTML = table(
    ['日期', '時間', '題材', '對象', '文案開頭'],
    CAL_ROWS.map(r => [
      `<b>${r.date}</b>`, r.time,
      `<span class="pill">${r.topic}</span>`,
      esc(r.subject),
      `<span class="dim">${esc(r.title.slice(0, 34))}…</span>`,
    ]));
}

/**
 * 匯出 CSV。欄位順序照 Meta Business Suite 大量上傳的格式，
 * 並且加 BOM —— 沒有 BOM 的話，Excel 開中文會變亂碼。
 */
function exportCalendarCsv() {
  if (!CAL_ROWS.length) return;
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['Date', 'Time', 'Topic', 'Subject', 'Caption', 'Image URL'];
  const lines = [head.join(',')].concat(
    CAL_ROWS.map(r => [
      r.date, r.time, r.topic, r.subject, r.text, postImage({}),
    ].map(esc).join(',')));

  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tanju-排程-${CAL_ROWS[0].date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ============================================================
   帳號快捷列
   ------------------------------------------------------------
   把已經綁好的帳號放在最上面，一鍵打開粉專／IG／頻道，
   或直接跳到那個帳號的發文視窗。
   不用再自己開分頁、找粉專、切帳號。
   ============================================================ */
function renderAccountBar() {
  const box = document.getElementById('acct-bar');
  if (!box) return;

  const rows = Object.entries(CHANNELS)
    .map(([key, ch]) => ({ key, ch, a: acct(key) }))
    .filter(r => r.a.url);          // 沒開帳號的就不佔位置

  if (!rows.length) { box.hidden = true; return; }
  box.hidden = false;

  box.innerHTML = `
    <span class="acct-label">已綁定的帳號</span>
    ${rows.map(({ key, ch, a }) => `
      <span class="acct">
        <a class="acct-name" href="${a.url}" target="_blank" rel="noopener"
           title="打開${ch.name}">
          <span aria-hidden="true">${ch.icon}</span>
          ${a.handle ? '@' + a.handle : ch.name}
        </a>
        <a class="acct-go" href="${ch.composer()}" target="_blank" rel="noopener"
           title="到${ch.name}發文">發文 →</a>
      </span>`).join('')}`;
}
