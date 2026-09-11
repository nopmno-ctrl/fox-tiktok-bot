/**
 * ==============================================================================
 * 🛡️ FOX CLOUD BOT - AUTO-ROTATING PROXY MANAGER
 * ==============================================================================
 * نظام تدوير البروكسيات الأمريكي التلقائي لتفادي حظر الـ IP والكابتشا
 * ==============================================================================
 */

const axios = require('axios');

class ProxyManager {
  constructor() {
    this.customProxy = process.env.PROXY_URL || null;
    this.proxyList = [];
    this.currentIndex = 0;
    this.lastFetched = 0;
    this.fetchIntervalMs = 60 * 60 * 1000; // تحديث القائمة كل ساعة
  }

  async init() {
    if (this.customProxy) {
      console.log('🛡️ [PROXY_MANAGER] استخدام بروكسي مخصص من الإعدادات:', this.customProxy.replace(/:[^:@]+@/, ':***@'));
      return;
    }
    await this.refreshFreeProxyPool();
  }

  async refreshFreeProxyPool() {
    try {
      console.log('🔄 [PROXY_MANAGER] جاري جلب قائمة بروكسيات أمريكية حرة نشطة...');
      const res = await axios.get('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=4000&country=US&ssl=all&anonymity=all', {
        timeout: 8000
      });

      if (res.data && typeof res.data === 'string') {
        const lines = res.data.trim().split(/\r?\n/).map(l => l.trim()).filter(l => /^[0-9.]+:[0-9]+$/.test(l));
        if (lines.length > 0) {
          this.proxyList = lines;
          this.lastFetched = Date.now();
          console.log(`✅ [PROXY_MANAGER] تم تحميل ${this.proxyList.length} بروكسي أمريكي نشط في حوض التدوير.`);
          return;
        }
      }
    } catch (e) {
      console.warn('⚠️ [PROXY_MANAGER] تعذر جلب حوض البروكسي العام:', e.message);
    }
  }

  async getNextProxy() {
    // إذا كان هناك بروكسي مخصص من المستخدم (مثل Webshare)، استخدمه دائماً
    if (this.customProxy) {
      return this.parseProxy(this.customProxy);
    }

    // تحديث الحوض إذا انتهت مدته
    if (Date.now() - this.lastFetched > this.fetchIntervalMs || this.proxyList.length === 0) {
      await this.refreshFreeProxyPool();
    }

    if (this.proxyList.length === 0) {
      return null; // اتصال مباشر
    }

    this.currentIndex = (this.currentIndex + 1) % this.proxyList.length;
    const raw = this.proxyList[this.currentIndex];
    return this.parseProxy(raw);
  }

  parseProxy(raw) {
    try {
      let str = raw.trim();
      if (!str.startsWith('http://') && !str.startsWith('https://')) {
        str = 'http://' + str;
      }
      const u = new URL(str);
      return {
        protocol: u.protocol.replace(':', ''),
        host: u.hostname,
        port: parseInt(u.port, 10),
        auth: (u.username && u.password) ? { username: u.username, password: u.password } : undefined,
        rawUrl: str
      };
    } catch (_) {
      return null;
    }
  }

  markFailed(proxyObj) {
    if (!proxyObj || !proxyObj.rawUrl) return;
    const clean = proxyObj.host + ':' + proxyObj.port;
    this.proxyList = this.proxyList.filter(p => !p.includes(clean));
  }
}

module.exports = new ProxyManager();
