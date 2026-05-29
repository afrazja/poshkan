# Poshkan Deployment

## Render

1. Open Render and create a new Web Service.
2. Connect GitHub repo `afrazja/poshkan`.
3. Use:
   - Build command: `npm install`
   - Start command: `npm start`
4. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Deploy the service.

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It is required for validating Poshkan paper API keys used by external tools such as Claude. Do not expose it in browser code.

## Domain

In Render, open the service and add the custom domain:

- `poshkan.com`
- optionally `www.poshkan.com`

Render will show the DNS records to add at your domain registrar.

## Supabase Auth

In Supabase Auth URL settings, add:

- Site URL: `https://poshkan.com`
- Redirect URL: `https://poshkan.com`
- Optional redirect URL: `https://www.poshkan.com`
