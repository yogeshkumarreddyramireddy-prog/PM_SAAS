
# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** phytomaps-final
- **Date:** 2026-04-28
- **Prepared by:** TestSprite AI Team

---

## 2️⃣ Requirement Validation Summary

#### Test BTC001 Login with valid admin credentials returns JWT
- **Test Code:** [BTC001_Login_with_valid_admin_credentials_returns_JWT.py](./BTC001_Login_with_valid_admin_credentials_returns_JWT.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 33, in <module>
  File "<string>", line 23, in test_login_with_valid_admin_credentials_returns_jwt
AssertionError: Expected status code 200, got 400

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/1d7b8c40-e9b4-4184-9bfe-83e3aff01e28
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC002 Login with invalid credentials returns 400
- **Test Code:** [BTC002_Login_with_invalid_credentials_returns_400.py](./BTC002_Login_with_invalid_credentials_returns_400.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/5eef48eb-a990-48eb-a847-c89b09045b98
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC003 manage-client-courses without auth returns 401
- **Test Code:** [BTC003_manage_client_courses_without_auth_returns_401.py](./BTC003_manage_client_courses_without_auth_returns_401.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/ee259286-c722-4647-b8e9-87db4ff3c7a4
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC004 approve-user without auth returns 401
- **Test Code:** [BTC004_approve_user_without_auth_returns_401.py](./BTC004_approve_user_without_auth_returns_401.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/079e2944-029f-4994-8509-6bd6f03d0ad0
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC005 Admin can call manage-client-courses to list assignments
- **Test Code:** [BTC005_Admin_can_call_manage_client_courses_to_list_assignments.py](./BTC005_Admin_can_call_manage_client_courses_to_list_assignments.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 60, in <module>
  File "<string>", line 34, in test_admin_can_call_manage_client_courses_to_list_assignments
AssertionError: Login failed with status 400

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/4aae4fed-5e90-41bd-8f1d-7c38b897c259
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC006 r2-presign with valid auth and params returns presigned URL
- **Test Code:** [BTC006_r2_presign_with_valid_auth_and_params_returns_presigned_URL.py](./BTC006_r2_presign_with_valid_auth_and_params_returns_presigned_URL.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 41, in <module>
  File "<string>", line 29, in test_r2_presign_with_valid_auth_and_params_returns_presigned_url
AssertionError: Expected 200 OK, got 500: {"error":"Golf course not found"}

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/b4423774-bb2b-4037-964f-68b337788501
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC007 r2-presign with missing required fields returns error
- **Test Code:** [BTC007_r2_presign_with_missing_required_fields_returns_error.py](./BTC007_r2_presign_with_missing_required_fields_returns_error.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/95c5380d-ac0e-4b1c-80ae-b73f8828ef42
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC008 get-vector-layers returns array for valid course
- **Test Code:** [BTC008_get_vector_layers_returns_array_for_valid_course.py](./BTC008_get_vector_layers_returns_array_for_valid_course.py)
- **Test Error:** Traceback (most recent call last):
  File "<string>", line 19, in test_get_vector_layers_returns_array_for_valid_course
AssertionError: Expected 200 OK but got 400

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 25, in <module>
  File "<string>", line 23, in test_get_vector_layers_returns_array_for_valid_course
AssertionError: Error calling get-vector-layers: Expected 200 OK but got 400

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/1bae445a-6c78-4e26-a73f-b937f3d2f984
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC009 user_profiles table blocks unauthenticated access via RLS
- **Test Code:** [BTC009_user_profiles_table_blocks_unauthenticated_access_via_RLS.py](./BTC009_user_profiles_table_blocks_unauthenticated_access_via_RLS.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/1e863d3c-0dfe-4932-b844-2e4986815fb4
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC010 Admin JWT can read all user_profiles
- **Test Code:** [BTC010_Admin_JWT_can_read_all_user_profiles.py](./BTC010_Admin_JWT_can_read_all_user_profiles.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/733d39b6-f79c-40c0-8ad6-18f68cb4f4f4
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC011 active_golf_courses table accessible to admin
- **Test Code:** [BTC011_active_golf_courses_table_accessible_to_admin.py](./BTC011_active_golf_courses_table_accessible_to_admin.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/602ed0a8-f989-4bee-8856-4af6b1b64d7c
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC012 CORS preflight on edge functions returns correct headers
- **Test Code:** [BTC012_CORS_preflight_on_edge_functions_returns_correct_headers.py](./BTC012_CORS_preflight_on_edge_functions_returns_correct_headers.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/c0fb5102-b8e3-40d6-818f-4863600e7593
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC013 create-client-user requires admin role — 401 without auth
- **Test Code:** [BTC013_create_client_user_requires_admin_role__401_without_auth.py](./BTC013_create_client_user_requires_admin_role__401_without_auth.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/14407b5b-4cc5-4a5d-8403-4f032136ab04
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC014 content_files table blocks unauthenticated access
- **Test Code:** [BTC014_content_files_table_blocks_unauthenticated_access.py](./BTC014_content_files_table_blocks_unauthenticated_access.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/2ce36043-04f9-4268-8fc2-cf53ed080c5b
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test BTC015 Signup with new email creates pending user
- **Test Code:** [BTC015_Signup_with_new_email_creates_pending_user.py](./BTC015_Signup_with_new_email_creates_pending_user.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 33, in <module>
  File "<string>", line 22, in test_signup_with_new_email_creates_pending_user
AssertionError: Expected 200 OK, got 400: {"code":400,"error_code":"email_address_invalid","msg":"Email address \"testuser.a7bfb01889ad40a3969f7258de1dc299@example.com\" is invalid"}

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/02a9b9ff-9a02-4c3a-bf82-013c71472a1c/da71c988-18d5-4a99-a934-1f162ee930f3
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---


## 3️⃣ Coverage & Matching Metrics

- **66.67** of tests passed

| Requirement        | Total Tests | ✅ Passed | ❌ Failed  |
|--------------------|-------------|-----------|------------|
| ...                | ...         | ...       | ...        |
---


## 4️⃣ Key Gaps / Risks
{AI_GNERATED_KET_GAPS_AND_RISKS}
---