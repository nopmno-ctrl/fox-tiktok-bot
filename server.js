/**
 * ==============================================================================
 * 🦅 FOX OSINT - STANDALONE CLOUD SERVER & BOT v1.0
 * ==============================================================================
 * خادم سحابي مدمج + بوت تلجرام رسمي لمنظومة FOX Cyber Command
 * مصمم للعمل 24/7 على منصات السحابة المجانية (Render / Koyeb / Railway / Docker)
 * ==============================================================================
 */

const http = require('http');
const url = require('url');
const { Bot } = require('node-telegram-bot-api');
const engine = require('./engine');
const proxyManager = require('./proxy_manager');

// تهيئة حوض البروكسيات التلقائي
proxyManager.init().catch(() => {});

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8965997992:AAEPhCgLq1q0x5msiF-5zutQgCkkW0GlJnI';

// ─────────────────────────── خادم الويب و API ───────────────────────────

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // إضافة ترويسات CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // فحص سلامة الخادم السحابي (Health Check)
  if (pathname === '/health' || pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    return;
  }

  // واجهة برمجة التطبيقات (API) لفحص أي حساب
  // مثال: GET /api/inspect?username=ahmad.almane74
  if (pathname === '/api/inspect') {
    const username = (parsedUrl.query.username || parsedUrl.query.user || '').trim();
    if (!username) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'يرجى إرسال معيار username' }));
      return;
    }

    try {
      const data = await engine.inspectAccount(username);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, data }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // الصفحة الرئيسية
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    name: 'FOX OSINT Cloud Inspection Engine',
    version: '1.0.0',
    bot: '@almasry_otp_2026_bot',
    status: 'running',
    endpoints: {
      health: '/health',
      inspect: '/api/inspect?username={username}'
    }
  }));
});

server.listen(PORT, () => {
  console.log(`🌐 [FOX CLOUD SERVER] يعمل على المنفذ: ${PORT}`);
});

// ─────────────────────────── بوت التلجرام ───────────────────────────

if (TELEGRAM_TOKEN && TELEGRAM_TOKEN !== 'YOUR_TOKEN_HERE') {
  const bot = new Bot(TELEGRAM_TOKEN);
  const lastReqAt = new Map();
  const COOLDOWN_MS = 3500;

  bot.catch((err) => {
    console.warn('⚠️ [TELEGRAM_BOT] تنبيه:', err.message || err);
  });

  const WELCOME_MSG =
    '🦅 <b>أهلاً بك في بوت FOX OSINT الاستخباراتي</b> ⚡\n' +
    'منظومة فحص حسابات تيك توك الجنائية بالبيانات الحقيقية 100%.\n\n' +
    '🔍 <b>طريقة الاستخدام:</b>\n' +
    'أرسل اسم مستخدم تيك توك مباشرة، مثل:\n' +
    '<code>_jackson_story_6</code>\n' +
    'أو <code>/check ahmad.almane74</code>\n' +
    'أو رابط الحساب أو رابط المشاركة المختصر (vm/vt).\n\n' +
    '🛡️ <i>بيانات حقيقية مستخرجة مباشرة من خوادم TikTok بدون أي تزييف.</i>';

  bot.on('message', async (ctx) => {
    const chatId = ctx.chatId;
    let text = (ctx.message?.text || '').trim();
    if (!chatId || !text) return;

    if (/^\/(start|help)(@\w+)?/i.test(text)) {
      await ctx.reply(WELCOME_MSG, { parse_mode: 'HTML', disable_web_page_preview: true });
      return;
    }

    if (text.startsWith('/check')) {
      text = text.replace(/^\/check(?:@\w+)?\s*/i, '').trim();
    }

    if (!text) {
      await ctx.reply('⚠️ يرجى إرسال اسم المستخدم المطلوب فحصه بعد الأمر، مثل: <code>/check ahmad.almane74</code>', { parse_mode: 'HTML' });
      return;
    }

    const now = Date.now();
    const last = lastReqAt.get(chatId) || 0;
    if (now - last < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      await ctx.reply(`⏳ يرجى الانتظار ${wait} ثوانٍ قبل الفحص التالي.`);
      return;
    }
    lastReqAt.set(chatId, now);

    let waitMsg = null;
    try {
      waitMsg = await ctx.reply(`⏳ <b>جاري الاتصال بخوادم TikTok وفحص الحساب:</b> <code>${engine.normalizeUsername(text) || text}</code>...`, { parse_mode: 'HTML' });
      
      const data = await engine.inspectAccount(text);

      if (waitMsg && waitMsg.message_id) {
        await ctx.api.deleteMessage({ chat_id: chatId, message_id: waitMsg.message_id }).catch(() => {});
      }

      const report = engine.formatTelegramReport(data);

      if (data.avatar && data.avatar.startsWith('http')) {
        try {
          await ctx.api.sendPhoto({
            chat_id: chatId,
            photo: data.avatar,
            caption: report,
            parse_mode: 'HTML'
          });
          return;
        } catch (_) {}
      }

      await ctx.reply(report, { parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (err) {
      if (waitMsg && waitMsg.message_id) {
        await ctx.api.deleteMessage({ chat_id: chatId, message_id: waitMsg.message_id }).catch(() => {});
      }
      await ctx.reply(`❌ <b>فشل الفحص:</b>\n${err.message || 'حدث خطأ غير متوقع'}`, { parse_mode: 'HTML' });
    }
  });

  bot.api.getMe().then((me) => {
    console.log(`🚀 [FOX TELEGRAM BOT] البوت يعمل بنجاح: @${me.username} (ID: ${me.id})`);
    bot.startPolling().catch((e) => console.warn('Polling notice:', e.message));
  }).catch((e) => {
    console.error('❌ [FOX TELEGRAM BOT] خطأ في تشغيل البوت:', e.message);
  });
}
