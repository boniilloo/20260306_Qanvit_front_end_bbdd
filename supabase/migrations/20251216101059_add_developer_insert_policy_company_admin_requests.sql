-- Allow developers to create admin requests for any user/company
create policy "Developers can create admin requests"
on public.company_admin_requests
for insert
to authenticated
with check (public.has_developer_access());






