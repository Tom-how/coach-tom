(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  // 跟工作室官網在同一個 github.io 網域，名稱要分開，設定和草稿才不會互相覆蓋
  const CONFIG_KEY = 'profile-admin-github';
  const IMAGE_MAX = 1600;
  const VIDEO_MAX_MB = 50;

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'value') node.value = value;
      else if (key === 'checked') node.checked = !!value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    children.flat().forEach((child) => { if (child !== null && child !== undefined) node.append(child); });
    return node;
  }

  /* ---------- 草稿儲存（IndexedDB，圖片較大也放得下） ---------- */
  const dbReady = new Promise((resolve, reject) => {
    const open = indexedDB.open('profile-admin', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  async function kv(mode, fn) {
    const db = await dbReady;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  }
  const readDraft = () => kv('readonly', (s) => s.get('draft'));
  const writeDraft = (v) => kv('readwrite', (s) => s.put(v, 'draft'));
  const clearDraft = () => kv('readwrite', (s) => s.delete('draft'));

  /* ---------- 後台欄位定義 ---------- */
  const PANELS = [
    { id: 'hero', label: '第一眼', desc: '打開網站第一個畫面：照片、名字和一句話。這裡最重要。', fields: [
      { k: 'hero.name', l: '姓名', t: 'text' },
      { k: 'hero.nameEn', l: '英文名', t: 'text', hint: '會自動用大寫字母顯示。' },
      { k: 'hero.title', l: '職稱', t: 'text', hint: '例如：肌力與體能教練' },
      { k: 'hero.tagline', l: '一句話定位', t: 'textarea', rows: 2, hint: '你最想被記住的一句話，越短越好。' },
      { k: 'hero.photo', l: '主視覺照片', t: 'image', hint: '滿版顯示，建議用橫的動作照，人物在畫面中間偏右，左邊留給文字。' },
      { k: 'hero.grayscale', l: '照片轉黑白', t: 'check' }
    ] },
    { id: 'about', label: '介紹', desc: '兩三句自我介紹，旁邊放一張卡通圖當裝飾。', fields: [
      { k: 'bio', l: '自我介紹', t: 'textarea', rows: 4, hint: '換行就是分行。建議兩三句就好。' },
      { k: 'decor.image', l: '裝飾插畫', t: 'image', hint: '介紹旁邊的斜切框，建議用直式的卡通圖。移除就不顯示。' }
    ] },
    { id: 'skills', label: '專長', desc: '會依序編號 01、02、03… 顯示。', fields: [
      { k: 'specialties', t: 'list', add: '新增專長', title: (i) => i.name || '新專長',
        blank: () => ({ name: '' }),
        item: [{ k: 'name', l: '專長', t: 'text', hint: '例如：健力三項' }] }
    ] },
    { id: 'comps', label: '比賽經歷', desc: '最新的放最上面。沒有任何一筆時，這個區塊不會顯示。', fields: [
      { k: 'competitions', t: 'list', add: '新增比賽', prepend: true, title: (i) => [i.year, i.name, i.result].filter(Boolean).join(' ') || '新比賽',
        blank: () => ({ year: '', name: '', note: '', result: '' }),
        item: [
          { k: 'year', l: '年份', t: 'text', hint: '例如：2023' },
          { k: 'name', l: '比賽名稱', t: 'text', hint: '例如：全國健力錦標賽' },
          { k: 'note', l: '組別或成績細節（選填）', t: 'text', hint: '例如：男子 74 公斤級｜總和 520 kg' },
          { k: 'result', l: '名次（選填）', t: 'text', hint: '例如：第 3 名。會用紅色大字顯示在右邊。' }
        ] }
    ] },
    { id: 'certs', label: '證照', desc: '大字顯示完整中文名稱，下方小字顯示英文縮寫和年份。', fields: [
      { k: 'certs', t: 'list', add: '新增證照', title: (i) => i.name || i.abbr || '新證照',
        blank: () => ({ name: '', abbr: '', year: '' }),
        item: [
          { k: 'name', l: '證照名稱', t: 'text', hint: '例如：國際 B 級壺鈴教練（整個名稱寫在一起）' },
          { k: 'abbr', l: '發證單位或縮寫（選填）', t: 'text', hint: '例如：ISCA、NASM-CPT' },
          { k: 'year', l: '取得年份（選填）', t: 'text' }
        ] }
    ] },
    { id: 'works', label: '研習進修', desc: '最新的放最上面。沒有任何一筆時，這個區塊不會顯示。', fields: [
      { k: 'workshops', t: 'list', add: '新增研習', prepend: true, title: (i) => [i.year, i.name].filter(Boolean).join(' ') || '新研習',
        blank: () => ({ year: '', name: '', org: '' }),
        item: [
          { k: 'year', l: '年份', t: 'text', hint: '例如：2025' },
          { k: 'name', l: '研習名稱', t: 'text', hint: '例如：舉重專項運動防護與科學' },
          { k: 'org', l: '主辦單位（選填）', t: 'text', hint: '例如：台灣運動傷害防護學會' }
        ] }
    ] },
    { id: 'highlights', label: '亮點數字', desc: '選填。有填才會在證照上方顯示，建議剛好三個。', fields: [
      { k: 'highlights', t: 'list', add: '新增數字', title: (i) => [i.value, i.unit, i.label].filter(Boolean).join(' ') || '新數字',
        blank: () => ({ value: '', unit: '', label: '' }),
        item: [
          { k: 'value', l: '數字', t: 'text', hint: '例如：8、300、TOP 3' },
          { k: 'unit', l: '單位（選填）', t: 'text', hint: '例如：年、+。會用紅色小字顯示。' },
          { k: 'label', l: '說明', t: 'text', hint: '例如：教學經驗' }
        ] }
    ] },
    { id: 'studio', label: '合作工作室', desc: '頁面下方連到工作室官網的卡片。', fields: [
      { k: 'studio.name', l: '工作室名稱', t: 'text' },
      { k: 'studio.desc', l: '一句說明', t: 'text' },
      { k: 'studio.url', l: '工作室官網連結', t: 'url' },
      { k: 'studio.image', l: '工作室照片', t: 'image' }
    ] },
    { id: 'links', label: '聯絡連結', desc: '你個人的聯絡方式，會顯示在第一屏的按鈕和頁尾。沒填的就不會顯示。', fields: [
      { k: 'links.instagram', l: '個人 Instagram 連結', t: 'url', hint: '第一屏的紅色「Instagram 私訊我」按鈕。' },
      { k: 'links.line', l: '個人 LINE 連結', t: 'url', hint: '在 LINE「主頁 → 加入好友 → QR 碼」可以複製你的邀請連結。' },
      { k: 'links.threads', l: 'Threads 連結', t: 'url' }
    ] },
    { id: 'site', label: '網站資訊', desc: '分享到 LINE、FB 時顯示的說明，以及流量統計。',
      link: { href: 'https://analytics.google.com/analytics/web/', label: '查看流量報表' },
      fields: [
        { k: 'site.description', l: '網站說明', t: 'textarea', rows: 2 },
        { k: 'site.gaId', l: 'GA 評估 ID（選填）', t: 'text', hint: '格式像 G-XXXXXXXXXX。可以另外建一個，也可以跟工作室官網共用。' }
      ] },
    { id: 'publish', label: '發布設定', custom: true }
  ];
  /* ---------- 狀態 ---------- */
  let data = null;
  let current = 'hero';
  let saveTimer;

  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
    target[last] = value;
  }

  function touched() {
    $('save-state').textContent = '儲存草稿中…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    try {
      await writeDraft(data);
      $('save-state').textContent = '草稿已儲存在這台裝置，尚未發布';
      $('draft-banner').hidden = false;
    } catch (err) {
      $('save-state').textContent = '草稿儲存失敗：' + err.message;
    }
  }

  /* ---------- 圖片處理 ---------- */
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) { reject(new Error('請選擇圖片檔')); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, IMAGE_MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('這張圖片無法讀取')); };
      img.src = url;
    });
  }

  /* ---------- 表單產生器 ---------- */
  function imageField(field, obj, key) {
    const wrap = el('div', { class: 'image-field' });
    const draw = () => {
      const value = obj[key];
      const status = el('span', { class: 'hint', role: 'status' });
      const input = el('input', { type: 'file', accept: 'image/*', onchange: async () => {
        if (!input.files[0]) return;
        status.textContent = '處理圖片中…';
        try {
          obj[key] = await resizeImage(input.files[0]);
          touched();
          draw();
        } catch (err) { status.textContent = err.message; }
      } });
      wrap.replaceChildren(
        value ? el('img', { src: value, alt: '' }) : el('div', { class: 'blank' }, '尚無圖片'),
        el('div', { class: 'image-controls' },
          el('label', { class: 'btn upload-btn' }, value ? '更換圖片' : '上傳圖片', input),
          value ? el('button', { class: 'btn btn-small', type: 'button', onclick: () => { obj[key] = ''; touched(); draw(); } }, '移除圖片') : null,
          status)
      );
    };
    draw();
    return el('div', { class: 'field' }, el('span', { class: 'field-label' }, field.l), wrap,
      field.hint ? el('span', { class: 'hint' }, field.hint) : null);
  }

  // 影片太大不適合放進草稿，選好檔案就直接上傳，內容裡只存檔案路徑
  function videoField(field, obj, key) {
    const wrap = el('div', { class: 'image-field' });
    let localPreview = '';
    const readBase64 = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('這個影片檔無法讀取'));
      reader.readAsDataURL(file);
    });
    const draw = (message) => {
      const value = obj[key];
      const status = el('span', { class: 'hint', role: 'status' }, message || '');
      const input = el('input', { type: 'file', accept: 'video/mp4,video/webm', onchange: async () => {
        const file = input.files[0];
        if (!file) return;
        input.value = '';
        const ext = (file.name.match(/\.(mp4|webm)$/i) || [])[1];
        if (!ext) { status.textContent = '請選擇 MP4 或 WebM 影片'; return; }
        if (file.size > VIDEO_MAX_MB * 1024 * 1024) { status.textContent = '影片不能超過 ' + VIDEO_MAX_MB + ' MB，請先壓縮'; return; }
        const cfg = getConfig();
        if (!configReady(cfg)) { status.textContent = '請先到「發布設定」填好金鑰，才能上傳影片'; return; }
        status.textContent = '上傳影片中，請不要關閉頁面…';
        input.disabled = true;
        try {
          const path = 'assets/uploads/' + Date.now() + '.' + ext.toLowerCase();
          await putFile(cfg, path, await readBase64(file), '後台上傳影片');
          obj[key] = path;
          localPreview = URL.createObjectURL(file);
          touched();
          draw('上傳完成，請按「發布到網站」。網站要等幾分鐘才能播放。');
        } catch (err) {
          input.disabled = false;
          status.textContent = '上傳失敗：' + err.message;
        }
      } });
      wrap.replaceChildren(
        value ? el('video', { src: localPreview || value, controls: true, playsinline: true, preload: 'metadata' }) : el('div', { class: 'blank' }, '尚無影片'),
        el('div', { class: 'image-controls' },
          el('label', { class: 'btn upload-btn' }, value ? '更換影片' : '上傳影片', input),
          value ? el('button', { class: 'btn btn-small', type: 'button', onclick: () => { obj[key] = ''; localPreview = ''; touched(); draw(); } }, '移除影片') : null,
          status)
      );
    };
    draw();
    return el('div', { class: 'field' }, el('span', { class: 'field-label' }, field.l), wrap,
      el('span', { class: 'hint' }, '建議 4:3 的 MP4，檔案 ' + VIDEO_MAX_MB + ' MB 以內。有影片時會取代下方的介紹照片。'));
  }

  function renderField(field, obj, key) {
    if (field.t === 'list') return renderList(field, obj, key);
    if (field.t === 'image') return imageField(field, obj, key);
    if (field.t === 'video') return videoField(field, obj, key);
    if (field.t === 'check') {
      return el('label', { class: 'check' },
        el('input', { type: 'checkbox', checked: field.defaultOff ? obj[key] === true : obj[key] !== false, onchange: (e) => { obj[key] = e.target.checked; touched(); } }),
        field.l);
    }
    const update = (e) => { obj[key] = e.target.value; touched(); };
    const hint = field.hint ? el('span', { class: 'hint' }, field.hint) : null;
    if (field.t === 'textarea') {
      const area = el('textarea', { rows: field.rows || 4, value: obj[key] || '', oninput: update });
      let insert = null;
      if (field.insertImage) {
        const status = el('span', { class: 'hint', role: 'status' });
        const input = el('input', { type: 'file', accept: 'image/*', onchange: async () => {
          if (!input.files[0]) return;
          status.textContent = '處理圖片中…';
          try {
            const url = await resizeImage(input.files[0]);
            const pos = area.selectionStart || area.value.length;
            const id = 'img' + Date.now().toString(36);
            data.__pending = data.__pending || {};
            data.__pending[id] = url;
            area.value = area.value.slice(0, pos) + '\n\n![圖片說明](pending:' + id + ')\n\n' + area.value.slice(pos);
            obj[key] = area.value;
            status.textContent = '圖片已插入內文';
            touched();
          } catch (err) { status.textContent = err.message; }
          input.value = '';
        } });
        insert = el('div', { style: 'margin-top:8px' }, el('label', { class: 'btn btn-small upload-btn' }, '在游標處插入圖片', input), status);
      }
      return el('div', { class: 'field' }, el('label', null, el('span', { class: 'field-label' }, field.l), area), hint, insert);
    }
    return el('label', { class: 'field' }, el('span', null, field.l),
      el('input', { type: field.t === 'url' ? 'url' : field.t === 'date' ? 'date' : 'text', value: obj[key] || '', oninput: update, placeholder: field.t === 'url' ? 'https://' : null }), hint);
  }

  function renderList(field, obj, key) {
    if (!Array.isArray(obj[key])) obj[key] = [];
    const list = obj[key];
    const box = el('div', { class: 'list' });
    const open = new WeakSet();
    const draw = () => {
      box.replaceChildren(...list.map((item, index) => {
        const move = (delta) => (event) => {
          event.preventDefault();
          const to = index + delta;
          if (to < 0 || to >= list.length) return;
          [list[index], list[to]] = [list[to], list[index]];
          touched();
          draw();
        };
        const titleNode = el('span', { class: 'item-title' }, field.title(item) || '未命名');
        const body = el('div', { class: 'item-body', oninput: () => { titleNode.textContent = field.title(item) || '未命名'; } },
          field.item.map((sub) => renderField(sub, item, sub.k)));
        const details = el('details', { class: 'item', ontoggle: () => { if (details.open) open.add(item); else open.delete(item); } },
          el('summary', null, titleNode, el('span', { class: 'item-actions' },
            el('button', { class: 'btn btn-small', type: 'button', 'aria-label': '上移', onclick: move(-1) }, '↑'),
            el('button', { class: 'btn btn-small', type: 'button', 'aria-label': '下移', onclick: move(1) }, '↓'),
            el('button', { class: 'btn btn-small btn-danger', type: 'button', onclick: (event) => {
              event.preventDefault();
              if (!confirm('確定要刪除「' + (field.title(item) || '這個項目') + '」嗎？')) return;
              list.splice(index, 1);
              touched();
              draw();
            } }, '刪除'))),
          body);
        if (open.has(item)) details.open = true;
        return details;
      }));
    };
    draw();
    const add = el('button', { class: 'btn', type: 'button', onclick: () => {
      const item = field.blank();
      if (field.prepend) list.unshift(item); else list.push(item);
      open.add(item);
      touched();
      draw();
    } }, '＋ ' + field.add);
    return el('div', { class: 'field' }, field.l ? el('span', { class: 'field-label' }, field.l) : null, box, add);
  }

  function renderTabs() {
    $('tabs').replaceChildren(...PANELS.map((p) => el('button', {
      type: 'button', 'aria-current': p.id === current ? 'true' : 'false',
      onclick: () => { current = p.id; renderTabs(); renderPanel(); window.scrollTo(0, 0); }
    }, p.label)));
  }

  function renderPanel() {
    const panel = PANELS.find((p) => p.id === current);
    if (panel.custom) { renderPublishPanel(); return; }
    const nodes = [el('h1', null, panel.label), el('p', { class: 'panel-desc' }, panel.desc)];
    panel.fields.forEach((field) => {
      const keys = field.k.split('.');
      const last = keys.pop();
      const parent = keys.reduce((o, k) => (o[k] = o[k] || {}), data);
      nodes.push(renderField(field, parent, last));
    });
    if (panel.link) nodes.push(el('a', { class: 'btn', href: panel.link.href, target: '_blank', rel: 'noopener' }, panel.link.label));
    $('panel').replaceChildren(...nodes);
  }

  /* ---------- GitHub 發布 ---------- */
  function guessRepo() {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!m) return { owner: '', repo: '' };
    const first = location.pathname.split('/').filter(Boolean)[0];
    return { owner: m[1], repo: first && !first.endsWith('.html') ? first : m[1] + '.github.io' };
  }
  function getConfig() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; } catch (err) { saved = {}; }
    return Object.assign({ branch: 'main', token: '' }, guessRepo(), saved);
  }
  function setConfig(cfg) {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch (err) { /* 無痕模式下每次都要重新輸入 */ }
  }
  const configReady = (cfg) => cfg.owner && cfg.repo && cfg.token;

  async function gh(cfg, path, options) {
    const base = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo);
    const res = await fetch(base + path, Object.assign({}, options, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + cfg.token, 'X-GitHub-Api-Version': '2022-11-28' }
    }));
    if (res.status === 404 && (!options || !options.method)) return null;
    if (!res.ok) {
      const messages = { 401: '金鑰無效或已過期，請到「發布設定」更新', 403: '金鑰沒有寫入權限，或已達 GitHub 使用上限', 404: '找不到這個儲存庫，請檢查帳號與儲存庫名稱', 409: '檔案剛被其他裝置更新，請再發布一次' };
      throw new Error(messages[res.status] || 'GitHub 回應錯誤（' + res.status + '）');
    }
    return res.json();
  }
  const contentsPath = (cfg, path) => '/contents/' + path.split('/').map(encodeURIComponent).join('/');
  async function getFile(cfg, path) {
    return gh(cfg, contentsPath(cfg, path) + '?ref=' + encodeURIComponent(cfg.branch));
  }
  async function putFile(cfg, path, base64, message) {
    const existing = await getFile(cfg, path);
    return gh(cfg, contentsPath(cfg, path), {
      method: 'PUT',
      body: JSON.stringify({ message, content: base64, branch: cfg.branch, sha: existing ? existing.sha : undefined })
    });
  }
  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  function base64ToUtf8(base64) {
    const binary = atob(base64.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  }

  // 內文插入的圖片在草稿中以 pending:代號 暫存，發布時還原後一起上傳
  function expandPendingImages() {
    const pending = data.__pending || {};
    (data.articles || []).forEach((article) => {
      article.body = String(article.body || '').replace(/pending:([a-z0-9]+)/g, (match, id) => pending[id] || match);
    });
    delete data.__pending;
  }

  // 把內容裡的 data: 圖片上傳成檔案，並換成檔案路徑
  async function uploadImages(cfg, node, log) {
    const pattern = /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g;
    const stamp = Date.now();
    let count = 0;
    const seen = new Map();
    async function upload(dataUrl) {
      if (seen.has(dataUrl)) return seen.get(dataUrl);
      count += 1;
      const path = 'assets/uploads/' + stamp + '-' + count + '.jpg';
      log('上傳第 ' + count + ' 張圖片…');
      await putFile(cfg, path, dataUrl.split(',')[1], '後台上傳圖片');
      seen.set(dataUrl, path);
      return path;
    }
    async function walk(value) {
      if (typeof value === 'string') {
        const found = value.match(pattern);
        if (!found) return value;
        let output = value;
        for (const dataUrl of found) output = output.split(dataUrl).join(await upload(dataUrl));
        return output;
      }
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) value[i] = await walk(value[i]);
        return value;
      }
      if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) value[key] = await walk(value[key]);
      }
      return value;
    }
    await walk(node);
    return count;
  }

  function validate() {
    const problems = [];
    if (!String(getPath(data, 'hero.name') || '').trim()) problems.push('請填寫姓名');
    const urls = { 'links.line': 'LINE 連結', 'links.instagram': 'Instagram 連結', 'links.threads': 'Threads 連結', 'studio.url': '工作室官網連結' };
    Object.entries(urls).forEach(([path, label]) => {
      const v = String(getPath(data, path) || '').trim();
      if (v && !/^https:\/\//i.test(v)) problems.push(label + '需要以 https:// 開頭');
    });
    const gaId = String(getPath(data, 'site.gaId') || '').trim();
    if (gaId && !/^G-[A-Z0-9]+$/i.test(gaId)) problems.push('GA 評估 ID 格式不正確，應該像 G-XXXXXXXXXX');
    return problems;
  }

  async function publish() {
    const cfg = getConfig();
    const box = $('publish-log');
    const log = (msg, cls) => { box.hidden = false; box.replaceChildren(el('span', { class: cls || null }, msg)); };
    if (!configReady(cfg)) {
      current = 'publish'; renderTabs(); renderPanel();
      log('請先完成發布設定，才能發布到網站。', 'err');
      return;
    }
    const problems = validate();
    if (problems.length) { log('無法發布：' + problems.join('；'), 'err'); return; }
    const button = $('publish-btn');
    button.disabled = true;
    button.textContent = '發布中…';
    try {
      expandPendingImages();
      const images = await uploadImages(cfg, data, log);
      await saveNow();
      log('更新網站內容…');
      await putFile(cfg, 'content.json', utf8ToBase64(JSON.stringify(data, null, 2) + '\n'), '後台更新網站內容');
      await clearDraft();
      $('draft-banner').hidden = true;
      $('save-state').textContent = '已發布';
      const siteUrl = new URL('./', location.href).href;
      box.replaceChildren(el('span', { class: 'ok' }, '發布成功' + (images ? '（含 ' + images + ' 張新圖片）' : '') + '。網站約 1～2 分鐘後更新：'), ' ', el('a', { href: siteUrl, target: '_blank', rel: 'noopener' }, '開啟網站'));
      renderPanel();
    } catch (err) {
      log('發布失敗：' + err.message + '。你的編輯內容仍保留在草稿中。', 'err');
    } finally {
      button.disabled = false;
      button.textContent = '發布到網站';
    }
  }

  function renderPublishPanel() {
    const cfg = getConfig();
    const input = (key, label, type, hint) => el('label', { class: 'field' }, el('span', null, label),
      el('input', { type, value: cfg[key] || '', autocomplete: type === 'password' ? 'off' : null, spellcheck: 'false', oninput: (e) => { cfg[key] = e.target.value.trim(); setConfig(cfg); } }),
      hint ? el('span', { class: 'hint' }, hint) : null);
    const status = el('div', { class: 'status', role: 'status' });
    const test = el('button', { class: 'btn', type: 'button', onclick: async () => {
      status.className = 'status';
      status.textContent = '測試中…';
      try {
        if (!configReady(cfg)) throw new Error('請先填完帳號、儲存庫與金鑰');
        const file = await getFile(cfg, 'content.json');
        status.className = 'status ok';
        status.textContent = file ? '連線成功，可以發布。' : '連線成功，但儲存庫裡還沒有 content.json。';
      } catch (err) {
        status.className = 'status err';
        status.textContent = '連線失敗：' + err.message;
      }
    } }, '測試連線');
    const backup = el('button', { class: 'btn', type: 'button', onclick: () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      el('a', { href: url, download: 'content.json' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } }, '下載內容備份');
    const forget = el('button', { class: 'btn btn-danger', type: 'button', onclick: () => {
      cfg.token = '';
      setConfig(cfg);
      renderPanel();
    } }, '從這台裝置移除金鑰');
    $('panel').replaceChildren(
      el('h1', null, '發布設定'),
      el('p', { class: 'panel-desc' }, '每台裝置第一次使用時設定一次。'),
      el('div', { class: 'notice' }, '金鑰就像後台密碼，只會存在這台裝置的瀏覽器。請勿在公用電腦使用，也不要傳給別人。'),
      input('owner', 'GitHub 帳號', 'text'),
      input('repo', '儲存庫名稱', 'text'),
      input('branch', '分支', 'text', '一般維持 main。'),
      input('token', '發布金鑰（Fine-grained token）', 'password', '權限只需要這個儲存庫的 Contents：Read and write。'),
      el('div', { class: 'row' }, test, backup, forget),
      status
    );
  }

  /* ---------- 啟動 ---------- */
  async function loadOnline() {
    const cfg = getConfig();
    if (configReady(cfg)) {
      try {
        const file = await getFile(cfg, 'content.json');
        if (file && file.content) return JSON.parse(base64ToUtf8(file.content));
      } catch (err) { console.warn('改從網站讀取內容', err); }
    }
    const res = await fetch('content.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('content.json ' + res.status);
    return res.json();
  }

  async function init() {
    try {
      const draft = await readDraft();
      if (draft) {
        data = draft;
        $('draft-banner').hidden = false;
        $('save-state').textContent = '草稿尚未發布';
      } else {
        data = await loadOnline();
      }
    } catch (err) {
      $('panel').replaceChildren(el('p', { class: 'status err' }, '內容載入失敗：' + err.message));
      return;
    }
    renderTabs();
    renderPanel();
    $('publish-btn').addEventListener('click', publish);
    $('preview-btn').addEventListener('click', async () => {
      await saveNow();
      window.open('index.html?preview=1', '_blank', 'noopener');
    });
    $('discard-btn').addEventListener('click', async () => {
      if (!confirm('確定要捨棄草稿嗎？尚未發布的修改會消失。')) return;
      await clearDraft();
      data = await loadOnline();
      $('draft-banner').hidden = true;
      $('save-state').textContent = '';
      renderPanel();
    });
  }
  init();
})();
