-- Auto-confirm proxy user
UPDATE auth.users 
SET email_confirmed_at = NOW() 
WHERE email = 'proxyyogi@phytomaps.com';

-- Approve proxy user and assign them to Golfbaan Zeegersloot (Course ID: 6)
UPDATE public.user_profiles 
SET approved = TRUE, golf_course_id = 6 
WHERE email = 'proxyyogi@phytomaps.com';
