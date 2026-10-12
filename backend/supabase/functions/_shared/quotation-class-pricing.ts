export const classTypes = ['Per mark per class', 'Multi-class', 'Up to 3 classes', 'Up to 5 classes'] as const;
export type ClassType = typeof classTypes[number];
export type Price = { official_fee: number; attorney_fee: number; total_fee: number; currency?: string; available?: boolean; issue?: string | null };
export type ClassRate = Price & { country_id: string; class_type: ClassType; class_number: number };
export type PricingRow = Price & { label: string; class_from: number; class_to: number; source?: string };
export const roundPrice = (value: number) => Math.round(value * 100) / 100;
export const ordinal = (value: number) => `${value}${value % 100 >= 11 && value % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] || 'th'}`;

export function validatePrice(price: Price): Price {
  if (price.available === false) throw Error(price.issue || 'This published fee is unavailable.');
  if (price.currency !== 'USD' || ![price.official_fee, price.attorney_fee, price.total_fee].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0) || roundPrice(price.total_fee) < roundPrice(price.official_fee + price.attorney_fee)) {
    throw Error('A complete published USD fee is required.');
  }
  return price;
}

export function availableClassTypes(countryIds: string[], rates: ClassRate[], perMarkCountryIds: string[], classCount = 2): ClassType[] {
  if (!countryIds.length) return [];
  const lastRequiredRate = Math.max(2, classCount);
  return classTypes.filter(type => countryIds.every(id => {
    if (type === 'Per mark per class') return perMarkCountryIds.includes(id);
    for (let classNumber = 2; classNumber <= lastRequiredRate; classNumber += 1) {
      const matches = rates.filter(rate => rate.country_id === id && rate.class_type === type && rate.class_number === classNumber);
      if (matches.length !== 1) return false;
      try {
        validatePrice(matches[0]);
      } catch {
        return false;
      }
    }
    return true;
  }));
}

/** Class numbers identify goods/services; ordinal class positions determine fees. */
export function calculateClassPricing(base: Price, countryId: string, type: ClassType, count: number, rates: ClassRate[]) {
  validatePrice(base);
  if (!classTypes.includes(type)) throw Error('Select an available type of class.');
  if (!Number.isInteger(count) || count < 1 || count > 45) throw Error('Select a whole-number class count from 1 to 45.');
  const rows: PricingRow[] = [];
  const rateAt = (position: number) => {
    const matches = rates.filter(rate => rate.country_id === countryId && rate.class_type === type && rate.class_number === position);
    if (matches.length !== 1) throw Error(`${type}: ${ordinal(position)} class has ${matches.length ? 'multiple published rates' : 'no published rate'} on the Fees page.`);
    return validatePrice(matches[0]);
  };
  const addRow = (price: Price, from: number, to: number, label: string, source: string) => rows.push({ official_fee: price.official_fee, attorney_fee: price.attorney_fee, total_fee: price.total_fee, currency: price.currency, label, class_from: from, class_to: to, source });
  if (type === 'Per mark per class') {
    for (let position = 1; position <= count; position++) addRow(base, position, position, ordinal(position) + ' class', 'Trademark');
  } else {
    // The first class ALWAYS uses the selected country/procedure in Trademark.
    addRow(base, 1, 1, '1st class', 'Trademark');
    const groupLimit = type === 'Up to 3 classes' ? 3 : type === 'Up to 5 classes' ? 5 : 1;
    if (count > 1 && groupLimit > 1) {
      const last = Math.min(groupLimit, count);
      const includedRates = Array.from({ length: last - 1 }, (_, index) => rateAt(index + 2));
      addRow({ official_fee: roundPrice(includedRates.reduce((sum, row) => sum + row.official_fee, 0)), attorney_fee: roundPrice(includedRates.reduce((sum, row) => sum + row.attorney_fee, 0)), total_fee: roundPrice(includedRates.reduce((sum, row) => sum + row.total_fee, 0)), currency: 'USD' }, 2, last, last === 2 ? 'Additional 2nd class' : 'Additional 2nd to ' + ordinal(last) + ' classes', type);
    }
    for (let position = groupLimit + 1; position <= count; position++) addRow(rateAt(position), position, position, 'Additional ' + ordinal(position) + ' class', type);
  }
  if (type !== 'Per mark per class' && !availableClassTypes([countryId], rates, [], count).includes(type)) throw Error('This class type is not available for the selected country and class count.');
  return { rows, official_fee: roundPrice(rows.reduce((sum, row) => sum + row.official_fee, 0)), attorney_fee: roundPrice(rows.reduce((sum, row) => sum + row.attorney_fee, 0)), total_fee: roundPrice(rows.reduce((sum, row) => sum + row.total_fee, 0)) };
}


export type PricedQuotationItem = {
  quantity?: number; class_numbers?: number[]; class_count?: number; class_pricing_rows?: PricingRow[];
  official_fee: number; attorney_fee: number; other_fee: number; claiming_priority_fee?: number; state_fee_total?: number;
};

/** Expand saved snapshots for display without repricing historical quotations. */
export function quotationDisplayRows(item: PricedQuotationItem, vatRate = 0) {
  const marks = item.quantity || 1;
  const snapshots = item.class_pricing_rows ?? [];
  const details = snapshots.length ? snapshots : [{ label: '', class_from: 1, class_to: item.class_count || item.class_numbers?.length || 1, official_fee: item.official_fee / marks, attorney_fee: item.attorney_fee / marks, total_fee: (item.official_fee + item.attorney_fee + item.other_fee) / marks }];
  let allocatedOfficial = 0, allocatedAttorney = 0, allocatedOther = 0, allocatedVat = 0;
  return details.map((row, index) => {
    const last = index === details.length - 1;
    const official = last ? roundPrice(item.official_fee - allocatedOfficial) : roundPrice(row.official_fee * marks);
    const attorney = last ? roundPrice(item.attorney_fee - allocatedAttorney) : roundPrice(row.attorney_fee * marks);
    const other = last ? roundPrice(item.other_fee - allocatedOther) : roundPrice((row.total_fee - row.official_fee - row.attorney_fee) * marks);
    // Cumulative rounding keeps every VAT row non-negative and the sum exact.
    const vat = roundPrice(roundPrice((allocatedAttorney + attorney) * vatRate / 100) - allocatedVat);
    allocatedOfficial += official; allocatedAttorney += attorney; allocatedOther += other; allocatedVat += vat;
    return { label: row.label, source: 'source' in row ? row.source : undefined, class_from: row.class_from, class_to: row.class_to,
      class_numbers: (item.class_numbers ?? []).slice(row.class_from - 1, row.class_to),
      quantity: snapshots.length ? (row.class_to - row.class_from + 1) * marks : marks,
      official_fee: official, attorney_fee: attorney, other_fee: other + (index === 0 ? (item.claiming_priority_fee || 0) + (item.state_fee_total || 0) : 0), vat };
  });
}
