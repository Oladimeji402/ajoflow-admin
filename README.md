# AjoFlow Admin

Admin dashboard for AjoFlow. Deployed at **admin.ajoflow.com**.

## Local development

```bash
cp .env.example .env   # fill Supabase + secrets (same project as user app)
npm install
npm run dev            # http://localhost:3002
```

## Related apps

| App | Folder | URL |
|-----|--------|-----|
| User | `Ajo-pay` | ajoflow.com |
| Admin | this repo | admin.ajoflow.com |
| Marketer | `Ajoflow-marketer` | marketer.ajoflow.com |

Same Supabase Auth project. Migrations live in the **user** repo (`Ajo-pay/supabase`).

## Deploy

1. Create a Vercel project linked to this repo.
2. Set env vars from `.env.example` (production URLs).
3. Point DNS `admin.ajoflow.com` at Vercel.
4. Add `https://admin.ajoflow.com/**` to Supabase Auth redirect allowlist.
