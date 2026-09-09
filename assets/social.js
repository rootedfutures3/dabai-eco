/* ============================================================
   社群產文產圖（Social Composer）
   ------------------------------------------------------------
   做什麼：從平台的真實資料（果樹、訂單、產品）生成四個平台各自
   合適的文案與配圖，並把這筆貼文寫進資料庫（Supabase 的 posts 表）。

   文案：一次產三種語言 —— 中文給華人社群、馬來文給在地、
         英文給企業與海外。每張卡片自己帶三份，點一下就換。

   配圖：按平台各畫一張。版位不一樣，同一張圖丟四個地方
         一定有兩個被裁掉重點（見 makePostImage）。

   送出：Facebook 和 Instagram 一鍵發布；
         小紅書沒有公開的發文 API，走
         「複製文案 + 下載配圖 + 開啟發文視窗」，手動貼上。

   刻意不做的事：用無頭瀏覽器模擬登入去點「發布」。
   那違反平台條款（帳號會被停權），而且要把密碼存起來。
   為了省兩下點擊冒這種險並不值得。
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
/* 樹況回報的「生長階段」與「樹況」是用中文存進資料庫的。
   直接塞進英文或馬來文的句子裡會夾一段中文，所以這裡先翻過。
   查不到就原樣輸出 —— 溝通者手打的自由文字本來就沒辦法翻。 */
const STAGE_TR = {
  '開花期': { en:'flowering',   ms:'berbunga' },
  '幼果期': { en:'fruit set',   ms:'buah muda' },
  '成熟期': { en:'ripening',    ms:'matang' },
  '採收期': { en:'harvest',     ms:'menuai' },
  '休眠期': { en:'dormant',     ms:'dorman' },
};
const HEALTH_TR = {
  '良好':   { en:'healthy',          ms:'sihat' },
  '需注意': { en:'needs attention',  ms:'perlu perhatian' },
  '不佳':   { en:'poor',             ms:'kurang baik' },
};
const trTerm = (map, v, lang) => (lang === 'zh' ? v : (map[v]?.[lang] || v));

/* 名字不能叫 dv —— docs.js 已經有一個同名的全域，
   兩個檔案在 erp.html 裡一起載入，重複宣告會讓整支 social.js 掛掉。

   資料值（果園名、果農名、地區）是用中文存在資料庫裡的。
   套進英文或馬來文的句型就會變成「Orchard: Nanga Sepit 河谷果園」——
   句子是英文，裡面卡一段中文。字典裡本來就有這些名字的翻譯，
   要做的只是查一下。

   為什麼不用 I18N.translate：它翻成「目前的介面語言」，
   但這裡要的是「這篇貼文的語言」—— 介面開著中文時，
   照樣要生得出完整的英文貼文。所以直接查那個語言的字典。 */
function trData(v, lang) {
  if (!v || lang === 'zh') return v;
  const d = lang === 'en' ? window.LANG_EN
          : lang === 'ms' ? window.LANG_MS : null;
  if (!d) return v;
  return d[String(v).trim()] ?? v;
}

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
      headline: { zh:`${t.id}｜${t.age} 年生的 ${crop}`,
                  en:`${t.id} — a ${t.age}-year-old ${crop}`,
                  ms:`${t.id} — pokok ${crop} berusia ${t.age} tahun` }[lang],
      facts: {
        zh:[`果園：${t.orchard}（${t.area}）`, `果農：${t.farmer}`,
            `樹齡 ${t.age} 年 · 預估產量 ${t.kg} 公斤`, `認養金 RM ${t.price}`],
        en:[`Orchard: ${trData(t.orchard, 'en')}, ${trData(t.area, 'en')}`, `Grower: ${trData(t.farmer, 'en')}`,
            `${t.age} years old · est. ${t.kg} kg`, `Adoption RM ${t.price}`],
        ms:[`Dusun: ${trData(t.orchard, 'ms')}, ${trData(t.area, 'ms')}`, `Petani: ${trData(t.farmer, 'ms')}`,
            `${t.age} tahun · anggaran ${t.kg} kg`, `Angkat RM ${t.price}`],
      }[lang],
      story: rpt
        ? { zh:`溝通者最近一次回報：${rpt.stage}，樹況${rpt.health}。${rpt.note}`,
            /* 備註是溝通者在果園裡用中文手打的，沒辦法翻。
               與其讓英文貼文中間卡一句中文，不如只帶結構化的那部分 ——
               階段和樹況已經說完這次回報的重點了。 */
            en:`Latest field report: ${trTerm(STAGE_TR, rpt.stage, 'en')}, condition ${trTerm(HEALTH_TR, rpt.health, 'en')}.`,
            ms:`Laporan lapangan terkini: ${trTerm(STAGE_TR, rpt.stage, 'ms')}, keadaan ${trTerm(HEALTH_TR, rpt.health, 'ms')}.` }[lang]
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
        en:[`Crop: ${crop}`, `Orchard: ${trData(t.orchard, 'en') || '—'}`,
            `Grower receives RM ${sp.farmer} — ${100 - sp.rate}% of the RM ${sp.amount} contract`,
            `RM ${sp.deposit} of it lands before the tree even flowers`],
        ms:[`Tanaman: ${crop}`, `Dusun: ${trData(t.orchard, 'ms') || '—'}`,
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
/* ============================================================
   語氣
   ------------------------------------------------------------
   同一棵樹、同一批事實，講法不一樣，接住的人就不一樣：
   認養人要的是故事，企業採購要的是數字和稽核，
   在地社群要的是「今天果園發生什麼事」。

   每一種語氣改三件事：
     hook   開頭第一句。社群平台只有前兩行會被看到，這句決定有沒有人點開。
     lead   接在後面的是故事還是數字（story / facts / punch）
     close  結尾。有些語氣需要一句收尾，有些不需要就留空。

   三種語言各寫一份，不是機器轉的 —— 馬來文的社群語感跟中文不一樣，
   直譯出來會像公文。
   ============================================================ */
const TONES = {
  warm: {
    label: { zh:'溫暖故事', en:'Warm story', ms:'Cerita hangat' },
    lead: 'story',
    hook: { zh:'這棵樹有名字，也有人在顧。',
            en:'This tree has a number, and someone who looks after it.',
            ms:'Pokok ini ada nombornya, dan ada orang yang menjaganya.' },
    close: { zh:'認養一棵，收成整棵是你的。',
             en:'Adopt one, and the whole harvest is yours.',
             ms:'Angkat satu pokok, seluruh hasilnya milik anda.' },
  },
  data: {
    label: { zh:'數據說服', en:'By the numbers', ms:'Ikut angka' },
    lead: 'facts',
    hook: { zh:'先看數字，再決定要不要相信我們。',
            en:'Look at the numbers first, then decide whether to believe us.',
            ms:'Lihat angka dahulu, kemudian tentukan sama ada mahu percaya.' },
    close: { zh:'每一筆都建檔，可以查。',
             en:'Every figure is logged and auditable.',
             ms:'Setiap angka direkod dan boleh diaudit.' },
  },
  short: {
    label: { zh:'短促吸睛', en:'Short and punchy', ms:'Pendek dan tajam' },
    lead: 'punch',
    hook: { zh:'一棵樹，一組編號。',
            en:'One tree. One ID.',
            ms:'Satu pokok. Satu nombor.' },
    close: { zh:'', en:'', ms:'' },
  },
  field: {
    label: { zh:'產地直擊', en:'From the orchard', ms:'Dari dusun' },
    lead: 'story',
    hook: { zh:'今天果園現場：',
            en:'From the orchard today:',
            ms:'Dari dusun hari ini:' },
    close: { zh:'溝通者每次巡園都會回報，照片和樹況都留檔。',
             en:'Every visit is reported back, with photos and condition on file.',
             ms:'Setiap lawatan dilaporkan semula, dengan gambar dan keadaan pokok difailkan.' },
  },
  grower: {
    label: { zh:'果農故事', en:'Meet the grower', ms:'Kenali petani' },
    lead: 'story',
    hook: { zh:'這筆錢會進到誰的口袋，我們寫得出來。',
            en:'We can tell you exactly whose pocket this money goes into.',
            ms:'Kami boleh beritahu dengan tepat wang ini masuk ke poket siapa.' },
    close: { zh:'不是中盤商開價，是果農先拿到。',
             en:'No middleman setting the price — the grower is paid first.',
             ms:'Bukan orang tengah yang menetapkan harga — petani dibayar dahulu.' },
  },
  corporate: {
    label: { zh:'企業提案', en:'For business buyers', ms:'Untuk pembeli korporat' },
    lead: 'facts',
    hook: { zh:'給正在找 ESG 敘事與穩定原料的採購窗口：',
            en:'For procurement teams that need an ESG story and a stable supply:',
            ms:'Untuk pasukan perolehan yang perlukan naratif ESG dan bekalan stabil:' },
    close: { zh:'需要合約範本與稽核資料的話，直接聯絡我們。',
             en:'Contract templates and audit records available on request.',
             ms:'Templat kontrak dan rekod audit disediakan atas permintaan.' },
  },
  explain: {
    label: { zh:'知識科普', en:'Explainer', ms:'Penerangan' },
    lead: 'story',
    hook: { zh:'很多人沒吃過 Dabai，先講清楚它是什麼。',
            en:'Most people have never eaten Dabai. Here is what it actually is.',
            ms:'Ramai belum pernah makan Dabai. Ini sebenarnya apa dia.' },
    close: { zh:'吃法：60–70°C 的熱水泡 10 分鐘，果肉會軟得像酪梨。',
             en:'How to eat it: soak in 60–70°C water for 10 minutes and the flesh softens like avocado.',
             ms:'Cara makan: rendam dalam air 60–70°C selama 10 minit, isinya lembut seperti avokado.' },
  },
  season: {
    label: { zh:'產季限定', en:'In season now', ms:'Bermusim sekarang' },
    lead: 'punch',
    hook: { zh:'產季就這麼長，過了要等明年。',
            en:'The season is this short. Miss it and it is next year.',
            ms:'Musimnya sependek ini. Terlepas, tunggu tahun depan.' },
    close: { zh:'想要的先講，我們照樹排。',
             en:'Tell us early — we allocate tree by tree.',
             ms:'Beritahu awal — kami agihkan pokok demi pokok.' },
  },
  green: {
    label: { zh:'永續倡議', en:'Sustainability', ms:'Kelestarian' },
    lead: 'facts',
    hook: { zh:'果肉、果核、果皮，我們沒有一樣是丟掉的。',
            en:'Flesh, seed, peel — none of it gets thrown away.',
            ms:'Isi, biji, kulit — tiada satu pun dibuang.' },
    close: { zh:'碳數字是我們自己算的，還沒有第三方驗證 —— 這點我們寫在網站上。',
             en:'Our carbon figures are our own and not third-party verified. We say so on the site.',
             ms:'Angka karbon kami dikira sendiri dan belum disahkan pihak ketiga. Kami nyatakannya di laman web.' },
  },
  ask: {
    label: { zh:'提問互動', en:'Open a question', ms:'Buka soalan' },
    lead: 'story',
    hook: { zh:'如果你認養一棵樹，你最想知道它的什麼事？',
            en:'If you adopted a tree, what would you most want to know about it?',
            ms:'Jika anda mengangkat sebatang pokok, apa yang paling anda mahu tahu?' },
    close: { zh:'留言告訴我們，下一次回報就寫進去。',
             en:'Tell us in the comments and the next field report will cover it.',
             ms:'Beritahu kami di ruangan komen — laporan seterusnya akan memuatkannya.' },
  },
};

function compose(channel, m, lang, tone) {
  const T = TONES[tone] || TONES.warm;
  const tags = TAGS[lang] || TAGS.zh;
  const bullets = m.facts.map(f => '· ' + f).join('\n');
  const cta = { zh:'看完整樹卡與果園檔案 → ', en:'See the full tree card → ', ms:'Lihat kad pokok penuh → ' }[lang];

  const hook  = (T.hook[lang] || T.hook.zh || '').trim();
  const close = (T.close && (T.close[lang] || '')).trim();

  /* lead 決定開頭之後先給什麼：
       story 講故事、facts 攤數字、punch 只留最有力的那一條。
     這是語氣真正改變文案的地方，不是只換一句開場白。 */
  const lead = T.lead === 'facts' ? m.facts.join('　｜　')
             : T.lead === 'punch' ? m.facts[0]
             : m.story;

  /* 空的段落不要留下空行 —— 有些語氣沒有結尾句 */
  const join = (...parts) => parts.filter(x => x && String(x).trim()).join('\n\n');

  if (channel === 'instagram') {
    /* IG 只有前兩行會顯示，其餘要點「更多」。
       所以鉤子和 lead 一定要在最前面，事實列表往後放。 */
    const bio = { zh:'個人簡介連結', en:'link in bio', ms:'pautan di bio' }[lang];
    return join(hook, lead, m.headline + '\n' + bullets, close,
                cta + bio, '.\n.\n' + tags);
  }

  if (channel === 'rednote') {
    /* 小紅書：標題吃前 20 字，正文重點放前三行，標籤在最後 */
    return join(m.headline, hook, lead,
                T.lead === 'punch' ? '' : bullets,
                close, cta + m.link, tags);
  }

  /* Facebook：標題、鉤子、主體、事實、收尾、連結、標籤 */
  return join(m.headline, hook, lead,
              T.lead === 'facts' ? '' : bullets,
              close, cta + m.link, tags);
}

/* ---------- 送出 ---------- */

/** Facebook 與 Instagram 有發文 API；小紅書沒有，只能手動貼。 */
const AUTO_OK = { facebook: true, instagram: true };

function backend() {
  return (typeof PUBLISH_ENDPOINT !== 'undefined' && PUBLISH_ENDPOINT) || '';
}

/** 這個平台現在能不能一鍵發布 */
function canAuto(channel) {
  return Boolean(backend() && AUTO_OK[channel]);
}

/**
 * 產圖 → 傳到 Supabase 拿一個公開網址 → 交給後端。
 * Instagram 規定貼文一定要有圖，而且圖必須是「網路上抓得到」的網址 ——
 * 瀏覽器裡剛畫好的那張是 blob，IG 的伺服器連不到，所以一定要先上傳。
 */
async function uploadPostImage(channel, d) {
  const blob = await makePostImage(channel, d);
  if (!blob) throw new Error('配圖產生失敗');
  const file = new File([blob], `post-${channel}.jpg`, { type: 'image/jpeg' });
  return await Store.uploadPhoto(file, 'social');
}

/**
 * 有後端而且平台支援就真的代發；其餘走手動：
 * 複製文案 + 下載配圖 + 開啟該平台的發文視窗。
 */
async function publish(channel, text, post, d) {
  if (canAuto(channel)) {
    const imageUrl = await uploadPostImage(channel, d);
    const r = await fetch(backend(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel, text, imageUrl,
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

  /* 手機上先試原生分享 —— 圖和文一起交給 App，比「複製再貼上」少一半步驟。 */
  if (canShareFiles()) {
    try {
      await copy(text);
      return await shareNative(channel, text, d);
    } catch (e) {
      /* 使用者按取消也會走到這裡，不當成錯誤，退回下面的做法 */
    }
  }

  await copy(text);
  try { await downloadImage(channel, d); } catch (e) { /* 圖失敗不擋發文 */ }
  window.open(CHANNELS[channel].composer(), '_blank', 'noopener');
  return { mode: 'manual', link: '' };
}

/** 這台裝置能不能用原生分享面板送出圖片 */
function canShareFiles() {
  return typeof navigator !== 'undefined' && navigator.canShare && navigator.share;
}

/** 把配圖和文案交給系統的分享面板，使用者選 App 就送出 */
async function shareNative(channel, text, d) {
  const blob = await makePostImage(channel, d);
  const file = new File([blob], `tanju-${channel}.jpg`, { type: 'image/jpeg' });
  if (!navigator.canShare({ files: [file] })) throw new Error('這台裝置不能分享圖片');
  await navigator.share({ files: [file], text });
  return { mode: 'share', link: '' };
}

/* ============================================================
   配圖產生器
   ------------------------------------------------------------
   每個平台的版位不一樣，同一張圖丟四個地方一定有兩個被裁掉重點。
   所以按平台各畫一張：底圖選對應比例的照片，上面壓文字。

   為什麼是 canvas 不是預先做好的圖：文案每次都不同，
   圖上要有這次講的那棵樹的編號、果園、產品名 ——
   預先做好的圖只能是通用的背景，那就等於沒有資訊。

   照片和 logo 都是同源的，canvas 不會被污染，匯得出檔案。
   ============================================================ */
/* 字級寫死在各平台，不用同一條公式換算 —— 橫幅只有 630 高，
   套用直式的比例會讓字大到把照片整個蓋掉。每個版位本來就要各自調。
   head 是標題字級，lines 是標題最多幾行。 */
const IMG_SPEC = {
  facebook:  { w:1200, h:630,  photo:'dabai-wide.jpg',   head:54, lines:2 },
  instagram: { w:1080, h:1080, photo:'dabai-square.jpg', head:62, lines:3 },
  rednote:   { w:1080, h:1440, photo:'dabai-tall.jpg',   head:66, lines:3 },
};

const IMG_FONT = '"PingFang TC","Hiragino Sans TC","Noto Sans TC",'
               + '"Microsoft JhengHei",system-ui,-apple-system,sans-serif';

function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('圖片載入失敗：' + src));
    im.src = src;
  });
}

/** 等比例填滿，超出的裁掉（object-fit: cover 的 canvas 版） */
function drawCover(ctx, im, w, h) {
  const r = Math.max(w / im.width, h / im.height);
  const dw = im.width * r, dh = im.height * r;
  ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** 中文沒有空格，不能用 split(' ') 斷行，只能逐字量寬度 */
function wrapLines(ctx, text, maxW, maxLines) {
  const lines = [];
  let cur = '';
  for (const ch of String(text)) {
    if (ch === '\n') { lines.push(cur); cur = ''; if (lines.length >= maxLines) break; continue; }
    const t = cur + ch;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur); cur = ch;
      if (lines.length >= maxLines) break;
    } else { cur = t; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    /* 塞不下就在最後一行收尾，不要硬擠到出血 */
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    if (ctx.measureText(String(text)).width > maxW * maxLines) lines[maxLines - 1] = last + '…';
  }
  return lines;
}

/** 文案第一行當標題。去掉標籤和開頭的符號，那些放在圖上很醜。 */
function headlineOf(text) {
  const first = String(text || '').split('\n').find(l => l.trim() && !l.trim().startsWith('#'));
  return (first || 'Dabai').replace(/#[^\s#]+/g, '').replace(/^[\s·—\-–]+/, '').trim();
}

/**
 * 畫一張配圖，回傳 Blob。
 * @param {string} channel  facebook / instagram / rednote
 * @param {object} d        POSTS_DRAFT 裡那一份（要有 text 和 subject）
 */
async function makePostImage(channel, d) {
  const spec = IMG_SPEC[channel] || IMG_SPEC.instagram;
  const { w, h } = spec;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  /* 底圖。載不到就用品牌色鋪底，不要整個失敗 —— 沒有圖的貼文比醜的貼文糟。 */
  try {
    const im = await loadImg(`assets/img/photo/${spec.photo}`);
    drawCover(ctx, im, w, h);
  } catch (e) {
    ctx.fillStyle = '#2C1B24';
    ctx.fillRect(0, 0, w, h);
  }

  const pad  = Math.round(Math.min(w, h) * 0.075);
  const maxW = w - pad * 2;

  const hSize = spec.head;
  const sSize = Math.round(hSize * 0.60);
  const uSize = Math.round(hSize * 0.46);
  const gapHS = Math.round(hSize * 1.25);   // 標題到副標
  const gapSU = Math.round(hSize * 1.00);   // 副標到網址

  /* 先量文字、再決定漸層鋪多高。反過來做的話，橫幅上的標題會伸出
     壓暗的範圍，白字就落在亮照片上 —— 我們自己那張的葉子就是淺色的。 */
  ctx.font = `500 ${hSize}px ${IMG_FONT}`;
  const lines = wrapLines(ctx, headlineOf(d && d.text), maxW, spec.lines);
  const lineH = Math.round(hSize * 1.3);
  const sub = (d && d.subject) ? String(d.subject) : '';

  const yUrl  = h - pad;
  const ySub  = yUrl - gapSU;
  const yHead = sub ? ySub - gapHS : ySub;
  const textTop = yHead - (lines.length - 1) * lineH - hSize;

  const gTop = Math.max(0, textTop - Math.round(h * 0.16));
  const g = ctx.createLinearGradient(0, gTop, 0, h);
  g.addColorStop(0, 'rgba(18,10,16,0)');
  g.addColorStop(0.42, 'rgba(18,10,16,.74)');
  g.addColorStop(1, 'rgba(18,10,16,.95)');
  ctx.fillStyle = g;
  ctx.fillRect(0, gTop, w, h - gTop);

  /* logo 左上。原色不動，只加一層陰影讓它在淺色照片上也看得見。 */
  try {
    const lg = await loadImg('assets/img/logo.png');
    const lh = Math.round(Math.min(w, h) * 0.115);
    const lw = Math.round(lg.width / lg.height * lh);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = Math.round(lh * 0.35);
    ctx.drawImage(lg, pad, pad, lw, lh);
    ctx.font = `500 ${Math.round(lh * 0.42)}px ${IMG_FONT}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText('TANJU', pad + lw + Math.round(lh * 0.22), pad + lh / 2);
    ctx.restore();
  } catch (e) { /* logo 沒載到就算了，不影響其他部分 */ }

  ctx.textBaseline = 'alphabetic';

  ctx.font = `400 ${uSize}px ${IMG_FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,.66)';
  ctx.fillText('rootedfutures3.github.io/dabai-eco', pad, yUrl);

  if (sub) {
    ctx.font = `500 ${sSize}px ${IMG_FONT}`;
    ctx.fillStyle = '#E8C06A';
    ctx.fillText(wrapLines(ctx, sub, maxW, 1)[0] || '', pad, ySub);
  }

  ctx.font = `500 ${hSize}px ${IMG_FONT}`;
  ctx.fillStyle = '#FFFFFF';
  lines.forEach((ln, i) => {
    ctx.fillText(ln, pad, yHead - (lines.length - 1 - i) * lineH);
  });

  return await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.9));
}

/** 產生並下載。檔名帶平台，四張才分得出來。 */
async function downloadImage(channel, d) {
  const blob = await makePostImage(channel, d);
  if (!blob) throw new Error('圖片產生失敗');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tanju-${channel}-${Date.now()}.jpg`;
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

  fillTones();
  fillSubjects();
  renderPostLog();
  initCalendar();

  const topic = document.getElementById('po-topic');
  if (!topic.dataset.bound) {
    topic.dataset.bound = '1';
    topic.addEventListener('change', () => { fillSubjects(); document.getElementById('po-cards').innerHTML = ''; });
    document.getElementById('po-gen').addEventListener('click', generate);
    wrap.addEventListener('click', onCardClick);
  }
}

/* 語氣下拉由 TONES 產生，加一種語氣只要改 TONES，不用動 HTML。
   標籤跟著介面語言走。 */
function fillTones() {
  const sel = document.getElementById('po-tone');
  if (!sel || sel.dataset.filled) return;
  sel.dataset.filled = '1';
  const ui = (typeof I18N !== 'undefined' && I18N.lang) || 'zh';
  const code = ui === 'en' ? 'en' : ui === 'ms' ? 'ms' : 'zh';
  sel.innerHTML = Object.entries(TONES)
    .map(([k, t]) => `<option value="${k}">${esc(t.label[code] || t.label.zh)}</option>`)
    .join('');
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

/* 三種語言一次產生。
   原本要先在上面選語言、再按一次產生，一次只拿得到一種 ——
   實際貼文時三個受眾都要餵：中文給華人社群、馬來文給在地、
   英文給企業與海外。所以每張卡片自己帶三份文案，點一下就換。 */
const POST_LANGS = [['zh', '中文'], ['ms', 'Bahasa Melayu'], ['en', 'English']];

/* 印在配圖上的那行副標，讓人看得出這篇在講哪一棵樹。
   不能直接抓下拉選單的文字 —— 那是介面語言，
   但一張圖要配的是「這篇貼文的語言」，兩者不一定一樣。 */
function subjectFor(topic, id, lang) {
  if (topic === 'tree') {
    const t = Store.treeList().find(x => x.id === id);
    return t ? `${t.id} · ${trData(t.orchard, lang)}` : '';
  }
  if (topic === 'order') {
    const o = (Store.read().orders || []).find(x => x.no === id);
    return o ? `${o.treeId} · ${o.no}` : '';
  }
  if (topic === 'product') {
    const p = PRODUCTS.find(x => x.id === id);
    return p ? ({ zh:p.zh, en:p.en, ms:p.ms }[lang] || p.zh) : '';
  }
  return { zh:'砂拉越 Song · 一樹一碼',
           en:'Song, Sarawak · one tree, one ID',
           ms:'Song, Sarawak · satu pokok, satu ID' }[lang] || '';
}

function generate() {
  const topic = document.getElementById('po-topic').value;
  const id    = document.getElementById('po-subject').value;
  const first = document.getElementById('po-lang').value;
  const tone  = document.getElementById('po-tone').value;

  const wrap = document.getElementById('po-cards');
  if (!material(topic, id, 'zh')) {
    wrap.innerHTML = '<p class="dim">找不到這個對象的資料。</p>';
    return;
  }

  POSTS_DRAFT = {};
  wrap.innerHTML = Object.entries(CHANNELS).map(([key, ch]) => {
    // 每個平台各產三份
    const texts = {}, subjects = {};
    POST_LANGS.forEach(([code]) => {
      texts[code] = compose(key, material(topic, id, code), code, tone);
      subjects[code] = subjectFor(topic, id, code);
    });
    POSTS_DRAFT[key] = { texts, subjects, lang: first, topic, topicId: id,
                         get text() { return this.texts[this.lang]; },
                         get subject() { return this.subjects[this.lang]; } };

    const cur  = texts[first];
    const over = cur.length > ch.limit;
    return `
      <div class="post-card" data-ch="${key}">
        <div class="post-head">
          <b>${ch.icon} ${ch.name}</b>
          <span class="post-count ${over ? 'over' : ''}">${cur.length} / ${ch.limit}</span>
        </div>
        <div class="post-langs" role="tablist">
          ${POST_LANGS.map(([code, label]) => `
            <button class="pl${code === first ? ' on' : ''}" data-lang="${code}"
                    role="tab" aria-selected="${code === first}">${label}</button>`).join('')}
        </div>
        <textarea class="post-body" rows="9" spellcheck="false">${esc(cur)}</textarea>
        <p class="post-hint">${ch.hint}</p>
        <div class="post-acts">
          <button class="mini-btn" data-act="copy">複製文案</button>
          <button class="mini-btn" data-act="image">下載配圖</button>
          ${canAuto(key)
            ? `<button class="mini-btn primary" data-act="publish">一鍵發布</button>`
            : `<button class="mini-btn primary" data-act="publish">複製並開啟</button>`}
          <span class="post-msg"></span>
        </div>
      </div>`;
  }).join('');

  const recount = card => {
    const ta = card.querySelector('.post-body');
    const ch = CHANNELS[card.dataset.ch];
    const c  = card.querySelector('.post-count');
    c.textContent = `${ta.value.length} / ${ch.limit}`;
    c.classList.toggle('over', ta.value.length > ch.limit);
  };

  /* 使用者手改文案時，字數即時重算 —— 改的是「目前這個語言」那一份，
     切到別的語言再切回來，剛才的修改還在。 */
  wrap.querySelectorAll('.post-body').forEach(ta => {
    ta.addEventListener('input', () => {
      const card = ta.closest('.post-card');
      const d = POSTS_DRAFT[card.dataset.ch];
      d.texts[d.lang] = ta.value;
      recount(card);
    });
  });

  wrap.querySelectorAll('.post-langs').forEach(bar => {
    bar.addEventListener('click', e => {
      const b = e.target.closest('.pl');
      if (!b) return;
      const card = bar.closest('.post-card');
      const d = POSTS_DRAFT[card.dataset.ch];
      d.lang = b.dataset.lang;
      bar.querySelectorAll('.pl').forEach(x => {
        const on = x.dataset.lang === d.lang;
        x.classList.toggle('on', on);
        x.setAttribute('aria-selected', String(on));
      });
      card.querySelector('.post-body').value = d.texts[d.lang];
      recount(card);
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
    btn.disabled = true;
    say('產生中…');
    try { await downloadImage(key, d); say('配圖已下載'); }
    catch (e) { say('產生失敗：' + e.message, true); }
    finally { btn.disabled = false; }
    return;
  }

  if (d.text.length > CHANNELS[key].limit
      && !confirm(`文案超過 ${CHANNELS[key].name} 的 ${CHANNELS[key].limit} 字上限，還是要繼續嗎？`)) return;

  const post = {
    at: stamp(), channel: key, topic: d.topic, topicId: d.topicId, lang: d.lang,
    /* 誰按的。一鍵發布會把東西送到公開的粉專上，
       事後看到一篇不該發的，要查得出是誰 —— 這是責任歸屬。
       存登入用的信箱：它唯一，而且改了顯示名稱也不會對不上。 */
    by: (typeof Perm !== 'undefined' && Perm.me()?.u) || '',
    title: d.text.split('\n')[0].slice(0, 60),
    body: d.text, tags: (d.text.match(/#[^\s#]+/g) || []).join(' '),
    status: '草稿', link: '', scheduled: '',
  };

  btn.disabled = true;
  if (canAuto(key)) say('產圖並發布中…');
  try {
    const r = await publish(key, d.text, post, d);
    post.status = { auto:'已發布', share:'已送出分享' }[r.mode] || '已複製 · 待貼上';
    post.link = r.link;
    Store.addPost(post);
    say({
      auto:  '已發布',
      share: '已交給手機的分享面板，選 App 就送出',
    }[r.mode] || '文案已複製、配圖已下載，發文視窗開好了');
    renderPostLog();
  } catch (err) {
    say('發布失敗：' + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

/** 把信箱換成看得懂的名字。帳號被刪掉了就顯示信箱本身 ——
    紀錄是拿來查責任的，人不在了那一列也不能變成空白。 */
function whoLabel(u) {
  if (!u) return '—';
  const m = (Store.read().users || []).find(x => x.u === u);
  return m && m.name ? `${esc(m.name)}<small class="dim"> · ${esc(u)}</small>` : esc(u);
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
    whoLabel(p.by),
    `<span class="badge-${p.status === '已發布' ? 'ok' : 'wait'}">${p.status || '草稿'}</span>`,
    p.link ? `<a href="${p.link}" target="_blank" rel="noopener">開啟</a>` : '—',
  ]);
  el.innerHTML = table(['時間', '平台', '題材', '語言', '標題', '發布者', '狀態', '連結'], rows);
}

function stamp() {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
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
    /* 用目前的介面語言產生，而不是寫死中文。
       寫死的話，排程表的預覽永遠是中文，切到英文之後翻譯器只能對
       「截斷過」的字串做比對 —— 比對不到整句，就變成
       「DB-000001 — a 34-year-old Dabai 黑橄欖…」這種半中半英。
       文案本來就有三種語言，直接產對的那一種就好。 */
    const lang = (typeof I18N !== 'undefined' && ['zh', 'en', 'ms'].includes(I18N.lang))
      ? I18N.lang : 'zh';
    const m = material(p.kind, p.id, lang);
    const text = m ? compose('facebook', m, lang, 'warm') : '';
    return {
      date, time,
      topic: { tree:'果樹', product:'產品', order:'認養捷報', free:'平台介紹' }[p.kind],
      kind: p.kind,
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
/* 換語言時把排程表重新產生一次 —— 它的內容是整段文案，
   不是可以逐句替換的介面文字。 */
document.addEventListener('i18n:change', () => {
  if (document.getElementById('t-calendar')?.innerHTML) buildCalendar();
});

function exportCalendarCsv() {
  if (!CAL_ROWS.length) return;
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  /* 排程表匯出的是文案，不是圖 —— 配圖要按平台各畫一張，
     一個 CSV 欄位塞不下四張，也不該把一張通用圖硬套上去。
     圖在下面的卡片上按平台各自下載。 */
  const head = ['Date', 'Time', 'Topic', 'Subject', 'Caption'];
  const lines = [head.join(',')].concat(
    CAL_ROWS.map(r => [
      r.date, r.time, r.topic, r.subject, r.text,
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
