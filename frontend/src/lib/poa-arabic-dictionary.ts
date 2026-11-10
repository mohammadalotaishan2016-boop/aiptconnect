import i18nIsoCountries from 'i18n-iso-countries';

export const POA_SERVICE_ARABIC: Record<string, string> = {
  Registration: String.fromCharCode(1578,1587,1580,1610,1604), Renewal: String.fromCharCode(1578,1580,1583,1610,1583),
  'Recording of change of name or change of address': String.fromCharCode(1578,1593,1583,1610,1604,32,1575,1587,1605,32,1575,1604,1605,1575,1604,1603,32,1571,1608,32,1593,1606,1608,1575,1606,32,1575,1604,1605,1575,1604,1603,32,1571,1608,32,1575,1604,1575,1580,1585,1575,1574,1610,1610,1606,32,1605,1593,1575,1611),
  Assignment: String.fromCharCode(1606,1602,1604,32,1605,1604,1603,1610,1577), 'Licensing or licensing cancellation of trademarks': String.fromCharCode(1578,1585,1582,1610,1589,32,1571,1608,32,1573,1604,1594,1575,1569,32,1578,1585,1582,1610,1589,32,1575,1604,1575,1587,1578,1582,1583,1575,1605),
  'Goods limitation or cancellation': String.fromCharCode(1602,1589,1585,32,1571,1608,32,1588,1591,1576,32,1575,1604,1605,1606,1578,1580,1575,1578),
  'Amendment of the trademark logo': String.fromCharCode(1578,1593,1583,1610,1604,32,1575,1604,1589,1608,1585,1577), 'Cancellation of trademarks': String.fromCharCode(1588,1591,1576),
  'Protection of trademarks, patents, industrial designs and copyrights': String.fromCharCode(1581,1605,1575,1610,1577,32,1575,1604,1593,1604,1575,1605,1575,1578,32,1575,1604,1578,1580,1575,1585,1610,1577,32,1608,1576,1585,1575,1569,1575,1578,32,1575,1604,1575,1582,1578,1585,1575,1593,32,1608,1575,1604,1606,1605,1575,1584,1580,32,1575,1604,1589,1606,1575,1593,1610,1577,32,1608,1575,1604,1605,1589,1606,1601,1575,1578,32,1575,1604,1601,1603,1585,1610,1577,32,1608,1581,1602,1608,1602,32,1575,1604,1591,1576,1593,32,1608,1575,1604,1578,1571,1604,1610,1601),
  Concessions: String.fromCharCode(1575,1604,1573,1605,1578,1610,1575,1586,1575,1578),
};

export const COUNTRY_ARABIC_OVERRIDES: Record<string, string> = {
  SA: String.fromCharCode(1575,1604,1605,1605,1604,1603,1577,32,1575,1604,1593,1585,1576,1610,1577,32,1575,1604,1587,1593,1608,1583,1610,1577), AE: String.fromCharCode(1575,1604,1573,1605,1575,1585,1575,1578,32,1575,1604,1593,1585,1576,1610,1577,32,1575,1604,1605,1578,1581,1583,1577), BH: String.fromCharCode(1575,1604,1576,1581,1585,1610,1606), OM: String.fromCharCode(1593,1605,1575,1606), QA: String.fromCharCode(1602,1591,1585),
  JO: String.fromCharCode(1575,1604,1575,1585,1583,1606), EG: String.fromCharCode(1605,1589,1585), LB: String.fromCharCode(1604,1576,1606,1575,1606), SD: String.fromCharCode(1575,1604,1587,1608,1583,1575,1606), RW: String.fromCharCode(1585,1608,1575,1606,1583,1575), MU: String.fromCharCode(1605,1608,1585,1610,1588,1610,1608,1587),
  BNX: String.fromCharCode(1576,1606,1604,1608,1603,1587),
};

export const COUNTRY_CODES_NEED_OWNER_DECISION = ['ARI', 'OAP', 'EUR', 'NCY'] as const;

export function countryToArabic(inputCode: string, locale = 'ar') {
  const code = inputCode.trim().toUpperCase();
  if (!code) throw new Error('Country code is empty.');
  if (COUNTRY_ARABIC_OVERRIDES[code]) return COUNTRY_ARABIC_OVERRIDES[code];
  if ((COUNTRY_CODES_NEED_OWNER_DECISION as readonly string[]).includes(code)) throw new Error(`Arabic country wording needs owner decision for regional code: ${code}`);
  const alpha2 = code.length === 3 ? i18nIsoCountries.alpha3ToAlpha2(code) : code;
  if (!alpha2) throw new Error(`Invalid or unsupported country code: ${code}`);
  if (COUNTRY_ARABIC_OVERRIDES[alpha2]) return COUNTRY_ARABIC_OVERRIDES[alpha2];
  let name: string | undefined;
  try { name = new Intl.DisplayNames([locale], { type: 'region' }).of(alpha2); }
  catch { throw new Error(`Country code is not supported by Intl.DisplayNames: ${code}`); }
  if (!name || name.toUpperCase() === alpha2 || /[A-Za-z]/.test(name)) throw new Error(`No verified Arabic country name is available for: ${code}`);
  return name;
}

export const getPoaArabicCountryName = countryToArabic;

export function countriesToArabic(codes: string[], locale = 'ar') {
  const unique = [...new Set(codes.map((code) => code.trim().toUpperCase()))];
  return joinPoaArabicList(unique.map((code) => countryToArabic(code, locale)), 'countries');
}

export function translatePoaServicesToArabic(services: string[]) {
  const unique = [...new Set(services)];
  const canonical = unique;
  const missing = canonical.filter((label) => !(label in POA_SERVICE_ARABIC));
  if (missing.length) throw new Error(`No Arabic POA service wording is configured for: ${missing.join(', ')}`);
  return joinPoaArabicList(Object.keys(POA_SERVICE_ARABIC).filter((label) => canonical.includes(label)).map((label) => POA_SERVICE_ARABIC[label]), 'services');
}

export function joinPoaArabicList(items: string[], kind: 'countries' | 'services') {
  const separator = kind === 'countries' ? '\u060c ' : ' \u060c ';
  const values = items.filter(Boolean);
  if (kind === 'services' && values.at(-1) === POA_SERVICE_ARABIC.Concessions && values.length > 1) return values.slice(0, -1).join(separator) + '\u060c  ' + values.at(-1);
  return values.join(separator);
}

export function joinArabicPoaValues(services: string[], countries: string[]) {
  return { services: joinPoaArabicList(services, 'services'), countries: joinPoaArabicList(countries, 'countries') };
}

export const servicesToArabic = translatePoaServicesToArabic;
