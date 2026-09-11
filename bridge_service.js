/**
 * ==============================================================================
 * 🦅 FOX CYBER BRIDGE SERVICE - TIKTOK INTELLIGENCE CORE v12.0
 * ==============================================================================
 * محرك الفحص الاستخباراتي الحقيقي فائق السرعة
 * يقوم باستخراج مؤشرات الأمان الحقيقية 100% (Passkey, الهاتف, البريد, الروابط)
 * مع حذف أثر الاستعلام فوراً وتقديم النتائج تحت هوية منظومة FOX الحصرية
 * ==============================================================================
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const path = require('path');

const API_ID = 2040;
const API_HASH = 'b18441a1ff607e10a989891a5462e627';
const SESSION_FILE = path.join(__dirname, 'bridge_session.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class FoxBridgeService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.cachedGroupEntity = null;
    this.cache = new Map(); // كاش داخلي لمدة 15 دقيقة
    this.lock = Promise.resolve();
  }

  async init() {
    if (this.isConnected && this.client) return true;

    if (!fs.existsSync(SESSION_FILE)) {
      console.warn('⚠️ [FOX_BRIDGE] ملف الجلسة bridge_session.json غير متوفر.');
      return false;
    }

    try {
      const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      const sessionString = sessionData.sessionString;
      if (!sessionString) return false;

      this.client = new TelegramClient(new StringSession(sessionString), API_ID, API_HASH, {
        connectionRetries: 5,
      });

      await this.client.connect();
      this.isConnected = true;
      console.log('🦅 [FOX_BRIDGE] تم تفعيل محرك الفحص الاستخباراتي المتصل بنجاح!');
      return true;
    } catch (err) {
      console.error('❌ [FOX_BRIDGE] فشل تشغيل محرك الفحص:', err.message || err);
      this.isConnected = false;
      return false;
    }
  }

  async getTargetGroup() {
    if (this.cachedGroupEntity) return this.cachedGroupEntity;
    const dialogs = await this.client.getDialogs({ limit: 30 });
    const target = dialogs.find(d => (d.title || '').includes('Tiktok Check') || (d.title || '').includes('فحص روابط'));
    if (target) {
      this.cachedGroupEntity = target.inputEntity;
      return this.cachedGroupEntity;
    }
    throw new Error('تعذر تحديد قناة الفحص السريع في حساب الوسيط.');
  }

  parseTikCheckText(text, username) {
    if (!text || typeof text !== 'string') return null;

    // 1. مفتاح المرور Passkey
    const hasPasskey = /يوجد Passkey/i.test(text) && !/(لا يوجد|لا توجد) Passkey/i.test(text);

    // 2. الروابط الخارجية
    const hasExternal = /يوجد روابط خارجية/i.test(text) && !/(لا يوجد|لا توجد) روابط خارجية/i.test(text);
    let externalPlatform = 'غير معلن';
    const extMatch = text.match(/يوجد روابط خارجية \(([^)]+)\)/i);
    if (extMatch && extMatch[1]) {
      externalPlatform = extMatch[1].trim();
    }

    // 3. البريد والهاتف
    let hasEmail = false;
    let hasPhone = false;

    if (/البريد:\s*\([✅✔️]\)/.test(text)) hasEmail = true;
    if (/الهاتف:\s*\([✅✔️]\)/.test(text)) hasPhone = true;

    // 4. المتابعون
    let followers = '0';
    const folMatch = text.match(/المتابعون:\s*\(([^)]+)\)/);
    if (folMatch && folMatch[1]) {
      followers = folMatch[1].trim();
    }

    // 5. بلد السيرفر
    let loginCountry = 'تم تسجيل الدخول من 🇺🇸';
    const cMatch = text.match(/تم تسجيل الدخول من\s*([^\n\r]+)/);
    if (cMatch && cMatch[1]) {
      loginCountry = `تم تسجيل الدخول من ${cMatch[1].trim()}`;
    }

    return {
      username,
      loginCountry,
      hasPasskey,
      hasExternal,
      externalPlatform,
      hasEmail,
      hasPhone,
      followers,
      rawText: text
    };
  }

  formatFoxReport(data) {
    const lines = [];
    lines.push(`الحساب • <b>${data.username}</b>`);
    lines.push(data.hasPasskey ? 'يوجد Passkey ✅' : 'لا يوجد Passkey ❌');
    lines.push(data.hasExternal ? `يوجد روابط خارجية (${data.externalPlatform}) ✅` : 'لا يوجد روابط خارجية ❌');
    lines.push(`البريد: (${data.hasEmail ? '✅' : '❌'})  الهاتف: (${data.hasPhone ? '✅' : '❌'})`);
    lines.push(`المتابعون: (${data.followers}) || مستوى الدعم: (N/A)`);
    return lines.join('\n');
  }

  async queryAccount(rawUsername) {
    const username = String(rawUsername || '').replace(/^@/, '').trim().toLowerCase();
    if (!username) throw new Error('اسم المستخدم غير صالح.');

    // 1. فحص الكاش الداخلي أولاً
    const cached = this.cache.get(username);
    if (cached && Date.now() - cached.timestamp < 900000) { // 15 دقيقة
      return cached.data;
    }

    return new Promise((resolve, reject) => {
      this.lock = this.lock.then(async () => {
        try {
          const ready = await this.init();
          if (!ready) {
            throw new Error('محرك الفحص غير متصل حالياً.');
          }

          const groupEntity = await this.getTargetGroup();

          // 2. فحص سريع لأحدث 30 رسالة في الجروب ربما تم فحص الحساب للتو
          const recent = await this.client.getMessages(groupEntity, { limit: 30 });
          for (const m of recent) {
            if (m.text && m.text.toLowerCase().includes(`\`${username}\``) && m.text.includes('تم تسجيل الدخول من')) {
              const parsed = this.parseTikCheckText(m.text, username);
              if (parsed) {
                const finalData = {
                  ok: true,
                  source: 'FOX_FORENSIC_CORE',
                  ...parsed,
                  formattedText: this.formatFoxReport(parsed)
                };
                this.cache.set(username, { timestamp: Date.now(), data: finalData });
                return resolve(finalData);
              }
            }
          }

          // 3. إرسال أمر الفحص مع معالجة وضع الإبطاء (Slow Mode)
          let sentMsg = null;
          let retries = 3;
          while (retries > 0) {
            try {
              sentMsg = await this.client.sendMessage(groupEntity, {
                message: `/check ${username}`
              });
              break;
            } catch (err) {
              const waitMatch = err.message && err.message.match(/wait of (\d+) seconds/i);
              if (waitMatch && waitMatch[1]) {
                const waitSec = parseInt(waitMatch[1], 10);
                console.log(`⏳ [FOX_BRIDGE] وضع الإبطاء في الجروب يتطلب انتظار ${waitSec} ثانية...`);
                await sleep((waitSec + 1) * 1000);
                retries--;
              } else {
                throw err;
              }
            }
          }

          if (!sentMsg) {
            throw new Error('تعذر إرسال طلب الفحص للجروب.');
          }

          const startTime = Date.now();
          let parsedResult = null;

          // 4. ترقب الرد الفوري (خلال 14 ثانية)
          while (Date.now() - startTime < 14000) {
            const messages = await this.client.getMessages(groupEntity, { limit: 12 });
            for (const m of messages) {
              if (m.id > sentMsg.id && m.text) {
                const isMatchingUser = m.text.toLowerCase().includes(username.toLowerCase());
                const isInspectionReport = m.text.includes('تم تسجيل الدخول من') || m.text.includes('Passkey');
                if (isMatchingUser && isInspectionReport) {
                  parsedResult = this.parseTikCheckText(m.text, username);
                  break;
                }
              }
            }
            if (parsedResult) break;
            await sleep(600);
          }

          // 5. حذف رسالة الأمر فوراً لإبقاء الحساب نظيفاً
          try {
            await this.client.deleteMessages(groupEntity, [sentMsg.id], { revoke: true });
          } catch (_) {}

          if (!parsedResult) {
            throw new Error(`لم يستجب محرك الفحص في الوقت المحدد للحساب @${username}.`);
          }

          const finalData = {
            ok: true,
            source: 'FOX_FORENSIC_CORE',
            ...parsedResult,
            formattedText: this.formatFoxReport(parsedResult)
          };

          this.cache.set(username, { timestamp: Date.now(), data: finalData });
          resolve(finalData);
        } catch (err) {
          reject(err);
        }
      });
    });
  }
}

module.exports = new FoxBridgeService();
