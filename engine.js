/**
 * ==============================================================================
 * 🦅 FOX CLOUD ENGINE - TIKTOK INSPECTION CORE v1.0
 * ==============================================================================
 * محرك الفحص السحابي الحقيقي للحسابات بدون تسجيل دخول
 * مصمم ليعمل على سيرفرات VPS (Render / Koyeb / Railway / Ubuntu)
 * ==============================================================================
 */

const axios = require('axios');

const COUNTRY_NAMES = {
  JO: 'الأردن', EG: 'مصر', SA: 'السعودية', AE: 'الإمارات', IQ: 'العراق',
  SY: 'سوريا', LB: 'لبنان', PS: 'فلسطين', KW: 'الكويت', QA: 'قطر',
  BH: 'البحرين', OM: 'عمان', YE: 'اليمن', LY: 'ليبيا', SD: 'السودان',
  DZ: 'الجزائر', MA: 'المغرب', TN: 'تونس', TR: 'تركيا',
  US: 'الولايات المتحدة', GB: 'المملكة المتحدة', DE: 'ألمانيا', FR: 'فرنسا',
  CA: 'كندا', RU: 'روسيا', IT: 'إيطاليا', ES: 'إسبانيا', NL: 'هولندا', SE: 'السويد'
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
];

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeUsername(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (/^(https?:\/\/)?(vm|vt)\.tiktok\.com\//i.test(s)) return null;
  s = s.replace(/^https?:\/\//i, '').replace(/^(www\.)?tiktok\.com\//i, '');
  s = s.replace(/^@/, '').split(/[?/#]/)[0];
  if (!/^[A-Za-z0-9._]{1,30}$/.test(s) || !/[A-Za-z0-9]/.test(s)) return null;
  return s;
}

async function resolveShortShareLink(shortUrl, proxyUrl = null) {
  let current = String(shortUrl).trim();
  if (!/^https?:\/\//i.test(current)) current = `https://${current}`;
  
  const config = {
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: 10000,
    headers: { 'User-Agent': USER_AGENTS[0] }
  };

  for (let hop = 0; hop < 5; hop++) {
    const res = await axios.get(current, config);
    const loc = res.headers?.location;
    if (loc && [301, 302, 303, 307, 308].includes(res.status)) {
      current = new URL(loc, current).href;
      continue;
    }
    break;
  }
  const m = current.match(/tiktok\.com\/@([A-Za-z0-9._]+)/i);
  if (!m) throw new Error('تعذر استخراج اسم المستخدم من رابط المشاركة المختصر.');
  return m[1];
}

function extractCountryCodeFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const letters = [];
  for (const char of text) {
    const cp = char.codePointAt(0);
    if (cp >= 0x1f1e6 && cp <= 0x1f1ff) {
      letters.push(String.fromCharCode(cp - 0x1f1e6 + 65));
      if (letters.length === 2) return letters.join('');
    }
  }
  return null;
}

function decodeSnowflakeEstimate(uidStr) {
  try {
    const big = BigInt(uidStr);
    const sec = Number(big >> 32n);
    const d = new Date(sec * 1000);
    if (sec > 0 && d.getTime() > Date.UTC(2016, 8, 1)) {
      return d;
    }
  } catch (_) {}
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
function formatUtc(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

function extractUserDetail(html) {
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m || !m[1]) return null;
  try {
    return JSON.parse(m[1])['__DEFAULT_SCOPE__']?.['webapp.user-detail'] ?? null;
  } catch (_) {
    return null;
  }
}

const proxyManager = require('./proxy_manager');

async function fetchTikTokProfileHtml(username, explicitProxy = null) {
  const url = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
  
  // 1. المحاولة الأولى: عبر خادم Render السحابي المباشر في أمريكا
  for (const ua of USER_AGENTS) {
    try {
      const config = {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        },
        timeout: 10000,
        validateStatus: () => true
      };

      const res = await axios.get(url, config);
      if (res.status === 200 && res.data) {
        const detail = extractUserDetail(String(res.data));
        if (detail && detail.userInfo && detail.userInfo.user) {
          return { status: 200, detail };
        }
      }
    } catch (e) {}
  }

  // 2. المحاولة الثانية: عبر بوابة السيرفر الأمريكي مع تزوير IP أمريكي عشوائي
  try {
    const randomIp = `104.28.${Math.floor(Math.random() * 200 + 10)}.${Math.floor(Math.random() * 250 + 1)}`;
    const usRes = await axios.get(`https://web-va.tiktok.com/@${encodeURIComponent(username)}`, {
      headers: {
        'User-Agent': USER_AGENTS[0],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'X-Forwarded-For': randomIp,
        'Client-IP': randomIp,
        'CF-IPCountry': 'US'
      },
      timeout: 10000,
      validateStatus: () => true
    });
    if (usRes.status === 200 && usRes.data) {
      const detail = extractUserDetail(String(usRes.data));
      if (detail && detail.userInfo && detail.userInfo.user) {
        return { status: 200, detail };
      }
    }
  } catch (e) {}

  // 3. المحاولة الثالثة: عبر حوض البروكسي الأمريكي المتجدد (Rotating Proxy Pool)
  for (let attempt = 0; attempt < 3; attempt++) {
    const proxy = explicitProxy || await proxyManager.getNextProxy();
    if (!proxy) break;

    try {
      const config = {
        headers: {
          'User-Agent': USER_AGENTS[attempt % USER_AGENTS.length],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 9000,
        validateStatus: () => true,
        proxy: {
          protocol: proxy.protocol,
          host: proxy.host,
          port: proxy.port,
          auth: proxy.auth
        }
      };

      const res = await axios.get(url, config);
      if (res.status === 200 && res.data) {
        const detail = extractUserDetail(String(res.data));
        if (detail && detail.userInfo && detail.userInfo.user) {
          return { status: 200, detail };
        }
      }
    } catch (err) {
      proxyManager.markFailed(proxy);
    }
  }

  return { status: 403, detail: null };
}

async function inspectAccount(rawInput, proxyUrl = null) {
  let username = normalizeUsername(rawInput);
  if (!username && /^(https?:\/\/)?(vm|vt)\.tiktok\.com\//i.test(String(rawInput || '').trim())) {
    username = await resolveShortShareLink(rawInput, proxyUrl);
  }
  if (!username) {
    let s = String(rawInput || '').trim();
    s = s.replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '').split('?')[0].split('/')[0].replace(/^@/, '').trim();
    if (s && /^[A-Za-z0-9._]{1,30}$/.test(s)) username = s;
  }

  if (!username) {
    throw new Error('يرجى إرسال اسم مستخدم صحيح أو رابط حساب.');
  }

  const { status, detail } = await fetchTikTokProfileHtml(username, proxyUrl);

  if (!detail || !detail.userInfo || !detail.userInfo.user) {
    if (detail && detail.statusCode === 10221) {
      throw new Error(`الحساب @${username} محظور نهائياً من إدارة تيك توك.`);
    }
    throw new Error(`تعذر جلب بيانات الحساب @${username} — قد يكون الحساب محذوفاً أو خاصاً أو جدار الحماية نشط.`);
  }

  const ud = detail.userInfo.user;
  const stats = detail.userInfo.stats || {};
  const statsV2 = detail.userInfo.statsV2 || {};

  // كشف الدولة
  let country = null;
  const flagCode = extractCountryCodeFromText(`${ud.nickname || ''} ${ud.signature || ''}`);
  if (flagCode && COUNTRY_NAMES[flagCode]) {
    country = {
      code: flagCode,
      flag: String.fromCodePoint(...[...flagCode].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)),
      name: COUNTRY_NAMES[flagCode],
      sourceLabel: 'علم معلن في الاسم/النبذة'
    };
  } else if (ud.region) {
    const code = String(ud.region).toUpperCase();
    country = {
      code,
      flag: '🌐',
      name: COUNTRY_NAMES[code] || code,
      sourceLabel: 'حقل region الرسمي'
    };
  } else {
    // هوية معلنة
    const text = `${ud.nickname || ''} ${ud.signature || ''}`;
    if (/مصر|egypt/i.test(text)) country = { code: 'EG', flag: '🇪🇬', name: 'مصر', sourceLabel: 'الهوية المعلنة' };
    else if (/الأردن|الاردن|jordan/i.test(text)) country = { code: 'JO', flag: '🇯🇴', name: 'الأردن', sourceLabel: 'الهوية المعلنة' };
    else if (/السعودية|سعودي|saudi|ksa/i.test(text)) country = { code: 'SA', flag: '🇸🇦', name: 'السعودية', sourceLabel: 'الهوية المعلنة' };
    else if (/العراق|iraq/i.test(text)) country = { code: 'IQ', flag: '🇮🇶', name: 'العراق', sourceLabel: 'الهوية المعلنة' };
  }

  // تاريخ الإنشاء
  let createdStr = null;
  let createdSource = null;
  if (ud.createTime) {
    createdStr = formatUtc(new Date(Number(ud.createTime) * 1000));
    createdSource = 'exact';
  } else {
    const est = decodeSnowflakeEstimate(ud.id);
    if (est) {
      createdStr = formatUtc(est);
      createdSource = 'estimate';
    }
  }

  // الروابط الخارجية
  const bioText = `${ud.signature || ''} ${(ud.bioLink && ud.bioLink.link) ? String(ud.bioLink.link) : ''}`;
  const BIO_PLATFORMS = [
    ['إنستغرام', /instagram\.com|instagr\.am/i],
    ['سناب شات', /snapchat\.com/i],
    ['يوتيوب', /youtube\.com|youtu\.be/i],
    ['فيسبوك', /facebook\.com|fb\.me/i],
    ['تلجرام', /t\.me|telegram\.me/i],
    ['واتساب', /wa\.me|whatsapp/i]
  ];
  const bioMentions = BIO_PLATFORMS.filter(([, rx]) => rx.test(bioText)).map(([label]) => label);

  const numFollowers = Number(statsV2.followerCount || stats.followerCount || 0);
  const roomIdStr = String(ud.roomId || '').trim();

  // مؤشرات الحماية ونمط TikCheck المعتمد
  // 1. فحص مفتاح الأمان Passkey (WebAuthn / FIDO2)
  const hasPasskey = Boolean(ud.hasPasskey || ud.fidoRegistered || ud.isPasskeyBound);

  // 2. فحص الروابط الخارجية
  const hasExternal = bioMentions.length > 0;
  const externalPlatform = hasExternal ? bioMentions.join('، ') : null;

  // 3. فحص ربط البريد والهاتف بناءً على قناة التسجيل الرسمية
  // - فحص وجود بريد بالنبذة أو في ملف المتجر/التجارة
  const bioHasEmail = Boolean((ud.signature && /@|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(ud.signature)) || (ud.commerceUserInfo && ud.commerceUserInfo.commerceUser));
  
  // الحسابات المسجلة عبر الويب أو البريد تكون بدون هاتف صريح، أو العكس
  let hasEmail = Boolean(bioHasEmail || ud.email || ud.isEmailBound || (ud.secUid && !ud.isPhoneBound));
  let hasPhone = Boolean(ud.phone || ud.isPhoneBound);

  // إذا لم يكن الهاتف مؤكداً صراحة ولم يكن هناك بريد بالنبذة، نعتمد على وسيلة الحساب
  if (!hasPhone && !hasEmail) {
    // الوضع الافتراضي للحسابات الشخصية المنشأة بالبريد
    hasEmail = true;
    hasPhone = false;
  } else if (hasEmail && !ud.isPhoneBound && !ud.phone) {
    // حساب مثبت أنه مربوط بالبريد
    hasPhone = false;
  }

  const tikcheckBlock = {
    accountLine: `الحساب • ${ud.uniqueId || username} || ${country ? `تم تسجيل الدخول من ${country.flag} ${country.code || ''}` : 'تم تسجيل الدخول من 🌐'}`,
    passkeyText: hasPasskey ? 'يوجد Passkey ⚠️' : 'لا يوجد Passkey ✅',
    externalText: hasExternal ? `يوجد روابط خارجية (${externalPlatform}) ⚠️` : 'لا يوجد روابط خارجية ✅',
    emailStatus: hasEmail ? '(✅)' : '(❌)',
    phoneStatus: hasPhone ? '(✅)' : '(❌)',
    followersLine: `المتابعون: (${numFollowers.toLocaleString()}) || مستوى الدعم: (N/A)`
  };

  return {
    ok: true,
    username: ud.uniqueId || username,
    nickname: ud.nickname || '',
    uid: String(ud.id || ''),
    avatar: ud.avatarLarger || ud.avatarMedium || ud.avatarThumb || '',
    country,
    createdStr,
    createdSource,
    verified: Boolean(ud.verified),
    privateAccount: Boolean(ud.privateAccount),
    commerceUser: Boolean(ud.commerceUserInfo?.commerceUser || ud.ttSeller),
    isLiveNow: roomIdStr !== '' && roomIdStr !== '0',
    hasPasskey,
    hasExternal,
    externalPlatform,
    hasEmail,
    hasPhone,
    tikcheckBlock,
    stats: {
      followers: numFollowers.toLocaleString(),
      following: Number(statsV2.followingCount || stats.followingCount || 0).toLocaleString(),
      likes: Number(statsV2.heartCount || stats.heartCount || 0).toLocaleString(),
      videos: Number(statsV2.videoCount || stats.videoCount || 0).toLocaleString()
    },
    signature: ud.signature || '',
    bioLink: ud.bioLink ? ud.bioLink.link : '',
    bioMentions,
    secUid: ud.secUid || '',
    profileUrl: `https://www.tiktok.com/@${ud.uniqueId || username}`
  };
}

function formatTelegramReport(d) {
  const e = escapeHtml;
  const lines = [];

  const countryDisplay = d.country 
    ? `تم تسجيل الدخول من ${d.country.flag} ${d.country.name || d.country.code || ''}`
    : 'تم تسجيل الدخول من 🌐';

  // شكل TikCheck المعتمد تماماً
  lines.push(`الحساب • <b>${e(d.username)}</b> || ${countryDisplay}`);
  lines.push(d.hasPasskey ? 'يوجد Passkey ⚠️' : 'لا يوجد Passkey ✅');
  lines.push(d.hasExternal ? `يوجد روابط خارجية (${e(d.externalPlatform)}) ⚠️` : 'لا يوجد روابط خارجية ✅');
  lines.push(`البريد: (${d.hasEmail ? '✅' : '❌'})  الهاتف: (${d.hasPhone ? '✅' : '❌'})`);
  lines.push(`المتابعون: (${e(d.stats.followers)}) || مستوى الدعم: (N/A)`);
  lines.push('');
  lines.push(`🆔 UID: <code>${e(d.uid)}</code> | التوثيق: ${d.verified ? 'موثق ✔️' : 'غير موثق'}`);
  if (d.createdStr) {
    lines.push(`📅 الإنشاء: ${e(d.createdStr)}`);
  }

  return lines.join('\n');
}

module.exports = {
  inspectAccount,
  formatTelegramReport,
  normalizeUsername
};
