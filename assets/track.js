/* ============================================================
   營運數據 —— 事件紀錄
   ------------------------------------------------------------
   後台「營運數據」要知道：誰登入了、打開了哪些頁、訪客走到認養的
   哪一步。訂單、回報、貼文本來就有紀錄；這裡補的是那些「動作」。

   寫進 Supabase 的 events 表（先跑 supabase-migrate-events.sql）。
   表還沒建的話第一次寫入會 404，之後這個分頁就不再送，不會一直報錯。

   不記的情況：
     - 機器人、自動化瀏覽器（navigator.webdriver、爬蟲 UA）
       —— 不然營運數字會被爬蟲灌大
     - 在本機開發（localhost）—— 不要把測試的點擊算進真實數據

   訪客代號（vid）是瀏覽器第一次來時隨機產生的，存在那台瀏覽器，
   不含姓名、Email、IP。
   ============================================================ */

const Track = {
  get on() {
    if (typeof CLOUD_ON === 'undefined' || !CLOUD_ON) return false;
    let force = false;
    try { force = localStorage.getItem('rf_track_force') === '1'; } catch (e) {}
    if (force) return true;
    try { if (sessionStorage.getItem('rf_track_off')) return false; } catch (e) {}
    if (navigator.webdriver) return false;
    if (/bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(navigator.userAgent)) return false;
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return false;
    return true;
  },

  /** 這台瀏覽器的匿名代號。localStorage 不能用時，每次都是新的訪客。 */
  vid() {
    try {
      let v = localStorage.getItem('rf_vid');
      if (!v) {
        v = 'v' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        localStorage.setItem('rf_vid', v);
      }
      return v;
    } catch (e) { return 'v-anon'; }
  },

  page() {
    return (location.pathname.split('/').pop() || 'index.html').slice(0, 60);
  },

  /** 記一筆事件。射後不理：失敗不影響畫面。 */
  ev(name, detail) {
    if (!Track.on) return;
    let u = null;
    try { u = sessionStorage.getItem('rf_app_session') || null; } catch (e) {}
    const row = {
      u, vid: Track.vid(), ev: String(name).slice(0, 30), page: Track.page(),
      detail: detail == null ? null : String(detail).slice(0, 120),
    };
    fetch(`${SUPABASE_URL}/rest/v1/events`, {
      method: 'POST',
      keepalive: true,                       // 換頁的瞬間送出也不會被取消
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    }).then(r => {
      /* 404 / 401：表還沒建或沒開權限。這個分頁就不再送了。 */
      if (r.status === 404 || r.status === 401) {
        try { sessionStorage.setItem('rf_track_off', '1'); } catch (e) {}
      }
    }).catch(() => {});
  },

  /**
   * 讀一段時間的事件（後台營運數據用）。
   * Supabase 一次最多回 1000 筆，所以一頁一頁抓。
   * 回傳 { ok, rows, missing } —— missing 代表表還沒建。
   */
  async load(fromISO, toISO) {
    if (typeof CLOUD_ON === 'undefined' || !CLOUD_ON) return { ok: false, rows: [], missing: true };
    const rows = [];
    const PAGE = 1000;
    for (let off = 0; off < 50 * PAGE; off += PAGE) {
      const q = `select=at,u,vid,ev,page,detail&at=gte.${encodeURIComponent(fromISO)}`
              + `&at=lt.${encodeURIComponent(toISO)}&order=at.asc&limit=${PAGE}&offset=${off}`;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/events?${q}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
      });
      if (r.status === 404) return { ok: false, rows: [], missing: true };
      if (!r.ok) throw new Error(`讀取事件失敗（${r.status}）`);
      const part = await r.json();
      rows.push(...part);
      if (part.length < PAGE) break;
    }
    return { ok: true, rows, missing: false };
  },
};

/* 每一頁打開時記一次瀏覽。 */
Track.ev('visit');
