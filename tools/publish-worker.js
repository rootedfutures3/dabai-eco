/**
 * TANJU 社群後端 —— 一鍵發文 ＋ 讀成效
 * ============================================================
 * 這支程式是給 Cloudflare Workers 用的（免費方案就夠）。
 * 它存在的唯一理由：各平台的金鑰不能放在前端。
 *
 * 兩件事：
 *   POST {channel, text}      → 發文
 *   POST {action:'insights'}  → 把粉專與 IG 最近的貼文成效讀回來
 *
 * 為什麼不能放前端
 *   Facebook 的 Page Access Token 可以代你發文、刪文、讀私訊。
 *   它一旦寫進網頁，任何人按右鍵看原始碼就拿得到。
 *   所以金鑰只能放在伺服器的環境變數裡，前端只送「要發什麼」。
 *
 * 部署方式
 *   1. npm i -g wrangler && wrangler login
 *   2. wrangler init tanju-publish  （選 "Hello World" worker）
 *   3. 把這個檔案的內容貼進 src/index.js
 *   4. 設定金鑰（會存在 Cloudflare，不會進 git）：
 *        wrangler secret put FB_PAGE_ID
 *        wrangler secret put FB_PAGE_TOKEN
 *        wrangler secret put IG_USER_ID
 *        wrangler secret put YT_CLIENT_ID
 *        wrangler secret put YT_CLIENT_SECRET
 *        wrangler secret put YT_REFRESH_TOKEN
 *        wrangler secret put TANJU_KEY     ← 自己隨便設一串，見下面「誰可以呼叫」
 *      IG_USER_ID 可以不填 —— 後端會用粉專 token 自己查（resolveIgUserId）。
 *      要讀成效的話，那把 FB_PAGE_TOKEN 必須帶 read_insights 權限。
 *      Meta 淘汰 Graph 版本時：wrangler secret put GRAPH_VERSION
 *   5. wrangler deploy
 *   6. 把得到的網址填進 assets/config.js 的 PUBLISH_ENDPOINT
 *
 * 誰可以呼叫
 *   這個網址是公開的，所以要擋住路人。做法是前端送出時附上 TANJU_KEY，
 *   後端比對不符就拒絕。這不是強度很高的保護（金鑰仍在前端），
 *   但足以擋掉隨手掃網址的人 —— 真正要做好，應該改成
 *   驗證 Supabase 的 JWT，見檔案最後的 verifySupabaseJWT。
 * ============================================================
 */

const ALLOW_ORIGIN = 'https://rootedfutures3.github.io';

/* Graph API 的版本。Meta 大約每兩年淘汰一個版本，被淘汰的那天
   所有呼叫會一起停掉。真的發生時不用改程式 ——
   wrangler secret put GRAPH_VERSION 填新的版本號就好。
   不要拿掉版本號：不寫版本 Meta 會退回最舊的那一版。 */
const graphVer = env => env.GRAPH_VERSION || 'v23.0';

export default {
  async fetch(request, env) {
    // --- CORS 預檢 ---
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    if (request.method !== 'POST') {
      return cors(json({ error: '只接受 POST' }, 405));
    }

    let body;
    try { body = await request.json(); }
    catch (e) { return cors(json({ error: '送過來的不是 JSON' }, 400)); }

    // --- 擋住路人 ---
    if (env.TANJU_KEY && body.key !== env.TANJU_KEY) {
      return cors(json({ error: '沒有權限' }, 401));
    }

    /* 成效查詢走另一條路：它不發文，只讀數字 */
    if (body.action === 'insights') {
      try {
        return cors(json(await readInsights(env, Number(body.limit) || 12)));
      } catch (err) {
        return cors(json({ error: String(err.message || err) }, 502));
      }
    }

    const { channel, text, imageUrl } = body;
    if (!channel || !text) return cors(json({ error: '缺少 channel 或 text' }, 400));

    try {
      let result;
      switch (channel) {
        case 'facebook':  result = await postFacebook(env, text); break;
        case 'instagram': result = await postInstagram(env, text, imageUrl); break;
        case 'youtube':   result = await postYouTube(env, text); break;
        case 'rednote':
          return cors(json({
            error: '小紅書沒有公開的發文 API，只能用半自動方式（複製文案 + 開啟發文視窗）。',
          }, 501));
        default:
          return cors(json({ error: '不認得這個平台：' + channel }, 400));
      }
      return cors(json({ ok: true, ...result }));
    } catch (err) {
      // 把錯誤原樣傳回前端，才知道是權限不足還是內容被拒
      return cors(json({ error: String(err.message || err) }, 502));
    }
  },
};

/* ---------- Facebook 粉專 ---------- */
/* 需要：FB_PAGE_ID、FB_PAGE_TOKEN（長效 Page Access Token）
   權限：pages_manage_posts，且 App 要過 Review */
async function postFacebook(env, text) {
  need(env, ['FB_PAGE_ID', 'FB_PAGE_TOKEN']);
  const r = await fetch(
    `https://graph.facebook.com/${graphVer(env)}/${env.FB_PAGE_ID}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, access_token: env.FB_PAGE_TOKEN }),
    });
  const d = await r.json();
  if (!r.ok) throw new Error(fbError(d));
  return { id: d.id, link: `https://www.facebook.com/${d.id}` };
}

/* ---------- Instagram 商業帳號 ---------- */
/* IG 一定要有圖片 —— 純文字發不出去，這是平台的限制，不是我們的。
   流程是兩步：先建 media container，再 publish。 */
async function postInstagram(env, text, imageUrl) {
  need(env, ['IG_USER_ID', 'FB_PAGE_TOKEN']);
  if (!imageUrl) {
    throw new Error('Instagram 一定要附圖片網址（imageUrl）。純文字貼文 IG 不支援。');
  }

  const create = await fetch(
    `https://graph.facebook.com/${graphVer(env)}/${env.IG_USER_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl, caption: text, access_token: env.FB_PAGE_TOKEN,
      }),
    });
  const c = await create.json();
  if (!create.ok) throw new Error(fbError(c));

  const publish = await fetch(
    `https://graph.facebook.com/${graphVer(env)}/${env.IG_USER_ID}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: c.id, access_token: env.FB_PAGE_TOKEN }),
    });
  const p = await publish.json();
  if (!publish.ok) throw new Error(fbError(p));
  return { id: p.id, link: '' };
}

/* ---------- YouTube ---------- */
/* refresh token 換 access token，再打社群貼文的 API。
   注意：社群貼文（community posts）目前只開放部分頻道，
   拿到 403 多半是頻道還沒有這個資格，不是程式寫錯。 */
async function postYouTube(env, text) {
  need(env, ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN']);

  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.YT_CLIENT_ID,
      client_secret: env.YT_CLIENT_SECRET,
      refresh_token: env.YT_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const t = await tok.json();
  if (!tok.ok) throw new Error('換 YouTube token 失敗：' + (t.error_description || t.error));

  const r = await fetch(
    'https://www.googleapis.com/youtube/v3/activities?part=snippet,contentDetails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + t.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ snippet: { description: text } }),
    });
  const d = await r.json();
  if (!r.ok) {
    const msg = d.error?.message || '未知錯誤';
    if (r.status === 403) {
      throw new Error('YouTube 拒絕（403）：這個頻道可能還沒開放社群貼文功能。原訊息：' + msg);
    }
    throw new Error('YouTube：' + msg);
  }
  return { id: d.id, link: '' };
}


/* ============================================================
   成效：把 Meta 那邊的真實數字讀回來
   ------------------------------------------------------------
   為什麼要經過這裡：讀成效跟發文用的是同一把 Page Access Token，
   那把 token 也能代你發文、刪文、讀私訊。放進前端等於送人。

   分成兩層，是因為 Meta 的權限不是一次到齊：

     第一層　讚、留言、分享。這些是貼文本身的欄位，
             pages_read_engagement 就拿得到，App 建好當天就有數字。

     第二層　觸及、曝光、點擊。這些要 read_insights
             （IG 是 instagram_manage_insights），而且要過 App Review。
             審核還沒過的話，這一層會是空的 —— 空的就顯示沒有，
             不會拿第一層的數字去推估，成效數字是要拿去對外講的。

   欄位名稱 Meta 每隔一陣子會改一次（改版時砍掉舊的指標名）。
   所以下面不是寫死一組名字硬打，而是先試全部，
   被拒絕就一個一個試，留下能用的，並把被拒絕的原樣回報。
   看板上那一欄空白時，你才知道是「還沒過審」還是「這個指標沒了」。
   ============================================================ */

/** 這一輪要試的指標。Meta 砍掉哪個就自動略過哪個。 */
const FB_METRICS = ['post_impressions_unique', 'post_impressions', 'post_clicks'];
const IG_METRICS = ['reach', 'views', 'impressions', 'saved', 'total_interactions'];

async function readInsights(env, limit) {
  const out = { at: new Date().toISOString(), posts: [], notes: [], sources: {} };

  if (!env.FB_PAGE_TOKEN) {
    throw new Error('後端還沒設定 FB_PAGE_TOKEN。用 wrangler secret put FB_PAGE_TOKEN 設定。');
  }

  /* 兩邊各自獨立：IG 掛了不該連帶讓 FB 的數字也看不到 */
  const jobs = [];
  if (env.FB_PAGE_ID) {
    jobs.push(fbInsights(env, limit).then(
      r => { out.posts.push(...r.posts); out.sources.facebook = r.meta; },
      e => { out.sources.facebook = { ok:false, error:String(e.message || e) }; }));
  }
  jobs.push(igInsights(env, limit).then(
    r => { out.posts.push(...r.posts); out.sources.instagram = r.meta; },
    e => { out.sources.instagram = { ok:false, error:String(e.message || e) }; }));

  await Promise.all(jobs);

  out.posts.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  /* 空白的欄位要看得出原因。「整條線掛了」「權限不足」「指標被 Meta 砍了」
     是三件不同的事，處理方式也不一樣。 */
  for (const [k, v] of Object.entries(out.sources)) {
    if (!v) continue;
    const dropped = (v.dropped || []).join('、');
    if (v.error) {
      out.notes.push(`${k}：${v.error}`);
    } else if (v.ok === false) {
      out.notes.push(`${k}：成效指標一個都拿不到，多半是這把 token 少了 `
        + `read_insights（IG 是 instagram_manage_insights）。`
        + (v.thin ? '' : '讚與留言不受影響。')
        + `被拒絕的：${dropped}`);
    } else if (dropped) {
      out.notes.push(`${k}：Meta 不認得這幾個指標名，已略過 —— ${dropped}`);
    }
    if (v.thin) {
      out.notes.push(`${k}：連讚與留言都讀不到，只剩貼文本身。`
        + `這把 token 的 pages_read_engagement 沒有涵蓋這個粉專 —— `
        + `重新授權時要記得在彈窗裡勾到它。`);
    }
  }
  return out;
}

/* ---------- Facebook 粉專貼文 ---------- */
async function fbInsights(env, limit) {
  const { data, ok, dropped, thin } = await withMetrics(
    env, `${env.FB_PAGE_ID}/posts`, [
      ['id', 'message', 'created_time', 'permalink_url', 'shares',
       'likes.summary(true).limit(0)', 'comments.summary(true).limit(0)'],
      ['id', 'message', 'created_time', 'permalink_url'],
      ['id', 'message', 'created_time'],
    ], FB_METRICS, limit);

  const posts = (data.data || []).map(p => {
    const m = pickInsights(p);
    const likes = p.likes?.summary?.total_count || 0;
    const cmts  = p.comments?.summary?.total_count || 0;
    const shr   = p.shares?.count || 0;
    return {
      pid: p.id,
      channel: 'facebook',
      at: fmtTime(p.created_time),
      title: firstLine(p.message),
      link: p.permalink_url || '',
      likes, comments: cmts, shares: shr,
      engagements: likes + cmts + shr,
      reach: m.post_impressions_unique ?? null,
      impressions: m.post_impressions ?? null,
      clicks: m.post_clicks ?? null,
    };
  });
  return { posts, meta: { ok, dropped, thin, count: posts.length } };
}

/* ---------- Instagram 商業帳號 ---------- */
async function igInsights(env, limit) {
  const ig = env.IG_USER_ID || await resolveIgUserId(env);

  const { data, ok, dropped, thin } = await withMetrics(
    env, `${ig}/media`, [
      ['id', 'caption', 'timestamp', 'permalink', 'media_type',
       'like_count', 'comments_count'],
      ['id', 'caption', 'timestamp', 'permalink'],
    ], IG_METRICS, limit);

  const posts = (data.data || []).map(p => {
    const m = pickInsights(p);
    const likes = p.like_count || 0, cmts = p.comments_count || 0;
    return {
      pid: p.id,
      channel: 'instagram',
      at: fmtTime(p.timestamp),
      title: firstLine(p.caption),
      link: p.permalink || '',
      likes, comments: cmts, shares: 0, saved: m.saved ?? null,
      engagements: m.total_interactions ?? (likes + cmts),
      reach: m.reach ?? null,
      impressions: m.views ?? m.impressions ?? null,
      /* IG 的自然貼文沒有「連結點擊」這個指標 —— 不是我們漏抓，
         是 Meta 只給廣告。所以這裡一定是 null，前台顯示破折號。 */
      clicks: null,
    };
  });
  return { posts, meta: { ok, dropped, thin, igUserId: ig, count: posts.length } };
}

/** 粉專底下綁的 IG 商業帳號，用粉專 token 就查得到，不用手動填。 */
async function resolveIgUserId(env) {
  need(env, ['FB_PAGE_ID']);
  const d = await graph(env, env.FB_PAGE_ID, { fields: 'instagram_business_account' });
  const id = d.instagram_business_account?.id;
  if (!id) {
    throw new Error('這個粉專底下沒有綁 Instagram 商業帳號。'
      + '到 Meta Business Suite → 設定 → Instagram 帳號，把 IG 轉成商業帳號並連到粉專。');
  }
  return id;
}

/* ---------- 指標容錯 ----------
   先把整組指標一起送。Meta 只要其中一個名字不認得，
   整個請求就會 400 —— 而且錯誤訊息不會講是哪一個。
   所以退而求其次：一個一個試，留下過關的，最後再送一次。
   只有按「更新成效」時才會跑，多幾次呼叫沒有關係。 */
async function withMetrics(env, path, baseSets, metrics, limit) {
  /* baseSets 是「由完整到最陽春」的欄位組。
     實測過：權限不齊的時候，連 likes.summary 這種基本欄位都會被擋
     （#10），而它一被擋，整批貼文就一起讀不到 ——
     所以基本欄位也要能退，退到最後至少還看得到有哪幾篇貼文。 */
  let base = baseSets[0], thin = false;

  const call = (ms, fields = base) => graph(env, path, {
    limit,
    fields: ms.length
      ? [...fields, `insights.metric(${ms.join(',')})`].join(',')
      : fields.join(','),
  });

  try {
    return { data: await call(metrics), ok: true, dropped: [], thin };
  } catch (e) {
    if (!metrics.length && baseSets.length === 1) throw e;
  }

  /* 先確認基本欄位本身過不過得了。過不了就換下一組。 */
  for (const set of baseSets) {
    try { await call([], set); base = set; thin = set !== baseSets[0]; break; }
    catch (e) { if (set === baseSets[baseSets.length - 1]) throw e; }
  }

  if (!metrics.length) return { data: await call([]), ok: true, dropped: [], thin };

  const good = [], dropped = [];
  for (const m of metrics) {
    try { await call([m]); good.push(m); }
    catch (e) { dropped.push(m); }
  }

  if (!good.length) {
    /* 一個都拿不到：多半是 token 少了 read_insights。
       貼文本身還是讀得到。 */
    return { data: await call([]), ok: false, dropped, thin };
  }
  return { data: await call(good), ok: true, dropped, thin };
}

/** insights 回來的形狀是陣列包陣列，攤平成 {指標名: 數字} */
function pickInsights(p) {
  const out = {};
  for (const row of p.insights?.data || []) {
    const v = row.values?.[0]?.value;
    if (typeof v === 'number') out[row.name] = v;
  }
  return out;
}

/* ---------- Graph 呼叫 ---------- */
async function graph(env, path, params) {
  const u = new URL(`https://graph.facebook.com/${graphVer(env)}/${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  }
  u.searchParams.set('access_token', env.FB_PAGE_TOKEN);
  const r = await fetch(u, { headers: { Accept: 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(fbError(d));
  return d;
}

function firstLine(s) {
  return String(s || '').split('\n')[0].slice(0, 60) || '（沒有文字）';
}

/** Meta 給的是 ISO 時間，轉成後台其他地方用的格式 */
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso), z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} `
       + `${z(d.getHours())}:${z(d.getMinutes())}`;
}

/* ---------- 小工具 ---------- */

function need(env, keys) {
  const missing = keys.filter(k => !env[k]);
  if (missing.length) {
    throw new Error('後端還沒設定這些金鑰：' + missing.join('、')
      + '。用 wrangler secret put <名稱> 設定。');
  }
}

/** Meta 的錯誤訊息藏得很深，挖出來才看得懂 */
function fbError(d) {
  const e = d.error || {};
  const bits = [e.message, e.error_user_msg, e.type && `type=${e.type}`, e.code && `code=${e.code}`]
    .filter(Boolean);
  return 'Meta API：' + (bits.join(' · ') || JSON.stringify(d));
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cors(res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  h.set('Access-Control-Max-Age', '86400');
  return new Response(res.body, { status: res.status, headers: h });
}

/* ------------------------------------------------------------
   之後要做得更嚴謹的話
   ------------------------------------------------------------
   上面用 TANJU_KEY 擋路人，但那把金鑰仍然在前端，
   有心人打開原始碼就拿得到。比較好的做法是驗證 Supabase 的 JWT ——
   前端本來就會帶著登入者的 token，後端只要確認它是真的、
   而且這個人有 edit.social 權限就好。

   const jwt = request.headers.get('Authorization')?.replace('Bearer ', '');
   const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
     headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + jwt },
   });
   if (!r.ok) return cors(json({ error: '請先登入' }, 401));
   // 再查 users 表確認 perm 是不是 super/admin/editor

   等 AUTH_MODE 切成 'supabase' 之後就可以換成這個做法。
   ------------------------------------------------------------ */
