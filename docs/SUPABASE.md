# Supabase Setup

This prototype has Supabase configuration placeholders, but the app still runs on the local JSON store until the database schema is confirmed.

## Local `.env`

Create a local `.env` file from `.env.example` and fill:

```text
SUPABASE_URL=your-project-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_STORAGE_BUCKET=class-resources
```

Do not commit `.env`.

## Database Schema

Ask the professor whether the database already has tables. If not, run:

```text
docs/supabase-schema.sql
```

The SQL creates tables for:

- campers
- folders
- resources
- comments
- chat messages
- requests
- announcements
- bookmarks
- helpful votes

The included policies are simple camp-prototype policies for an invite-code app. Tighten them before making the app public.

## Still Needed

- Confirm whether the professor already created tables.
- Confirm whether Supabase Auth is required or whether the invite-code flow is enough.
- Confirm storage policies for the `class-resources` bucket.
