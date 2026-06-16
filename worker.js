// ============================================================
// V2Pack - پروکسی‌ساز اختصاصی تلگرام روی Cloudflare Workers
// نسخه: 1.0.0
// ============================================================

// ============================================================
// ۱. تنظیمات اولیه
// ============================================================

const CONFIG = {
  // نام KV Namespace (باید با نام binding در dashboard یکی باشد)
  KV_NAMESPACE: 'PROXIES',
  
  // کلیدهای KV
  KV_KEYS: {
    PROXIES: 'proxies',
    SETTINGS: 'settings',
  },
  
  // پورت پیش‌فرض پروکسی
  DEFAULT_PORT: 443,
  
  // حداکثر تعداد پروکسی‌ها
  MAX_PROXIES: 100,
  
  // مدت اعتبار کوکی (۲۴ ساعت)
  COOKIE_MAX_AGE: 86400,
  
  // رمز عبور پیش‌فرض (در صورت عدم تنظیم متغیر محیطی)
  DEFAULT_PASSWORD: 'admin123',
};

// ============================================================
// ۲. توابع کمکی (تولید سکرت، ساخت لینک، هش کردن)
// ============================================================

/**
 * تولید یک سکرت تصادفی برای MTProto
 * فرمت: ee + 30 کاراکتر هگز تصادفی
 */
function generateSecret() {
  const randomBytes = new Uint8Array(15);
  crypto.getRandomValues(randomBytes);
  const hexString = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return 'ee' + hexString;
}

/**
 * تولید یک شناسه یکتا برای پروکسی
 */
function generateId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * ساخت لینک تلگرام برای پروکسی
 */
function buildProxyLink(domain, port, secret) {
  return `tg://proxy?server=${domain}&port=${port}&secret=${secret}`;
}

/**
 * هش کردن رمز عبور با SHA-256
 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * مقایسه امن دو رشته (جلوگیری از timing attacks)
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
 * دریافت domain از URL
 */
function getDomain(request) {
  const url = new URL(request.url);
  return url.hostname;
}

// ============================================================
// ۳. توابع مدیریت KV (گرفتن و ذخیره پروکسی‌ها و تنظیمات)
// ============================================================

/**
 * دریافت لیست پروکسی‌ها از KV
 */
async function getProxies(env) {
  try {
    const data = await env.PROXIES.get(CONFIG.KV_KEYS.PROXIES);
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

/**
 * ذخیره لیست پروکسی‌ها در KV
 */
async function saveProxies(env, proxies) {
  await env.PROXIES.put(CONFIG.KV_KEYS.PROXIES, JSON.stringify(proxies));
}

/**
 * دریافت تنظیمات از KV
 */
async function getSettings(env) {
  try {
    const data = await env.PROXIES.get(CONFIG.KV_KEYS.SETTINGS);
    if (!data) {
      // تنظیمات پیش‌فرض
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

/**
 * ذخیره تنظیمات در KV
 */
async function saveSettings(env, settings) {
  await env.PROXIES.put(CONFIG.KV_KEYS.SETTINGS, JSON.stringify(settings));
}

// ============================================================
// ۴. صفحات HTML (صفحه اصلی، لاگین، داشبورد)
// ============================================================

/**
 * صفحه اصلی جعلی (Speedtest Service)
 */
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
      background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .container {
      text-align: center;
      padding: 40px;
      max-width: 600px;
    }
    .logo {
      font-size: 3rem;
      margin-bottom: 10px;
    }
    h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 8px;
      background: linear-gradient(90deg, #00d2ff, #7b2ff7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      color: rgba(255,255,255,0.6);
      margin-bottom: 50px;
      font-size: 1rem;
    }
    .gauge {
      width: 220px;
      height: 220px;
      border-radius: 50%;
      border: 4px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.05);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: 0 auto 40px;
      position: relative;
      box-shadow: 0 0 40px rgba(0,210,255,0.2);
    }
    .speed-value {
      font-size: 3rem;
      font-weight: 800;
      color: #00d2ff;
    }
    .speed-unit {
      font-size: 0.85rem;
      color: rgba(255,255,255,0.5);
      margin-top: 4px;
    }
    .status {
      font-size: 0.9rem;
      color: rgba(255,255,255,0.5);
      margin-bottom: 30px;
    }
    .btn {
      background: linear-gradient(135deg, #00d2ff, #7b2ff7);
      border: none;
      color: white;
      font-size: 1.1rem;
      font-weight: 600;
      padding: 16px 50px;
      border-radius: 50px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 20px rgba(0,210,255,0.3);
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(0,210,255,0.5);
    }
    .btn:active {
      transform: translateY(0);
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-top: 40px;
    }
    .info-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 20px 15px;
    }
    .info-label {
      font-size: 0.75rem;
      color: rgba(255,255,255,0.4);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .info-val {
      font-size: 1.3rem;
      font-weight: 700;
      color: #00d2ff;
    }
    .footer {
      margin-top: 50px;
      color: rgba(255,255,255,0.2);
      font-size: 0.8rem;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .running { animation: pulse 1.5s infinite; }
    @keyframes countUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">⚡</div>
    <h1>SpeedTest Pro</h1>
    <p class="subtitle">Professional Network Speed Analysis Tool</p>
    <div class="gauge" id="gauge">
      <div class="speed-value" id="speedVal">--</div>
      <div class="speed-unit">Mbps</div>
    </div>
    <p class="status" id="statusText">Click the button to start the test</p>
    <button class="btn" id="startBtn" onclick="startTest()">▶ Start Speed Test</button>
    <div class="info-grid">
      <div class="info-card">
        <div class="info-label">Ping</div>
        <div class="info-val" id="ping">-- ms</div>
      </div>
      <div class="info-card">
        <div class="info-label">Download</div>
        <div class="info-val" id="download">-- Mbps</div>
      </div>
      <div class="info-card">
        <div class="info-label">Upload</div>
        <div class="info-val" id="upload">-- Mbps</div>
      </div>
    </div>
    <div class="footer">
      <p>Powered by Cloudflare Edge Network · v2.4.1</p>
    </div>
  </div>
  <script>
    function startTest() {
      const btn = document.getElementById('startBtn');
      const statusText = document.getElementById('statusText');
      const speedVal = document.getElementById('speedVal');
      const ping = document.getElementById('ping');
      const download = document.getElementById('download');
      const upload = document.getElementById('upload');
      
      btn.disabled = true;
      btn.textContent = '⏳ Testing...';
      speedVal.classList.add('running');
      
      let phase = 0;
      const phases = [
        { text: 'Measuring ping...', duration: 1200, result: () => { ping.textContent = Math.floor(Math.random()*15+5) + ' ms'; }},
        { text: 'Testing download speed...', duration: 2500, result: () => { const v = (Math.random()*200+50).toFixed(1); download.textContent = v + ' Mbps'; speedVal.textContent = v; }},
        { text: 'Testing upload speed...', duration: 2000, result: () => { const v = (Math.random()*80+20).toFixed(1); upload.textContent = v + ' Mbps'; }},
        { text: 'Test complete! ✓', duration: 0, result: () => { btn.disabled = false; btn.textContent = '🔄 Run Again'; speedVal.classList.remove('running'); }},
      ];
      
      function runPhase(i) {
        if (i >= phases.length) return;
        statusText.textContent = phases[i].text;
        setTimeout(() => { phases[i].result(); runPhase(i+1); }, phases[i].duration);
      }
      runPhase(0);
    }
  </script>
</body>
</html>`;
}

/**
 * صفحه ورود به پنل مدیریت
 */
function getLoginPage(error = '') {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ورود به پنل مدیریت</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      background: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px;
      padding: 40px;
      width: 380px;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    .icon { font-size: 2.5rem; text-align: center; margin-bottom: 15px; }
    h1 {
      color: white;
      font-size: 1.4rem;
      text-align: center;
      margin-bottom: 8px;
    }
    .sub {
      color: rgba(255,255,255,0.4);
      font-size: 0.85rem;
      text-align: center;
      margin-bottom: 30px;
    }
    label {
      display: block;
      color: rgba(255,255,255,0.7);
      font-size: 0.85rem;
      margin-bottom: 8px;
    }
    input {
      width: 100%;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px;
      padding: 12px 16px;
      color: white;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s;
      text-align: right;
    }
    input:focus { border-color: #00d2ff; }
    .error {
      background: rgba(255,60,60,0.2);
      border: 1px solid rgba(255,60,60,0.4);
      color: #ff6b6b;
      padding: 10px 15px;
      border-radius: 8px;
      font-size: 0.85rem;
      margin-bottom: 20px;
      text-align: center;
    }
    .btn {
      width: 100%;
      background: linear-gradient(135deg, #00d2ff, #7b2ff7);
      border: none;
      color: white;
      font-size: 1rem;
      font-weight: 600;
      padding: 14px;
      border-radius: 10px;
      cursor: pointer;
      margin-top: 20px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔐</div>
    <h1>پنل مدیریت V2Pack</h1>
    <p class="sub">برای ادامه رمز عبور خود را وارد کنید</p>
    ${error ? `<div class="error">❌ ${error}</div>` : ''}
    <form method="POST" action="/panel">
      <label>رمز عبور</label>
      <input type="password" name="password" placeholder="رمز عبور را وارد کنید" required autofocus />
      <button type="submit" class="btn">ورود به پنل ←</button>
    </form>
  </div>
</body>
</html>`;
}

/**
 * صفحه داشبورد اصلی پنل مدیریت
 */
function getDashboardPage(proxies, domain, port, message = '') {
  const proxyRows = proxies.map(p => {
    const link = buildProxyLink(domain, port, p.secret);
    const date = new Date(p.createdAt).toLocaleDateString('fa-IR');
    return `
    <tr>
      <td><code style="background:rgba(255,255,255,0.05);padding:3px 8px;border-radius:4px;font-size:0.8rem">${p.id}</code></td>
      <td><code style="background:rgba(0,210,255,0.1);padding:3px 8px;border-radius:4px;font-size:0.75rem;color:#00d2ff">${p.secret.substring(0,12)}...</code></td>
      <td>${date}</td>
      <td>
        <span class="badge ${p.isActive ? 'badge-active' : 'badge-inactive'}">
          ${p.isActive ? '✅ فعال' : '⛔ غیرفعال'}
        </span>
      </td>
      <td class="actions">
        <button onclick="copyLink('${link}')" class="btn-sm btn-copy">📋 کپی</button>
        <button onclick="toggleProxy('${p.id}', ${p.isActive})" class="btn-sm ${p.isActive ? 'btn-warn' : 'btn-success'}">
          ${p.isActive ? '⏸ غیرفعال' : '▶ فعال'}
        </button>
        <button onclick="deleteProxy('${p.id}')" class="btn-sm btn-danger">🗑 حذف</button>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>پنل مدیریت V2Pack</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      min-height: 100vh;
    }
    .navbar {
      background: rgba(255,255,255,0.03);
      border-bottom: 1px solid rgba(255,255,255,0.08);
      padding: 15px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .nav-brand { font-size: 1.3rem; font-weight: 700; color: #00d2ff; }
    .nav-links a {
      color: rgba(255,255,255,0.6);
      text-decoration: none;
      margin-right: 20px;
      font-size: 0.9rem;
      transition: color 0.2s;
    }
    .nav-links a:hover { color: white; }
    .nav-links a.logout { color: #ff6b6b; }
    .main { max-width: 1100px; margin: 0 auto; padding: 30px 20px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 22px;
    }
    .stat-label { font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
    .stat-val { font-size: 2rem; font-weight: 800; color: #00d2ff; }
    .section {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 24px;
    }
    .section-header {
      padding: 18px 24px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .section-title { font-size: 1rem; font-weight: 600; color: white; }
    .section-body { padding: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: right;
      color: rgba(255,255,255,0.4);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 0.88rem;
      vertical-align: middle;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255,255,255,0.02); }
    .badge {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.78rem;
      font-weight: 600;
    }
    .badge-active { background: rgba(34,197,94,0.15); color: #22c55e; }
    .badge-inactive { background: rgba(239,68,68,0.15); color: #ef4444; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn-sm {
      padding: 6px 12px;
      border-radius: 7px;
      border: none;
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 600;
      transition: all 0.2s;
    }
    .btn-copy { background: rgba(0,210,255,0.15); color: #00d2ff; }
    .btn-copy:hover { background: rgba(0,210,255,0.3); }
    .btn-warn { background: rgba(251,191,36,0.15); color: #fbbf24; }
    .btn-warn:hover { background: rgba(251,191,36,0.3); }
    .btn-success { background: rgba(34,197,94,0.15); color: #22c55e; }
    .btn-success:hover { background: rgba(34,197,94,0.3); }
    .btn-danger { background: rgba(239,68,68,0.15); color: #ef4444; }
    .btn-danger:hover { background: rgba(239,68,68,0.3); }
    .btn-primary {
      background: linear-gradient(135deg, #00d2ff, #7b2ff7);
      color: white;
      border: none;
      padding: 11px 22px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
      transition: opacity 0.2s;
    }
    .btn-primary:hover { opacity: 0.9; }
    .empty-state {
      text-align: center;
      padding: 50px;
      color: rgba(255,255,255,0.3);
    }
    .empty-icon { font-size: 3rem; margin-bottom: 15px; }
    .toast {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #22c55e;
      color: white;
      padding: 12px 25px;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 600;
      z-index: 9999;
      display: none;
      box-shadow: 0 5px 20px rgba(0,0,0,0.3);
    }
    .form-row { display: flex; gap: 15px; align-items: flex-end; }
    .form-group { flex: 1; }
    .form-group label { display: block; font-size: 0.83rem; color: rgba(255,255,255,0.5); margin-bottom: 8px; }
    .form-group input {
      width: 100%;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 9px;
      padding: 11px 15px;
      color: white;
      font-size: 0.9rem;
      outline: none;
      text-align: right;
    }
    .form-group input:focus { border-color: #00d2ff; }
    .alert {
      padding: 12px 18px;
      border-radius: 10px;
      margin-bottom: 20px;
      font-size: 0.88rem;
    }
    .alert-success { background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3); color: #22c55e; }
    .alert-error { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; }
    @media(max-width:768px){
      .stats { grid-template-columns:1fr; }
      .actions { flex-direction:column; }
      .form-row { flex-direction:column; }
    }
  </style>
</head>
<body>
  <div class="toast" id="toast"></div>
  <nav class="navbar">
    <div class="nav-brand">🛡 V2Pack Panel</div>
    <div class="nav-links">
      <a href="#proxies">پروکسی‌ها</a>
      <a href="#settings">تنظیمات</a>
      <a href="/panel/logout" class="logout">خروج</a>
    </div>
  </nav>
  
  <div class="main">
    ${message ? `<div class="alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}">${message.text}</div>` : ''}
    
    <!-- آمار -->
    <div class="stats">
      <div class="stat-card">
        <div class="stat-label">کل پروکسی‌ها</div>
        <div class="stat-val">${proxies.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">پروکسی‌های فعال</div>
        <div class="stat-val" style="color:#22c55e">${proxies.filter(p=>p.isActive).length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">حداکثر مجاز</div>
        <div class="stat-val" style="color:#fbbf24">${CONFIG.MAX_PROXIES}</div>
      </div>
    </div>
    
    <!-- ساخت پروکسی جدید -->
    <div class="section" id="proxies">
      <div class="section-header">
        <span class="section-title">➕ ساخت پروکسی جدید</span>
      </div>
      <div class="section-body">
        <p style="color:rgba(255,255,255,0.4);font-size:0.85rem;margin-bottom:15px">
          با کلیک روی دکمه زیر، یک پروکسی MTProto با سکرت تصادفی ساخته می‌شود.
          ${proxies.length >= CONFIG.MAX_PROXIES ? '<span style="color:#ef4444">⚠️ به حداکثر رسیده‌اید</span>' : ''}
        </p>
        <button onclick="createProxy()" class="btn-primary" ${proxies.length >= CONFIG.MAX_PROXIES ? 'disabled' : ''}>
          ⚡ ساخت پروکسی جدید
        </button>
      </div>
    </div>
    
    <!-- لیست پروکسی‌ها -->
    <div class="section">
      <div class="section-header">
        <span class="section-title">📋 لیست پروکسی‌ها (${proxies.length})</span>
      </div>
      ${proxies.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <p>هنوز هیچ پروکسی‌ای ساخته نشده</p>
          <p style="font-size:0.8rem;margin-top:8px">از بخش بالا پروکسی جدید بسازید</p>
        </div>
      ` : `
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th>شناسه</th>
                <th>سکرت</th>
                <th>تاریخ ساخت</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              ${proxyRows}
            </tbody>
          </table>
        </div>
      `}
    </div>
    
    <!-- تنظیمات -->
    <div class="section" id="settings">
      <div class="section-header">
        <span class="section-title">⚙️ تنظیمات پنل</span>
      </div>
      <div class="section-body">
        <p style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin-bottom:20px">تغییر رمز عبور پنل مدیریت</p>
        <div class="form-row">
          <div class="form-group">
            <label>رمز عبور فعلی</label>
            <input type="password" id="currentPass" placeholder="رمز عبور فعلی" />
          </div>
          <div class="form-group">
            <label>رمز عبور جدید (حداقل ۶ کاراکتر)</label>
            <input type="password" id="newPass" placeholder="رمز عبور جدید" />
          </div>
          <button onclick="changePassword()" class="btn-primary" style="white-space:nowrap">
            🔑 تغییر رمز
          </button>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    function showToast(msg, isError = false) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.background = isError ? '#ef4444' : '#22c55e';
      t.style.display = 'block';
      setTimeout(() => t.style.display = 'none', 3000);
    }
    
    async function apiCall(url, method, body) {
      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        return await res.json();
      } catch(e) {
        return { success: false, error: 'خطای ارتباطی' };
      }
    }
    
    async function createProxy() {
      const res = await apiCall('/api/proxy/create', 'POST');
      if (res.success) { showToast('✅ پروکسی با موفقیت ساخته شد'); setTimeout(() => location.reload(), 1500); }
      else showToast('❌ ' + (res.error || 'خطا'), true);
    }
    
    async function deleteProxy(id) {
      if (!confirm('آیا از حذف این پروکسی اطمینان دارید؟')) return;
      const res = await apiCall('/api/proxy/delete', 'POST', { id });
      if (res.success) { showToast('🗑 پروکسی حذف شد'); setTimeout(() => location.reload(), 1500); }
      else showToast('❌ ' + (res.error || 'خطا'), true);
    }
    
    async function toggleProxy(id, isActive) {
      const res = await apiCall('/api/proxy/toggle', 'POST', { id, isActive: !isActive });
      if (res.success) { showToast(isActive ? '⏸ پروکسی غیرفعال شد' : '▶ پروکسی فعال شد'); setTimeout(() => location.reload(), 1500); }
      else showToast('❌ ' + (res.error || 'خطا'), true);
    }
    
    async function changePassword() {
      const currentPass = document.getElementById('currentPass').value;
      const newPass = document.getElementById('newPass').value;
      if (!currentPass || !newPass) { showToast('❌ لطفاً همه فیلدها را پر کنید', true); return; }
      if (newPass.length < 6) { showToast('❌ رمز عبور باید حداقل ۶ کاراکتر باشد', true); return; }
      const res = await apiCall('/api/settings/password', 'POST', { currentPass, newPass });
      if (res.success) showToast('✅ رمز عبور با موفقیت تغییر کرد');
      else showToast('❌ ' + (res.error || 'خطا'), true);
    }
    
    function copyLink(link) {
      navigator.clipboard.writeText(link).then(() => showToast('📋 لینک کپی شد')).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta); showToast('📋 لینک کپی شد');
      });
    }
  </script>
</body>
</html>`;
}

// ============================================================
// ۵. هندلرهای API (ساخت، حذف، تغییر وضعیت، تغییر رمز)
// ============================================================

/**
 * API: ساخت پروکسی جدید
 */
async function handleCreateProxy(request, env) {
  const proxies = await getProxies(env);
  
  if (proxies.length >= CONFIG.MAX_PROXIES) {
    return jsonResponse({ success: false, error: 'به حداکثر تعداد پروکسی رسیده‌اید (۱۰۰)' }, 400);
  }
  
  const newProxy = {
    id: generateId(),
    secret: generateSecret(),
    createdAt: new Date().toISOString(),
    isActive: true,
  };
  
  proxies.push(newProxy);
  await saveProxies(env, proxies);
  
  return jsonResponse({ success: true, proxy: newProxy });
}

/**
 * API: حذف پروکسی
 */
async function handleDeleteProxy(request, env) {
  const body = await request.json();
  const { id } = body;
  
  if (!id) return jsonResponse({ success: false, error: 'شناسه پروکسی الزامی است' }, 400);
  
  let proxies = await getProxies(env);
  const before = proxies.length;
  proxies = proxies.filter(p => p.id !== id);
  
  if (proxies.length === before) {
    return jsonResponse({ success: false, error: 'پروکسی یافت نشد' }, 404);
  }
  
  await saveProxies(env, proxies);
  return jsonResponse({ success: true });
}

/**
 * API: تغییر وضعیت پروکسی
 */
async function handleToggleProxy(request, env) {
  const body = await request.json();
  const { id, isActive } = body;
  
  if (!id) return jsonResponse({ success: false, error: 'شناسه پروکسی الزامی است' }, 400);
  
  const proxies = await getProxies(env);
  const proxy = proxies.find(p => p.id === id);
  
  if (!proxy) return jsonResponse({ success: false, error: 'پروکسی یافت نشد' }, 404);
  
  proxy.isActive = isActive;
  await saveProxies(env, proxies);
  
  return jsonResponse({ success: true });
}

/**
 * API: تغییر رمز عبور
 */
async function handleChangePassword(request, env) {
  const body = await request.json();
  const { currentPass, newPass } = body;
  
  if (!currentPass || !newPass) {
    return jsonResponse({ success: false, error: 'همه فیلدها الزامی هستند' }, 400);
  }
  
  if (newPass.length < 6) {
    return jsonResponse({ success: false, error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' }, 400);
  }
  
  const settings = await getSettings(env);
  const currentHash = await hashPassword(currentPass);
  
  if (!safeCompare(currentHash, settings.adminPassword)) {
    return jsonResponse({ success: false, error: 'رمز عبور فعلی اشتباه است' }, 401);
  }
  
  settings.adminPassword = await hashPassword(newPass);
  await saveSettings(env, settings);
  
  return jsonResponse({ success: true });
}

// ============================================================
// ۶. توابع احراز هویت (بررسی کوکی، ساخت کوکی)
// ============================================================

/**
 * ساخت توکن احراز هویت
 */
async function generateAuthToken(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + ':v2pack-auth-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * بررسی احراز هویت کاربر از کوکی
 */
async function isAuthenticated(request, env) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => c.trim().split('=').map(s => s.trim()))
  );
  
  const token = cookies['v2pack_auth'];
  if (!token) return false;
  
  const settings = await getSettings(env);
  const expectedToken = await generateAuthToken(settings.adminPassword);
  
  return safeCompare(token, expectedToken);
}

/**
 * ساخت Response با کوکی احراز هویت
 */
async function setAuthCookie(response, passwordHash) {
  const token = await generateAuthToken(passwordHash);
  const cookieValue = `v2pack_auth=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${CONFIG.COOKIE_MAX_AGE}; Path=/`;
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', cookieValue);
  return new Response(response.body, { ...response, headers });
}

// ============================================================
// ۷. توابع کمکی Response
// ============================================================

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function redirectResponse(url) {
  return new Response(null, {
    status: 302,
    headers: { 'Location': url },
  });
}

// ============================================================
// ۸. هندلر اصلی Worker (مسیریابی درخواست‌ها)
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    // --- صفحه اصلی ---
    if (path === '/' || path === '') {
      return htmlResponse(getHomePage());
    }
    
    // --- خروج از پنل ---
    if (path === '/panel/logout') {
      const res = redirectResponse('/panel');
      const headers = new Headers(res.headers);
      headers.set('Set-Cookie', 'v2pack_auth=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/');
      return new Response(res.body, { ...res, headers });
    }
    
    // --- API Routes (احراز هویت لازم) ---
    if (path.startsWith('/api/')) {
      const authenticated = await isAuthenticated(request, env);
      if (!authenticated) {
        return jsonResponse({ success: false, error: 'احراز هویت لازم است' }, 401);
      }
      
      if (path === '/api/proxy/create' && method === 'POST') {
        return handleCreateProxy(request, env);
      }
      if (path === '/api/proxy/delete' && method === 'POST') {
        return handleDeleteProxy(request, env);
      }
      if (path === '/api/proxy/toggle' && method === 'POST') {
        return handleToggleProxy(request, env);
      }
      if (path === '/api/settings/password' && method === 'POST') {
        return handleChangePassword(request, env);
      }
      
      return jsonResponse({ success: false, error: 'مسیر یافت نشد' }, 404);
    }
    
    // --- پنل مدیریت ---
    if (path === '/panel') {
      // POST: پردازش فرم لاگین
      if (method === 'POST') {
        const formData = await request.formData();
        const password = formData.get('password');
        
        if (!password || password.length < 1) {
          return htmlResponse(getLoginPage('رمز عبور الزامی است'));
        }
        
        const settings = await getSettings(env);
        const passwordHash = await hashPassword(password);
        
        if (!safeCompare(passwordHash, settings.adminPassword)) {
          return htmlResponse(getLoginPage('رمز عبور اشتباه است'));
        }
        
        // ورود موفق: ساخت کوکی و ریدایرکت به داشبورد
        const redirectRes = redirectResponse('/panel/dashboard');
        return setAuthCookie(redirectRes, settings.adminPassword);
      }
      
      // GET: نمایش صفحه لاگین (یا ریدایرکت اگر لاگین هستیم)
      const authenticated = await isAuthenticated(request, env);
      if (authenticated) return redirectResponse('/panel/dashboard');
      return htmlResponse(getLoginPage());
    }
    
    // --- داشبورد پنل ---
    if (path === '/panel/dashboard') {
      const authenticated = await isAuthenticated(request, env);
      if (!authenticated) return redirectResponse('/panel');
      
      const proxies = await getProxies(env);
      const settings = await getSettings(env);
      const domain = getDomain(request);
      const port = settings.defaultPort || CONFIG.DEFAULT_PORT;
      
      return htmlResponse(getDashboardPage(proxies, domain, port));
    }
    
    // --- ۴۰۴ ---
    return htmlResponse('<h1>404 - صفحه یافت نشد</h1>', 404);
  },
};