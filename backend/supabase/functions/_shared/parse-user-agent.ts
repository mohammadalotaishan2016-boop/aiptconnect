/**
 * Lightweight user-agent parser for Deno Edge Functions.
 * No external dependencies — uses regex matching against common UA strings.
 */

export interface ParsedDevice {
  device_type: 'Desktop' | 'Mobile' | 'Tablet' | 'Unknown';
  browser: string;
  operating_system: string;
  device_name: string;
}

export function parseUserAgent(ua: string | null | undefined): ParsedDevice {
  if (!ua) return { device_type: 'Unknown', browser: 'Unknown', operating_system: 'Unknown', device_name: 'Unknown Device' };

  const operating_system = parseOS(ua);
  const browser = parseBrowser(ua);
  const device_type = parseDeviceType(ua);
  const device_name = `${operating_system} ${browser}`;

  return { device_type, browser, operating_system, device_name };
}

function parseOS(ua: string): string {
  if (/iPad/.test(ua)) return 'iPadOS';
  if (/iPhone/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) {
    const m = ua.match(/Android\s([\d.]+)/);
    return m ? `Android ${m[1]}` : 'Android';
  }
  if (/Mac OS X/.test(ua)) {
    const m = ua.match(/Mac OS X\s([\d_.]+)/);
    return m ? `macOS ${m[1].replace(/_/g, '.')}` : 'macOS';
  }
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows NT 6\.3/.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6\.2/.test(ua)) return 'Windows 8';
  if (/Windows NT 6\.1/.test(ua)) return 'Windows 7';
  if (/Windows/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'Chrome OS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown OS';
}

function parseBrowser(ua: string): string {
  // Order matters — more specific first
  if (/Edg\//.test(ua)) {
    const m = ua.match(/Edg\/([\d.]+)/);
    return m ? `Edge ${m[1].split('.')[0]}` : 'Edge';
  }
  if (/OPR\//.test(ua) || /Opera/.test(ua)) {
    const m = ua.match(/OPR\/([\d.]+)/);
    return m ? `Opera ${m[1].split('.')[0]}` : 'Opera';
  }
  if (/Brave/.test(ua)) return 'Brave';
  if (/Vivaldi\//.test(ua)) {
    const m = ua.match(/Vivaldi\/([\d.]+)/);
    return m ? `Vivaldi ${m[1].split('.')[0]}` : 'Vivaldi';
  }
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) {
    const m = ua.match(/Chrome\/([\d.]+)/);
    return m ? `Chrome ${m[1].split('.')[0]}` : 'Chrome';
  }
  if (/Safari\//.test(ua) && /Version\//.test(ua)) {
    const m = ua.match(/Version\/([\d.]+)/);
    return m ? `Safari ${m[1].split('.')[0]}` : 'Safari';
  }
  if (/Firefox\//.test(ua)) {
    const m = ua.match(/Firefox\/([\d.]+)/);
    return m ? `Firefox ${m[1].split('.')[0]}` : 'Firefox';
  }
  if (/MSIE|Trident/.test(ua)) return 'Internet Explorer';
  return 'Unknown Browser';
}

function parseDeviceType(ua: string): 'Desktop' | 'Mobile' | 'Tablet' | 'Unknown' {
  if (/iPad|tablet|Kindle|Silk|PlayBook/i.test(ua)) return 'Tablet';
  if (/Mobi|Android.*Mobile|iPhone|iPod|Windows Phone|BB10|Opera Mini|IEMobile/i.test(ua)) return 'Mobile';
  if (/Windows NT|Macintosh|Mac OS X|CrOS|Linux(?!.*Android)/i.test(ua)) return 'Desktop';
  return 'Unknown';
}
