alter table public.client_dashboard_card_availability
  add column if not exists coming_soon boolean not null default false;

insert into public.client_dashboard_card_availability (card_key, is_available, coming_soon)
values
  ('quotations', true, false),
  ('schedule-of-fees', true, false),
  ('requirements', true, false),
  ('statements', true, false),
  ('poa', true, false),
  ('projects', true, false),
  ('notifications', true, false),
  ('customer-service', true, false)
on conflict (card_key) do nothing;

grant select, update on public.client_dashboard_card_availability to authenticated;

drop policy if exists "administrators can read client dashboard card settings"
  on public.client_dashboard_card_availability;
create policy "administrators can read client dashboard card settings"
  on public.client_dashboard_card_availability
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'administrator'
        and account_status = 'active'
        and (approval_status is null or approval_status = 'approved')
    )
  );

drop policy if exists "administrators can update client dashboard card settings"
  on public.client_dashboard_card_availability;
create policy "administrators can update client dashboard card settings"
  on public.client_dashboard_card_availability
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'administrator'
        and account_status = 'active'
        and (approval_status is null or approval_status = 'approved')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'administrator'
        and account_status = 'active'
        and (approval_status is null or approval_status = 'approved')
    )
  );
