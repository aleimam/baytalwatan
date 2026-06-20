# أراضي المرحلة الحادية عشر — NUCA Lands Web App

تطبيق ويب لاستعراض قطع الأراضي المتاحة (المرحلة الحادية عشر) مع بحث وتصفية وترتيب كامل،
وخريطة لكل منطقة تُفتح بالضغط على رقم القطعة، ولوحة تحليلات تفاعلية.

A PHP + SQLite web app to browse all available 11th‑stage land plots — full filter/sort/search,
a clickable map per plot, and an integrated analytics dashboard. **4,543 plots · 22 cities · 48 zones · 48 maps.**

---

## ما الذي يفعله / Features
- **القائمة:** كل القطع في جدول، تصفية حسب (المدينة، سعر المتر، المساحة، السعر الإجمالي، الدفعة المقدمة، التميّز، بحث نصي)، وترتيب حسب أي عمود تصاعدي/تنازلي — ويعمل الترتيب على البيانات المُصفّاة. ترقيم صفحات + تصدير CSV للنتائج الظاهرة.
- **الخرائط:** اضغط رقم أي قطعة → تفتح خريطة المنطقة (تكبير بعجلة الفأرة + سحب للتنقل) مع تفاصيل القطعة.
- **التحليلات:** ٨ رسوم (حسب المدينة، شرائح السعر، خريطة القيمة، التميّز، التشتت، التوزيعات، نطاق سعر المتر) محسوبة على التصفية الحالية.

## التقنية / Stack
- **Backend:** PHP (PDO) + **SQLite** (افتراضي، بدون أي إعداد) — أو MySQL/MariaDB اختيارياً.
- **Frontend:** HTML/CSS/JS + ECharts (كلها محليّة، بدون إنترنت).
- يعمل أيضاً **بدون PHP** كموقع ثابت (fallback) عبر `assets/data.js`.

## بنية المجلد / Structure
```
landsapp/
├─ index.html          الواجهة (قائمة + خرائط + تحليلات)
├─ api.php             واجهة JSON (تصفية/ترتيب/ترقيم) — تقرأ من قاعدة البيانات
├─ config.php          إعداد قاعدة البيانات (SQLite افتراضي / MySQL اختياري)
├─ .htaccess           إعداد Apache (charset/cache/أمان)
├─ db/
│  ├─ lands.db         قاعدة بيانات SQLite (٤٬٥٤٣ سجل)
│  ├─ import_mysql.sql سكربت إنشاء+إدخال لـ MySQL/MariaDB
│  └─ .htaccess        يمنع تنزيل قاعدة البيانات مباشرة
├─ assets/             app.js · analytics.js · styles.css · echarts.min.js · data.js
└─ maps/               zone_<id>.jpg ×48  (خرائط المناطق 4455×3150)
```

---

## النشر على سيرفر CWP + Apache  (الطريقة الأسهل — SQLite)

1. ارفع محتويات مجلد `landsapp/` إلى مجلد الموقع، مثل:
   `/home/USERNAME/public_html/`  (أو مجلد فرعي مثل `public_html/lands`).
   عبر File Manager في CWP أو SFTP/SCP.

2. تأكد أن PHP فيه إضافة **pdo_sqlite** (عادةً مفعّلة). للتحقق عبر SSH:
   ```bash
   php -m | grep -i pdo_sqlite
   ```
   إن لم تظهر: فعّلها من CWP → PHP Settings/Selector → فعّل `pdo_sqlite` (أو `php-pdo`).

3. الصلاحيات (قراءة كافية، لا حاجة لكتابة):
   ```bash
   cd /home/USERNAME/public_html        # أو مجلد التطبيق
   find . -type d -exec chmod 755 {} \;
   find . -type f -exec chmod 644 {} \;
   ```

4. افتح الموقع: `http://YOUR_DOMAIN/`  (أو `/lands/`). انتهى ✅

> SQLite للقراءة فقط هنا (كتالوج عرض) — لا يحتاج صلاحيات كتابة ولا إعداد قاعدة بيانات.

## (اختياري) استخدام MySQL / MariaDB على CWP
1. CWP → SQL Services → MySQL Manager: أنشئ قاعدة `lands_db` ومستخدم وامنحه الصلاحيات.
2. استورد البيانات:
   ```bash
   mysql -u DBUSER -p lands_db < db/import_mysql.sql
   ```
3. عدّل `config.php`: اجعل `'driver' => 'mysql'` واملأ `mysql` (host/name/user/pass).

---

## معلومات السيرفر التي تساعدني على الضبط (شغّلها عبر SSH وأرسل لي الناتج)
أوامر **للقراءة فقط** — آمنة:
```bash
php -v                                   # إصدار PHP
php -m | grep -Ei 'pdo|sqlite|mysql|mbstring'   # الإضافات المتاحة
httpd -v 2>/dev/null || apachectl -v     # إصدار Apache
echo "DocRoot: $(pwd)"; ls -la           # المجلد الحالي ومحتواه
df -h .                                  # المساحة المتاحة (الخرائط ~70MB)
```
> لن أطلب كلمة مرور SSH أو أدخل بياناتك بنفسي — شغّل الأوامر أنت وألصق الناتج، وأضبط النشر بناءً عليه.

## تحديث البيانات لاحقاً / Refreshing data
عند سحب بيانات جديدة من البوابة، أعد توليد قاعدة البيانات والملفات ثم ارفع:
`db/lands.db` + `assets/data.js` + (أي خرائط جديدة في `maps/`). (سكربتات التوليد محفوظة في مجلد العمل.)

## ملاحظات
- **القيم المالية** كما هي منشورة على بوابة هيئة المجتمعات العمرانية.
- **لقطة زمنية:** ٢٠٢٦/٠٦/٢٠ — القطع المتاحة تتغيّر مع إتمام الحجوزات.
- التشغيل محلياً للتجربة: `php -S 127.0.0.1:8080 -t landsapp` ثم افتح `http://127.0.0.1:8080`.
