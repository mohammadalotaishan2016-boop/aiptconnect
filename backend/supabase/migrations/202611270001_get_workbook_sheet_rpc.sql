-- Extract a single sheet from the spreadsheet workbook JSONB without loading the full blob.
-- Used by the materialize endpoint to stay within Deno Deploy memory limits.
CREATE OR REPLACE FUNCTION public.get_workbook_sheet(sheet_index INTEGER)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.spreadsheet_workbooks.workbook -> 'sheets' -> sheet_index
  FROM public.spreadsheet_workbooks
  WHERE id = true
$$;

-- Allow service_role and authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.get_workbook_sheet(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_workbook_sheet(INTEGER) TO authenticated;
