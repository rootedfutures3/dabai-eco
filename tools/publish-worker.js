/**
 * TANJU 社群一鍵發文 —— 後端
 * ============================================================
 * 這支程式是給 Cloudflare Workers 用的（免費方案就夠）。
 * 它存在的唯一理由：各平台的金鑰不能放在前端。
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
    `https://graph.facebook.com/v21.0/${env.FB_PAGE_ID}/feed`, {
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
    `https://graph.facebook.com/v21.0/${env.IG_USER_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl, caption: text, access_token: env.FB_PAGE_TOKEN,
      }),
    });
  const c = await create.json();
  if (!create.ok) throw new Error(fbError(c));

  const publish = await fetch(
    `https://graph.facebook.com/v21.0/${env.IG_USER_ID}/media_publish`, {
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
