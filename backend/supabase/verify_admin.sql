-- Read-only. Replace YOUR_EMAIL_HERE with your own Supabase Auth email.
-- Run in your project's SQL Editor, not in a public browser console.
select p.email, p.role, p.approved, p.rejected,
       (u.email_confirmed_at is not null) as email_verified
from public.profiles p
join auth.users u on u.id=p.id
where lower(u.email)=lower('YOUR_EMAIL_HERE');
