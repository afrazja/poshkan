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
   - `TWELVE_DATA_API_KEY`
5. Deploy the service.

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It is required for validating Poshkan paper API keys used by external tools such as Claude. Do not expose it in browser code.

`TWELVE_DATA_API_KEY` is server-only. It is used for Forex quotes, pair search, and Forex chart history.

## Supabase Schema

Run `supabase-portfolio-redesign.sql` in Supabase SQL Editor after pulling changes. It updates portfolio and asset type constraints so `forex` portfolios can be created.

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
