# 🛡 V2Pack — پروکسی‌ساز اختصاصی تلگرام روی Cloudflare Workers

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange?logo=cloudflare)](https://workers.cloudflare.com)
[![MTProto](https://img.shields.io/badge/Protocol-MTProto-blue?logo=telegram)](https://core.telegram.org/mtproto)
[![KV Storage](https://img.shields.io/badge/Storage-KV-green)](https://developers.cloudflare.com/kv)
[![Version](https://img.shields.io/badge/Version-2.0.0-purple)](https://github.com/ArsalanAfshar/V2pack)

---

## 📌 معرفی پروژه

**V2Pack** یک ابزار حرفه‌ای برای ساخت و مدیریت پروکسی‌های اختصاصی تلگرام (MTProto) روی Cloudflare Workers است.

### ✨ ویژگی‌های اصلی

- ⚡ **ساخت خودکار پروکسی** با یک کلیک
- 📋 **مدیریت کامل** (مشاهده، کپی، حذف، فعال/غیرفعال)
- 🔐 **پنل مدیریت امن** با احراز هویت رمز عبور + کوکی HttpOnly
- 🎭 **صفحه جعلی** Speedtest برای مخفی‌سازی
- 💾 **ذخیره‌سازی دائمی** با Cloudflare KV
- 🔒 **امنیت بالا** (SHA-256، timing-safe compare، HttpOnly cookie، session token در KV)
- 🧩 **سکرت FakeTLS** با فرمت `ee + random + domain_hex` برای دور زدن فیلترینگ

---

## 🔧 اصلاحات نسخه 2.0.0

| مشکل | علت | راه‌حل |
|------|-----|---------|
| دکمه‌ها (ساخت، کپی، حذف، غیرفعال) کار نمی‌کردند | احراز هویت API با کوکی اشتباه بود | ذخیره session token در KV + `credentials: 'same-origin'` |
| پروکسی ساخته نمی‌شد | مسیر API روتر ناقص بود | روتر کامل با `regex` برای مسیرهای پویا |
| کوکی ارسال نمی‌شد | `fetch` در داشبورد بدون `credentials` بود | اضافه کردن `credentials: 'same-origin'` به همه API call‌ها |
| سکرت پروکسی ناقص بود | فرمت FakeTLS رعایت نشده بود | فرمت صحیح: `ee + 32hex + domain_hex` |

---

## 🚀 راه‌اندازی گام‌به‌گام

### پیش‌نیازها
- اکانت Cloudflare (پلن رایگان کافی است)
- آشنایی پایه با داشبورد Cloudflare

---

### مرحله ۱: ساخت KV Namespace

1. وارد [داشبورد Cloudflare](https://dash.cloudflare.com) شوید
2. از منوی سمت چپ به **Workers & Pages** بروید
3. روی **KV** کلیک کنید
4. دکمه **Create a namespace** را بزنید
5. نام `PROXIES` را وارد کنید و **Add** را بزنید

---

### مرحله ۲: ساخت Worker جدید

1. در بخش **Workers & Pages**، روی **Create application** کلیک کنید
2. گزینه **Create Worker** را انتخاب کنید
3. یک نام دلخواه (مثلاً `v2pack`) وارد کنید
4. روی **Deploy** کلیک کنید

---

### مرحله ۳: آپلود کد

1. در صفحه Worker، روی **Edit code** کلیک کنید
2. تمام کد داخل ویرایشگر را پاک کنید
3. محتوای فایل `Worker.js` را کپی و جایگذاری کنید
4. روی **Save and Deploy** کلیک کنید

---

### مرحله ۴: تنظیم متغیر محیطی

1. در صفحه Worker، به تب **Settings** بروید
2. بخش **Variables and Secrets** را پیدا کنید
3. روی **Add variable** کلیک کنید:
   - **Variable name:** `ADMIN_PASSWORD`
   - **Value:** رمز عبور دلخواه (حداقل ۶ کاراکتر)
4. روی **Save** کلیک کنید

> ⚠️ **مهم:** اگر این متغیر تنظیم نشود، رمز پیش‌فرض `admin123` خواهد بود. حتماً آن را تغییر دهید!

---

### مرحله ۵: اتصال KV به Worker

1. هنوز در تب **Settings** بمانید
2. بخش **KV Namespace Bindings** را پیدا کنید
3. روی **Add binding** کلیک کنید:
   - **Variable name:** `PROXIES`  ← **دقیقاً همین نام (حروف بزرگ)**
   - **KV namespace:** فضای نامی که در مرحله ۱ ساختید
4. روی **Save** کلیک کنید

---

### مرحله ۶: Deploy نهایی

1. به تب **Deployments** بروید
2. روی **Deploy** کلیک کنید
3. چند ثانیه صبر کنید تا Worker فعال شود

---

## 🌐 مسیرها و استفاده

| مسیر | توضیح |
|------|-------|
| `https://your-worker.workers.dev/` | صفحه اصلی (Speedtest جعلی) |
| `https://your-worker.workers.dev/panel` | ریدایرکت به لاگین |
| `https://your-worker.workers.dev/panel/login` | صفحه ورود به پنل |
| `https://your-worker.workers.dev/panel/dashboard` | داشبورد مدیریت |
| `https://your-worker.workers.dev/panel/logout` | خروج از پنل |
| `https://your-worker.workers.dev/api/proxies` | API لیست و ساخت پروکسی |
| `https://your-worker.workers.dev/api/proxies/:id` | API حذف پروکسی |
| `https://your-worker.workers.dev/api/proxies/:id/toggle` | API تغییر وضعیت |
| `https://your-worker.workers.dev/api/settings/password` | API تغییر رمز |

---

## 📱 نحوه استفاده از پنل

### ورود به پنل
1. به آدرس `/panel` بروید
2. رمز عبوری که در متغیر محیطی تنظیم کردید را وارد کنید
3. روی **ورود به پنل** کلیک کنید

### ساخت پروکسی جدید
1. در داشبورد، روی دکمه **⚡ ساخت پروکسی جدید** کلیک کنید
2. پروکسی به صورت خودکار با یک سکرت FakeTLS تصادفی ساخته می‌شود
3. پروکسی جدید در لیست نمایش داده می‌شود

### استفاده از پروکسی در تلگرام
1. در لیست پروکسی‌ها، روی دکمه **📋 کپی** کلیک کنید
2. لینک `tg://proxy?...` در کلیپ‌بورد کپی می‌شود
3. این لینک را در تلگرام باز کنید تا پروکسی اضافه شود

### فرمت لینک پروکسی
```
tg://proxy?server=YOUR_DOMAIN&port=443&secret=ee[32hex_random][domain_hex]
```

### مدیریت پروکسی‌ها
- **📋 کپی:** کپی کردن لینک MTProto
- **⏸ غیرفعال / ▶ فعال:** تغییر وضعیت پروکسی
- **🗑 حذف:** حذف کامل پروکسی

### تغییر رمز عبور
1. در پایین داشبورد، بخش **⚙️ تنظیمات پنل** را پیدا کنید
2. رمز عبور فعلی و رمز جدید را وارد کنید
3. روی **🔑 تغییر رمز** کلیک کنید

---

## 🏗 ساختار KV Storage

### کلید `proxies`
```json
[
  {
    "id": "abc123def456",
    "secret": "eea1b2c3...domain_hex",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "isActive": true
  }
]
```

### کلید `settings`
```json
{
  "adminPassword": "[SHA-256 hash of password]",
  "defaultPort": 443
}
```

### کلید `session:{token}`
```
valid
```
> **توضیح:** این کلیدها برای ذخیره session‌های فعال استفاده می‌شوند و TTL دارند (24 ساعت).

---

## 🔒 جزئیات امنیتی

| ویژگی | جزئیات |
|-------|---------|
| **هش رمز عبور** | SHA-256 از طریق Web Crypto API |
| **کوکی احراز هویت** | HttpOnly + Secure + SameSite=Strict |
| **Session Token** | ذخیره در KV با TTL 24 ساعت |
| **مقایسه امن** | Timing-safe string comparison |
| **محدودیت پروکسی** | حداکثر ۱۰۰ پروکسی |
| **سکرت FakeTLS** | ee + random(16 bytes) + hex(domain) |
| **مخفی‌سازی** | صفحه اصلی جعلی Speedtest |

---

## 🔧 متغیرهای محیطی

| نام | اجباری | پیش‌فرض | توضیح |
|-----|--------|---------|-------|
| `ADMIN_PASSWORD` | ✅ | `admin123` | رمز عبور پنل مدیریت |

---

## 🛠 عیب‌یابی

### خطا: `env.PROXIES is not defined`
**راه‌حل:** KV Namespace را با نام binding دقیقاً `PROXIES` (حروف بزرگ) به Worker متصل کنید.

### خطا: `500 Internal Server Error`
**راه‌حل:** در Cloudflare Dashboard، به **Workers > Logs** بروید و خطای دقیق را ببینید.

### دکمه‌های پنل کار نمی‌کنند
**راه‌حل:** مطمئن شوید:
1. از آدرس `workers.dev` (HTTPS) استفاده می‌کنید
2. KV Namespace به درستی متصل است
3. کوکی `session_token` در مرورگر ذخیره شده

### پنل باز نمی‌شود
**راه‌حل:** آدرس دقیقاً `/panel` باشد (حساس به حروف کوچک/بزرگ).

### پروکسی در تلگرام کار نمی‌کند
**راه‌حل:**
- مطمئن شوید پروکسی در وضعیت **فعال** باشد
- دامنه Worker باید بدون پورت در لینک تلگرام باشد (مثلاً `my-worker.workers.dev`)
- از نسخه به‌روز تلگرام استفاده کنید

---

## ❓ سوالات متداول

### آیا این سرویس رایگان است؟
بله! Cloudflare Workers در پلن رایگان تا **۱۰۰,۰۰۰ درخواست در روز** رایگان است. KV Storage هم تا **۱۰۰,۰۰۰ عملیات خواندن** در روز رایگان است.

### رمز عبور پیش‌فرض چیست؟
اگر متغیر `ADMIN_PASSWORD` تنظیم نشده باشد، رمز پیش‌فرض `admin123` است. **حتماً آن را تغییر دهید!**

### آیا می‌توانم دامنه اختصاصی استفاده کنم؟
بله! از تب **Triggers** در داشبورد Worker می‌توانید یک Custom Domain اضافه کنید.

### چند پروکسی می‌توانم بسازم؟
حداکثر **۱۰۰ پروکسی** در هر Worker مجاز است.

### چطور session‌های قدیمی را پاک کنم؟
به صورت خودکار بعد از **۲۴ ساعت** منقضی می‌شوند. همچنین با کلیک روی **خروج**، session فوری پاک می‌شود.

---

## 📜 مجوز

این پروژه تحت مجوز **MIT** منتشر شده است. استفاده، تغییر و توزیع آن آزاد است.

---

ساخته شده با ❤️ برای جامعه فارسی‌زبان

**V2Pack v2.0.0**
