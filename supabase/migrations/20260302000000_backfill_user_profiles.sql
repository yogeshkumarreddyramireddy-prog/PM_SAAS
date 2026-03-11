-- Backfill user_profiles for auth users created before the on_auth_user_created trigger
-- was deployed. This ensures existing users get profiles.

INSERT INTO public.user_profiles (id, email, role, full_name, approved, golf_course_id)
SELECT 
  au.id,
  au.email,
  CASE 
    WHEN au.email = 'rmryoginreddy@gmail.com' THEN 'admin'
    ELSE 'client'
  END,
  COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'first_name', split_part(au.email, '@', 1)),
  true,
  CASE 
    WHEN au.email = 'rmryoginreddy@gmail.com' THEN NULL
    ELSE 1
  END
FROM auth.users au
WHERE au.id NOT IN (SELECT id FROM public.user_profiles);
