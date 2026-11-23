import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type PricingItem = {
  id: string;
  client_type: string;
  item_key: string;
  official_fee: number;
  attorney_fee: number;
  total_fee: number;
  currency: string;
};

export type ClientPricing = {
  client_type: string;
  items: PricingItem[];
};

const EXPECTED_ITEMS = 7;

/**
 * Load pricing rows for a client based on their client_type.
 * Never falls back to another group. Throws on missing type or incomplete data.
 */
export async function getPricingForClient(
  db: SupabaseClient,
  clientId: string,
): Promise<ClientPricing> {
  const { data: client, error: clientError } = await db
    .from('clients')
    .select('id, client_type')
    .eq('id', clientId)
    .is('deleted_at', null)
    .single();

  if (clientError) throw clientError;
  if (!client) throw Error('Client not found.');

  if (!client.client_type) {
    throw Error(
      'Client type is required to generate a quotation. Update the client record first.',
    );
  }

  const { data: items, error: pricingError } = await db
    .from('pricing_sheet')
    .select('id, client_type, item_key, official_fee, attorney_fee, total_fee, currency')
    .eq('client_type', client.client_type)
    .order('item_key');

  if (pricingError) throw pricingError;

  if (!items || items.length < EXPECTED_ITEMS) {
    throw Error(
      `Incomplete pricing data for client type "${client.client_type}". Expected ${EXPECTED_ITEMS} items but found ${items?.length ?? 0}.`,
    );
  }

  return { client_type: client.client_type, items };
}
