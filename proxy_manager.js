/**
 * ==============================================================================
 * 🛡️ FOX CLOUD BOT - AUTO-ROTATING PROXY MANAGER
 * ==============================================================================
 * نظام تدوير البروكسيات المخصص والمحمي من الحظر (Webshare Dedicated Pool)
 * ==============================================================================
 */

class ProxyManager {
  constructor() {
    this.customProxy = process.env.PROXY_URL || null;

    // قائمة الـ 10 بروكسيات السكنية والمخصصة من Webshare (مع إعطاء الأولوية لبروكسيات أمريكا)
    this.dedicatedProxies = [
      // 🇺🇸 أمريكا (US - Los Angeles)
      'http://isznqkxo:fdyqudtpyx6m@198.23.243.226:6361',
      // 🇺🇸 أمريكا (US - Piscataway)
      'http://isznqkxo:fdyqudtpyx6m@38.154.185.97:6370',
      // 🇺🇸 أمريكا (US - Los Angeles)
      'http://isznqkxo:fdyqudtpyx6m@191.96.254.138:6185',
      // 🇬🇧 بريطانيا (UK - London)
      'http://isznqkxo:fdyqudtpyx6m@31.59.20.176:6754',
      // 🇬🇧 بريطانيا (UK - London)
      'http://isznqkxo:fdyqudtpyx6m@45.38.107.97:6014',
      // 🇬🇧 بريطانيا (UK - London)
      'http://isznqkxo:fdyqudtpyx6m@198.105.121.200:6462',
      // 🇪🇸 إسبانيا (ES - Madrid)
      'http://isznqkxo:fdyqudtpyx6m@64.137.96.74:6641',
      // 🇩🇪 ألمانيا (DE - Frankfurt)
      'http://isznqkxo:fdyqudtpyx6m@31.58.9.4:6077',
      // 🇵🇱 بولندا (PL - Warsaw)
      'http://isznqkxo:fdyqudtpyx6m@84.247.60.125:6095',
      // 🇯🇵 اليابان (JP - Tokyo)
      'http://isznqkxo:fdyqudtpyx6m@142.111.67.146:5611'
    ];

    this.currentIndex = 0;
  }

  async init() {
    console.log(`🛡️ [PROXY_MANAGER] تم تفعيل حوض Webshare المخصص بنجاح (${this.dedicatedProxies.length} بروكسيات نشطة).`);
  }

  async getNextProxy() {
    if (this.customProxy) {
      return this.parseProxy(this.customProxy);
    }

    if (this.dedicatedProxies.length === 0) {
      return null;
    }

    this.currentIndex = (this.currentIndex + 1) % this.dedicatedProxies.length;
    const raw = this.dedicatedProxies[this.currentIndex];
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
    console.warn(`⚠️ [PROXY_MANAGER] تدوير البروكسي بعد تعثر: ${proxyObj.host}:${proxyObj.port}`);
  }
}

module.exports = new ProxyManager();
