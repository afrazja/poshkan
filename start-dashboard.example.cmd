@echo off
cd /d "%~dp0"
set "SUPABASE_URL=your_supabase_project_url"
set "SUPABASE_ANON_KEY=your_supabase_anon_key"
"C:\Program Files\nodejs\node.exe" server.js
