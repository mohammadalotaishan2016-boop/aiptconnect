-- Materialized fee tables: pre-computed from spreadsheet workbook parsing.
-- Eliminates the need to parse the full workbook JSONB blob on every quotation lookup.
-- Populated once per workbook revision change, served via indexed queries.

-- ============================================================================
-- MATERIALIZED FEES (replaces runtime parseSpreadsheetPricing → fees)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.materialized_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision INTEGER NOT NULL,
  client_type VARCHAR(20),
  country_id UUID NOT NULL REFERENCES public.countries(id),
  category TEXT NOT NULL,
  procedure_name TEXT NOT NULL,
  official_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  attorney_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  available BOOLEAN NOT NULL DEFAULT true,
  issue TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT mf_category_check CHECK (category IN ('Trademark','Patent','Design','Copyright','Others')),
  CONSTRAINT mf_unique UNIQUE (revision, client_type, country_id, category, procedure_name)
);

CREATE INDEX IF NOT EXISTS idx_mf_lookup
  ON public.materialized_fees(revision, client_type, country_id, category, procedure_name)
  WHERE available = true;
CREATE INDEX IF NOT EXISTS idx_mf_revision
  ON public.materialized_fees(revision);
CREATE INDEX IF NOT EXISTS idx_mf_country_category
  ON public.materialized_fees(revision, client_type, country_id, category);

-- ============================================================================
-- MATERIALIZED CLASS RATES (replaces runtime parseSpreadsheetPricing → class_rates)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.materialized_class_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision INTEGER NOT NULL,
  client_type VARCHAR(20),
  country_id UUID NOT NULL REFERENCES public.countries(id),
  class_type TEXT NOT NULL,
  class_number INTEGER NOT NULL,
  official_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  attorney_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  available BOOLEAN NOT NULL DEFAULT true,
  issue TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT mcr_class_type_check CHECK (class_type IN ('Per mark per class','Multi-class','Up to 3 classes','Up to 5 classes')),
  CONSTRAINT mcr_class_number_check CHECK (class_number >= 1 AND class_number <= 45),
  CONSTRAINT mcr_unique UNIQUE (revision, client_type, country_id, class_type, class_number)
);

CREATE INDEX IF NOT EXISTS idx_mcr_lookup
  ON public.materialized_class_rates(revision, client_type, country_id, class_type);
CREATE INDEX IF NOT EXISTS idx_mcr_revision
  ON public.materialized_class_rates(revision);

-- ============================================================================
-- MATERIALIZED ADDON FEES (claiming priority + state fees)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.materialized_addon_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision INTEGER NOT NULL,
  client_type VARCHAR(20),
  country_id UUID NOT NULL REFERENCES public.countries(id),
  fee_type TEXT NOT NULL,
  procedure_name TEXT,
  official_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  attorney_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT maf_fee_type_check CHECK (fee_type IN ('claiming_priority','state')),
  CONSTRAINT maf_unique UNIQUE (revision, client_type, country_id, fee_type, procedure_name)
);

CREATE INDEX IF NOT EXISTS idx_maf_lookup
  ON public.materialized_addon_fees(revision, client_type, country_id, fee_type);
CREATE INDEX IF NOT EXISTS idx_maf_revision
  ON public.materialized_addon_fees(revision);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.materialized_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materialized_class_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materialized_addon_fees ENABLE ROW LEVEL SECURITY;

-- Read access for all authenticated users
CREATE POLICY mf_read ON public.materialized_fees FOR SELECT TO authenticated USING (true);
CREATE POLICY mcr_read ON public.materialized_class_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY maf_read ON public.materialized_addon_fees FOR SELECT TO authenticated USING (true);

-- Write access only via service_role (edge functions use service_role key)
CREATE POLICY mf_service_write ON public.materialized_fees FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY mcr_service_write ON public.materialized_class_rates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY maf_service_write ON public.materialized_addon_fees FOR ALL TO service_role USING (true) WITH CHECK (true);
