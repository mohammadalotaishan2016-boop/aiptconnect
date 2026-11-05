import i18nIsoCountries from 'i18n-iso-countries';

export const POA_SERVICE_ARABIC: Record<string, string> = {
  Registration: 'تسجيل', Renewal: 'تجديد',
  'Recording of change of name or change of address': 'تعديل إسم المالك أو عنوان المالك أو الاجرائيين معاً',
  Assignment: 'نقل ملكية', 'Licensing or licensing cancellation of trademarks': 'ترخيص أو الغاء ترخيص الاستخدام',
  'Goods limitation': 'قصر أو شطب المنتجات',
  'Amendment of the trademark logo': 'تعديل الصورة', 'Cancellation of trademarks': 'شطب',
  'Goods cancellation': 'قصر أو شطب المنتجات',
  'Protection of trademarks, patents, industrial designs and copyrights': 'حماية العلامات التجارية وبراءات الإختراع والنماذج الصناعية والمصنفات الفكرية وحقوق الطبع والتأليف',
  Concessions: 'الإمتيازات',
};

export const COUNTRY_ARABIC_OVERRIDES: Record<string, string> = {
  SA: 'المملكة العربية السعودية', AE: 'الإمارات العربية المتحدة', BH: 'البحرين', OM: 'عمان', QA: 'قطر',
  JO: 'الاردن', EG: 'مصر', LB: 'لبنان', SD: 'السودان', RW: 'رواندا', MU: 'موريشيوس',
  // TODO: Confirm whether the legal Word template uses "بنلوكس" or "دول البنلوكس".
  BNX: 'بنلوكس',
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
  return unique.map((code) => countryToArabic(code, locale)).join('،');
}

export function translatePoaServicesToArabic(services: string[]) {
  const unique = [...new Set(services)];
  const missing = unique.filter((label) => !(label in POA_SERVICE_ARABIC));
  if (missing.length) throw new Error(`No Arabic POA service wording is configured for: ${missing.join(', ')}`);
  return Object.keys(POA_SERVICE_ARABIC).filter((label) => unique.includes(label)).map((label) => POA_SERVICE_ARABIC[label]).join('،');
}

export const servicesToArabic = translatePoaServicesToArabic;
