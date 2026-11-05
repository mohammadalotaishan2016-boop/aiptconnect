export const POA_SERVICE_ARABIC: Record<string, string> = {
  Registration: 'تسجيل',
  Renewal: 'تجديد',
  'Recording of change of name or change of address': 'تعديل إسم المالك أو عنوان المالك أو الاجرائيين معاً',
  Assignment: 'نقل ملكية',
  'Licensing or licensing cancellation of trademarks': 'ترخيص أو الغاء ترخيص الاستخدام',
  'Goods limitation': 'قصر أو شطب المنتجات',
  'Amendment of the trademark logo': 'تعديل الصورة',
  'Cancellation of trademarks': 'شطب',
  'Goods cancellation': 'قصر أو شطب المنتجات',
  'Protection of trademarks, patents, industrial designs and copyrights': 'حماية العلامات التجارية وبراءات الإختراع والنماذج الصناعية والمصنفات الفكرية وحقوق الطبع والتأليف',
  Concessions: 'الإمتيازات',
};

const POA_COUNTRY_ARABIC_OVERRIDES: Record<string, string> = {
  SA: 'المملكة العربية السعودية',
  AE: 'الإمارات العربية المتحدة',
  BH: 'البحرين',
  OM: 'عمان',
  QA: 'قطر',
  JO: 'الاردن',
  EG: 'مصر',
  LB: 'لبنان',
  SD: 'السودان',
  RW: 'رواندا',
  MU: 'موريشيوس',
};

export function getPoaArabicCountryName(isoCode: string, locale = 'ar') {
  const code = isoCode.trim().toUpperCase();
  return POA_COUNTRY_ARABIC_OVERRIDES[code] || new Intl.DisplayNames([locale], { type: 'region' }).of(code) || '';
}

export function translatePoaServicesToArabic(services: string[]) {
  return [...new Set(services)].map((service) => {
    const translation = POA_SERVICE_ARABIC[service];
    if (!translation) throw new Error(`No Arabic POA service wording is configured for: ${service}`);
    return translation;
  }).join('،');
}
