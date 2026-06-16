# 🛡 V2Pack - پروکسی‌ساز اختصاصی تلگرام روی Cloudflare Workers

<div align="center">
  <img src="https://img.shields.io/badge/Cloudflare-Workers-orange?logo=cloudflare" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/Protocol-MTProto-blue?logo=telegram" alt="MTProto" />
  <img src="https://img.shields.io/badge/Storage-KV-green" alt="KV Storage" />
  <img src="https://img.shields.io/badge/Version-1.0.0-purple" alt="Version" />
</div>

---

## 📌 معرفی پروژه

**V2Pack** یک ابزار حرفه‌ای برای ساخت و مدیریت پروکسی‌های اختصاصی تلگرام (MTProto) روی Cloudflare Workers است. این پروژه دارای یک پنل مدیریت امن و یک صفحه اصلی مخفی‌سازی شده است که از دید بازدیدکنندگان معمولی محافظت می‌کند.

### ✨ ویژگی‌های اصلی

- ⚡ **ساخت خودکار پروکسی** با یک کلیک
- 📋 **مدیریت کامل** (مشاهده، کپی، حذف، فعال/غیرفعال)
- 🔐 **پنل مدیریت امن** با احراز هویت رمز عبور + کوکی HttpOnly
- 🎭 **صفحه جعلی** Speedtest برای مخفی‌سازی
- 💾 **ذخیره‌سازی دائمی** با Cloudflare KV
- 🔒 **امنیت بالا** (SHA-256، timing-safe compare، HttpOnly cookie)

---

## 🚀 راه‌اندازی گام‌به‌گام

### پیش‌نیازها
- اکانت Cloudflare (رایگان کافی است)
- آشنایی پایه با داشبورد Cloudflare

---

### مرحله ۱: ساخت KV Namespace

1. وارد [داشبورد Cloudflare](https://dash.cloudflare.com) شوید
2. از منوی سمت چپ به **Workers & Pages** بروید
3. روی **KV** کلیک کنید
4. دکمه **Create a namespace** را بزنید
5. نام `PROXIES` را وارد کنید و **Add** را بزنید
6. **Namespace ID** را یادداشت کنید (بعداً لازم است)

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
3. محتوای فایل `worker.js` را کپی و جایگذاری کنید
4. روی **Save and Deploy** کلیک کنید

---

### مرحله ۴: تنظیم متغیر محیطی

1. در صفحه Worker، به تب **Settings** بروید
2. بخش **Variables and Secrets** را پیدا کنید
3. روی **Add variable** کلیک کنید:
   - **Variable name:** `ADMIN_PASSWORD`
   - **Value:** رمز عبور دلخواه شما (حداقل ۶ کاراکتر)
4. روی **Save** کلیک کنید

> ⚠️ **مهم:** اگر این متغیر تنظیم نشود، رمز پیش‌فرض `admin123` خواهد بود. حتماً آن را تغییر دهید!

---

### مرحله ۵: اتصال KV به Worker

1. هنوز در تب **Settings** بمانید
2. بخش **KV Namespace Bindings** را پیدا کنید
3. روی **Add binding** کلیک کنید:
   - **Variable name:** `PROXIES`
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
| `https://your-worker.workers.dev/panel` | صفحه ورود به پنل |
| `https://your-worker.workers.dev/panel/dashboard` | داشبورد مدیریت |
| `https://your-worker.workers.dev/panel/logout` | خروج از پنل |
| `https://your-worker.workers.dev/api/*` | API داخلی (نیاز به احراز هویت) |

---

## 📱 نحوه استفاده از پنل

### ورود به پنل
1. به آدرس `/panel` بروید
2. رمز عبوری که در متغیر محیطی تنظیم کردید را وارد کنید
3. روی **ورود به پنل** کلیک کنید

### ساخت پروکسی جدید
1. در داشبورد، روی دکمه **⚡ ساخت پروکسی جدید** کلیک کنید
2. پروکسی به صورت خودکار با یک سکرت تصادفی ساخته می‌شود
3. پروکسی جدید در لیست نمایش داده می‌شود

### استفاده از پروکسی
1. در لیست پروکسی‌ها، روی دکمه **📋 کپی** کلیک کنید
2. لینک `tg://proxy?...` در کلیپ‌بورد کپی می‌شود
3. این لینک را در تلگرام باز کنید تا پروکسی اضافه شود

### فرمت لینک پروکسی
```
tg://proxy?server=YOUR_DOMAIN&port=443&secret=ee[30 hex chars]
```

### مدیریت پروکسی‌ها
- **📋 کپی:** کپی کردن لینک MTProto
- **⏸ غیرفعال / ▶ فعال:** تغییر وضعیت پروکسی
- **🗑 حذف:** حذف کامل پروکسی

### تغییر رمز عبور
1. به بخش **⚙️ تنظیمات پنل** بروید
2. رمز عبور فعلی و رمز جدید را وارد کنید
3. روی **🔑 تغییر رمز** کلیک کنید

---

## 🏗 ساختار KV Storage

### کلید `proxies`
```json
[
  {
    "id": "abc123def456",
    "secret": "eea1b2c3d4e5f6a7b8c9d0e1f2a3b4c5",
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

---

## 🔒 جزئیات امنیتی

| ویژگی | جزئیات |
|-------|---------|
| **هش رمز عبور** | SHA-256 از طریق Web Crypto API |
| **کوکی احراز هویت** | HttpOnly + Secure + SameSite=Strict |
| **مقایسه امن** | Timing-safe string comparison |
| **محدودیت پروکسی** | حداکثر ۱۰۰ پروکسی |
| **اعتبارسنجی ورودی** | بررسی تمام ورودی‌های API |
| **مخفی‌سازی** | صفحه اصلی جعلی Speedtest |

---

## 🔧 متغیرهای محیطی

| نام | اجباری | پیش‌فرض | توضیح |
|-----|--------|---------|-------|
| `ADMIN_PASSWORD` | ✅ | `admin123` | رمز عبور پنل مدیریت |

---

## ❓ سوالات متداول (FAQ)

### آیا این سرویس رایگان است؟
بله! Cloudflare Workers در پلن رایگان تا **۱۰۰,۰۰۰ درخواست در روز** رایگان است. KV Storage هم تا **۱۰۰,۰۰۰ عملیات خواندن** در روز رایگان است.

### چرا پروکسی‌هایم کار نمی‌کنند؟
- مطمئن شوید KV Namespace به درستی به Worker متصل شده
- بررسی کنید که نام Binding دقیقاً `PROXIES` باشد (حروف بزرگ)
- پروکسی را فعال کنید (isActive = true)

### رمز عبور پیش‌فرض چیست؟
اگر متغیر `ADMIN_PASSWORD` تنظیم نشده باشد، رمز پیش‌فرض `admin123` است. **حتماً آن را تغییر دهید!**

### آیا می‌توانم دامنه اختصاصی استفاده کنم؟
بله! از تب **Triggers** در داشبورد Worker می‌توانید یک Custom Domain اضافه کنید.

### چطور پروکسی‌های قدیمی را حذف کنم؟
از داشبورد پنل، دکمه 🗑 **حذف** را کنار هر پروکسی بزنید. یا از KV Dashboard در Cloudflare، مستقیماً کلید `proxies` را ویرایش کنید.

### چند پروکسی می‌توانم بسازم؟
حداکثر **۱۰۰ پروکسی** در هر Worker مجاز است.

---

## 🛠 عیب‌یابی

### خطا: `env.PROXIES is not defined`
**راه‌حل:** KV Namespace را با نام binding دقیقاً `PROXIES` به Worker متصل کنید.

### خطا: `500 Internal Server Error`
**راه‌حل:** در Cloudflare Dashboard، به Workers > Logs بروید و خطای دقیق را ببینید.

### پنل باز نمی‌شود
**راه‌حل:** مطمئن شوید آدرس دقیقاً `/panel` است (نه `/Panel` یا `/PANEL`).

### کوکی ذخیره نمی‌شود
**راه‌حل:** باید از HTTPS استفاده کنید. Workers.dev به صورت پیش‌فرض HTTPS است.

---

## 📜 مجوز

این پروژه تحت مجوز **MIT** منتشر شده است. استفاده، تغییر و توزیع آن آزاد است.

---

<div align="center">
  <p>ساخته شده با ❤️ برای جامعه فارسی‌زبان</p>
  <p><strong>V2Pack v1.0.0</strong></p>
</div>