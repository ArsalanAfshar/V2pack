// ═══════════════════════════════════════════════════════════════
// V2Pack - پروکسی‌ساز اختصاصی تلگرام روی Cloudflare Workers
// نسخه اصلاح‌شده: ۱.۱.۰
// تغییرات: اصلاح فرمت سکرت FakeTLS (ee) — افزودن دامنه hex
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ۱. تنظیمات اولیه
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  KV_NAMESPACE: 'PROXIES',
  KV_KEYS: {
    PROXIES: 'proxies',
    SETTINGS: 'settings',
  },
  DEFAULT_PORT: 443,
  MAX_PROXIES: 100,
  COOKIE_MAX_AGE: 86400,
  DEFAULT_PASSWORD: 'admin123',
};

// ═══════════════════════════════════════════════════════════════
// ۲. توابع کمکی
// ═══════════════════════════════════════════════════════════════

/**
 * ✅ اصلاح‌شده: تولید سکرت صحیح FakeTLS برای پروکسی MTProto
 *
 * فرمت صحیح: ee + [32 hex chars random] + [hex(domain)]
 * مثال: ee + a1b2....(32 chars) + 776f726b65722e776f726b6572732e646576
 *
 * @param {string} domain - نام دامنه Worker (مثل my-worker.username.workers.dev)
 */
function generateSecret(domain) {
  // ✅ 16 بایت = 32 کاراکتر hex تصادفی
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const hexRandom = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // ✅ دامنه را به hex تبدیل کن (برای SNI در FakeTLS)
  const domainHex = Array.from(new TextEncoder().encode(domain))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // ✅ سکرت کامل: ee + random + domain_hex
  return 'ee' + hexRandom + domainHex;
}

/**
 * تولید شناسه یکتا برای پروکسی‌ها
 */
function generateId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * ✅ اصلاح‌شده: ساخت لینک صحیح پروکسی
 * سکرت از قبل شامل دامنه hex است — فقط server و port نیاز است
 */
function buildProxyLink(domain, port, secret) {
  return `tg://proxy?server=${domain}&port=${port}&secret=${secret}`;
}

/**
 * هش رمز عبور با SHA-256
 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * مقایسه امن در برابر timing attacks
 */
function safeCompare(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * ✅ اصلاح‌شده: دریافت دامنه از URL (lowercase، بدون port)
 */
function getDomain(request) {
  const url = new URL(request.url);
  return url.hostname.toLowerCase();
}

// ═══════════════════════════════════════════════════════════════
// ۳. توابع مدیریت KV
// ═══════════════════════════════════════════════════════════════

async function getProxies(env) {
  try {
    const data = await env.PROXIES.get(CONFIG.KV_KEYS.PROXIES);
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

async function saveProxies(env, proxies) {
  await env.PROXIES.put(CONFIG.KV_KEYS.PROXIES, JSON.stringify(proxies));
}

async function getSettings(env) {
  try {
    const data = await env.PROXIES.get(CONFIG.KV_KEYS.SETTINGS);
    if (!data) {
      return {
        adminPassword: await hashPassword(env.ADMIN_PASSWORD || CONFIG.DEFAULT_PASSWORD),
        defaultPort: CONFIG.DEFAULT_PORT,
      };
    }
    return JSON.parse(data);
  } catch (e) {
    return {
      adminPassword: await hashPassword(env.ADMIN_PASSWORD || CONFIG.DEFAULT_PASSWORD),
      defaultPort: CONFIG.DEFAULT_PORT,
    };
  }
}

async function saveSettings(env, settings) {
  await env.PROXIES.put(CONFIG.KV_KEYS.SETTINGS, JSON.stringify(settings));
}

// ═══════════════════════════════════════════════════════════════
// ۴. ✅ اصلاح‌شده: تابع کمکی برای سازگاری با سکرت‌های قدیمی
// ═══════════════════════════════════════════════════════════════

/**
 * سکرت‌های قدیمی (بدون domain hex) را با افزودن دامنه تکمیل می‌کند
 */
function getFullSecret(proxy, domain) {
  const secret = proxy.secret;
  // سکرت قدیمی: ee + 30 chars (بدون domain hex)
  // طول صحیح: 2 (ee) + 32 (random) + len(domain)*2 >= 34
  if (secret.startsWith('ee') && secret.length < 34) {
    const domainHex = Array.from(new TextEncoder().encode(domain))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    // اگر random part هم کوتاه است (15 بایت = 30 char)، یک بایت اضافه می‌کنیم
    const randomPart = secret.slice(2);
    if (randomPart.length < 32) {
      // پد کردن با '0' برای رسیدن به 32 کاراکتر
      const paddedRandom = randomPart.padEnd(32, '0');
      return 'ee' + paddedRandom + domainHex;
    }
    return secret + domainHex;
  }
  return secret;
}

// ═══════════════════════════════════════════════════════════════
// ۵. صفحات HTML
// ═══════════════════════════════════════════════════════════════

function getHomePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SpeedTest Pro - Network Speed Analysis</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg deg, #0f0c29, #302b63, #24243e);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .container { text-align: center; padding: 40px; max-width: 600px; }
    .logo { font-size: 3rem; margin-bottom: 10px; }
    h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 8px;
      background: linear-gradient(90deg, #00d2ff, #7b2ff7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle { color: #aaa; margin-bottom: 40px; }
    .speed-circle {
      width: 200px; height: 200px;
      border-radius: 50%;
      border: 4px solid #333;
      border-top-color: #00d2ff;
      margin: 0 auto 30px;
      display: flex; align-items: center; justify-content: center;
      font-size: 2.5rem; font-weight: bold;
      animation: spin 2s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn {
      padding: 14px 40px;
      background: linear-gradient(90deg, #00d2ff, #7b2ff7);
      border: none; border-radius: 50px;
      color: white; font-size: 1rem;
      cursor: pointer; font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">⚡</div>
    <h1>SpeedTest Pro</h1>
    <p class="subtitle">Advanced Network Speed Analysis Tool</p>
    <div class="speed-circle">--</div>
    <button class="btn" onclick="startTest()">Start Speed Test</button>
  </div>
  <script>
    function startTest() {
      const circle = document.querySelector('.speed-circle');
      let speed = 0;
      const interval = setInterval(() => {
        speed = Math.floor(Math.random() * 100);
        circle.textContent = speed;
      }, 100);
      setTimeout(() => {
        clearInterval(interval);
        circle.textContent = Math.floor(Math.random() * 50 + 50) + ' Mbps';
      }, 3000);
    }
  </script>
</body>
</html>`;
}

function getPanelLoginPage(error = '') {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ورود به پنل</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Tahoma, sans-serif;
      background: #0f0f1a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .card {
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 400px;
    }
    h1 { text-align: center; margin-bottom: 30px; color: #7b2ff7; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; color: #aaa; font-size: 0.9rem; }
    input {
      width: 100%;
      padding: 12px 16px;
      background: #0f0f1a;
      border: 1px solid #333;
      border-radius: 8px;
      color: white;
      font-size: 1rem;
    }
    input:focus { outline: none; border-color: #7b2ff7; }
    .btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(90deg, #7b2ff7, #00d2ff);
      border: none;
      border-radius: 8px;
      color: white;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
    }
    .error { color: #ff4444; margin-bottom: 16px; text-align: center; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔐 ورود به پنل</h1>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/panel/login">
      <div class="form-group">
        <label>رمز عبور</label>
        <input type="password" name="password" placeholder="رمز عبور را وارد کنید" required autofocus>
      </div>
      <button type="submit" class="btn">ورود به پنل</button>
    </form>
  </div>
</body>
</html>`;
}

async function getDashboardPage(env, request) {
  const proxies = await getProxies(env);
  const domain = getDomain(request);
  const port = CONFIG.DEFAULT_PORT;

  const proxyRows = proxies.map(proxy => {
    // ✅ اصلاح‌شده: از getFullSecret برای سازگاری با سکرت‌های قدیمی استفاده می‌شود
    const fullSecret = getFullSecret(proxy, domain);
    const link = buildProxyLink(domain, port, fullSecret);
    const date = new Date(proxy.createdAt).toLocaleDateString('fa-IR');
    const statusBadge = proxy.isActive
      ? '<span style="color:#4caf50">● فعال</span>'
      : '<span style="color:#f44336">● غیرفعال</span>';

    return `<tr>
      <td>${proxy.id}</td>
      <td style="font-family:monospace;font-size:0.75rem">${fullSecret.slice(0, 20)}...</td>
      <td>${date}</td>
      <td>${statusBadge}</td>
      <td>
        <button onclick="copyProxy('${link}')" style="margin:2px;padding:4px 8px;background:#7b2ff7;border:none;border-radius:4px;color:white;cursor:pointer">📋 کپی</button>
        <button onclick="toggleProxy('${proxy.id}', ${!proxy.isActive})" style="margin:2px;padding:4px 8px;background:#333;border:none;border-radius:4px;color:white;cursor:pointer">
          ${proxy.isActive ? '⏸ غیرفعال' : '▶ فعال'}
        </button>
        <button onclick="deleteProxy('${proxy.id}')" style="margin:2px;padding:4px 8px;background:#f44336;border:none;border-radius:4px;color:white;cursor:pointer">🗑 حذف</button>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>داشبورد V2Pack</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Tahoma, sans-serif; background: #0f0f1a; color: white; }
    .header {
      background: #1a1a2e;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #333;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .card {
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    h2 { margin-bottom: 16px; color: #7b2ff7; }
    .btn {
      padding: 12px 24px;
      background: linear-gradient(90deg, #7b2ff7, #00d2ff);
      border: none; border-radius: 8px;
      color: white; font-size: 1rem;
      cursor: pointer; font-weight: bold;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      padding: 12px;
      border-bottom: 1px solid #333;
      text-align: right;
      font-size: 0.9rem;
    }
    th { color: #aaa; font-weight: normal; }
    .logout { color: #aaa; text-decoration: none; font-size: 0.9rem; }
    .logout:hover { color: white; }
    .info-box {
      background: #0f2a0f;
      border: 1px solid #2a5a2a;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
      font-size: 0.85rem;
      color: #90ee90;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛡 V2Pack Dashboard</h1>
    <a href="/panel/logout" class="logout">خروج ↩</a>
  </div>
  <div class="container">
    <div class="card">
      <h2>⚡ ساخت پروکسی جدید</h2>
      <div class="info-box">
        ✅ سکرت با فرمت صحیح FakeTLS (ee + 32hex + domain_hex) تولید می‌شود<br>
        دامنه Worker: <strong>${domain}</strong>
      </div>
      <p style="color:#aaa;margin-bottom:16px;">
        با کلیک روی دکمه زیر، یک پروکسی MTProto با سکرت تصادفی ساخته می‌شود.
        ${proxies.length >= CONFIG.MAX_PROXIES ? '<span style="color:#f44336">⚠️ به حداکثر رسیده‌اید</span>' : ''}
      </p>
      <button class="btn" onclick="createProxy()" ${proxies.length >= CONFIG.MAX_PROXIES ? 'disabled' : ''}>
        ➕ ساخت پروکسی جدید
      </button>
    </div>

    <div class="card">
      <h2>📋 لیست پروکسی‌ها (${proxies.length}/${CONFIG.MAX_PROXIES})</h2>
      ${proxies.length === 0
        ? '<p style="color:#aaa;text-align:center;padding:40px">📭 هنوز هیچ پروکسی‌ای ساخته نشده</p>'
        : `<table>
          <thead><tr>
            <th>شناسه</th><th>سکرت (خلاصه)</th><th>تاریخ ساخت</th><th>وضعیت</th><th>عملیات</th>
          </tr></thead>
          <tbody>${proxyRows}</tbody>
        </table>`
      }
    </div>
  </div>

  <script>
    async function createProxy() {
      try {
        const res = await fetch('/api/proxy/create', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert('✅ پروکسی ساخته شد!\nلینک: ' + data.link);
          location.reload();
        } else {
          alert('❌ خطا: ' + (data.error || 'نامشخص'));
        }
      } catch (e) {
        alert('❌ خطای شبکه: ' + e.message);
      }
    }

    function copyProxy(link) {
      navigator.clipboard.writeText(link).then(() => {
        alert('✅ لینک کپی شد:\n' + link);
      });
    }

    async function deleteProxy(id) {
      if (!confirm('آیا مطمئنید؟')) return;
      const res = await fetch('/api/proxy/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) location.reload();
      else alert('❌ خطا: ' + (data.error || 'نامشخص'));
    }

    async function toggleProxy(id, newStatus) {
      const res = await fetch('/api/proxy/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: newStatus })
      });
      const data = await res.json();
      if (data.success) location.reload();
      else alert('❌ خطا: ' + (data.error || 'نامشخص'));
    }
  </script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// ۶. احراز هویت
// ═══════════════════════════════════════════════════════════════

function getAuthCookie(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => c.trim().split('=').map(s => s.trim()))
  );
  return cookies['auth_token'] || null;
}

async function isAuthenticated(request, env) {
  const token = getAuthCookie(request);
  if (!token) return false;
  const settings = await getSettings(env);
  return safeCompare(token, settings.adminPassword);
}

function createAuthCookie(token) {
  return `auth_token=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${CONFIG.COOKIE_MAX_AGE}; Path=/`;
}

// ═══════════════════════════════════════════════════════════════
// ۷. مسیریابی درخواست‌ها
// ═══════════════════════════════════════════════════════════════

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // صفحه اصلی (SpeedTest جعلی)
  if (path === '/') {
    return new Response(getHomePage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // پنل مدیریت
  if (path === '/panel') {
    if (await isAuthenticated(request, env)) {
      return Response.redirect(new URL('/panel/dashboard', request.url), 302);
    }
    return new Response(getPanelLoginPage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  if (path === '/panel/login' && request.method === 'POST') {
    const formData = await request.formData();
    const password = formData.get('password') || '';
    const settings = await getSettings(env);
    const passwordHash = await hashPassword(password);

    if (safeCompare(passwordHash, settings.adminPassword)) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/panel/dashboard',
          'Set-Cookie': createAuthCookie(passwordHash),
        }
      });
    }
    return new Response(getPanelLoginPage('❌ رمز عبور اشتباه است'), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  if (path === '/panel/dashboard') {
    if (!await isAuthenticated(request, env)) {
      return Response.redirect(new URL('/panel', request.url), 302);
    }
    return new Response(await getDashboardPage(env, request), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  if (path === '/panel/logout') {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/panel',
        'Set-Cookie': 'auth_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/',
      }
    });
  }

  // API endpoints
  if (path.startsWith('/api/')) {
    if (!await isAuthenticated(request, env)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return handleAPI(request, env, path);
  }

  return new Response('Not Found', { status: 404 });
}

async function handleAPI(request, env, path) {
  // ✅ اصلاح‌شده: ساخت پروکسی با سکرت کامل (شامل domain hex)
  if (path === '/api/proxy/create' && request.method === 'POST') {
    const proxies = await getProxies(env);
    if (proxies.length >= CONFIG.MAX_PROXIES) {
      return new Response(JSON.stringify({ error: 'به حداکثر تعداد پروکسی رسیده‌اید' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    const domain = getDomain(request);
    // ✅ سکرت با دامنه ساخته می‌شود
    const secret = generateSecret(domain);
    const id = generateId();
    const newProxy = {
      id,
      secret,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    proxies.push(newProxy);
    await saveProxies(env, proxies);

    const link = buildProxyLink(domain, CONFIG.DEFAULT_PORT, secret);
    return new Response(JSON.stringify({
      success: true,
      proxy: newProxy,
      link,
      // اطلاعات debug
      debug: {
        domain,
        secretLength: secret.length,
        secretPreview: secret.slice(0, 10) + '...',
        domainHex: Array.from(new TextEncoder().encode(domain))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
      }
    }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  if (path === '/api/proxy/delete' && request.method === 'DELETE') {
    const { id } = await request.json();
    if (!id) {
      return new Response(JSON.stringify({ error: 'id الزامی است' }), {
        status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    let proxies = await getProxies(env);
    const initialLength = proxies.length;
    proxies = proxies.filter(p => p.id !== id);
    if (proxies.length === initialLength) {
      return new Response(JSON.stringify({ error: 'پروکسی یافت نشد' }), {
        status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    await saveProxies(env, proxies);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  if (path === '/api/proxy/toggle' && request.method === 'PATCH') {
    const { id, isActive } = await request.json();
    if (!id || typeof isActive !== 'boolean') {
      return new Response(JSON.stringify({ error: 'id و isActive الزامی است' }), {
        status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    const proxies = await getProxies(env);
    const proxy = proxies.find(p => p.id === id);
    if (!proxy) {
      return new Response(JSON.stringify({ error: 'پروکسی یافت نشد' }), {
        status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    proxy.isActive = isActive;
    await saveProxies(env, proxies);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  if (path === '/api/settings/password' && request.method === 'POST') {
    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد' }), {
        status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    const settings = await getSettings(env);
    const currentHash = await hashPassword(currentPassword);
    if (!safeCompare(currentHash, settings.adminPassword)) {
      return new Response(JSON.stringify({ error: 'رمز عبور فعلی اشتباه است' }), {
        status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    settings.adminPassword = await hashPassword(newPassword);
    await saveSettings(env, settings);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

// ═══════════════════════════════════════════════════════════════
// ۸. ✅ اصلاح‌شده: Entry Point با بررسی KV
// ═══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    // ✅ بررسی اتصال KV قبل از هر چیز
    if (!env.PROXIES) {
      const errorMsg = `
⚠️ خطای پیکربندی: KV Namespace متصل نشده است!

راه‌حل:
1. در Cloudflare Dashboard به Workers > Settings > Bindings بروید
2. روی "Add binding" کلیک کنید
3. Variable name: PROXIES
4. KV namespace: فضای نامی که ساخته‌اید را انتخاب کنید
5. ذخیره و دیپلوی کنید

مستندات: https://github.com/ArsalanAfshar/V2pack
      `;
      return new Response(errorMsg, {
        status: 503,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Error': 'KV_NOT_BOUND',
        }
      });
    }

    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }
};
