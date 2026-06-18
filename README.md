# Camp Resource Hub

A private resource sharing and chat website for an 11-person camp group.

GitHub repo: https://github.com/Akshaan2012/class-resource-hub

Important: this is a Node.js web app, not a static GitHub Pages site. GitHub stores the code. To use the live app with uploads, comments, bookmarks, and shared class data, run the server on a computer or deploy it to a Node-capable host.

## Current Version

- Camper accounts by name plus invite code
- Default invite code: `GENWISE`
- Private localhost prototype mode on `127.0.0.1:4174`
- Camp chatbox for quick coordination
- Two-column camper list showing who has joined
- Two-column resource grid on wide screens to reduce scrolling
- Upload downloadable files
- Share text notes, prompts, and links
- Organize resources by subject, unit/chapter, teacher, semester, and tags
- One-click copy for text and prompts
- Links open in a new tab
- Subject folders with resource and open-request counts
- Tags, search, folder filters, and type filters
- Unit, teacher, semester, and bookmark filters
- Edit/delete your own resources
- Comments under resources
- Resource requests
- Pinned resources
- Helpful marks and camp pulse insights
- Recent activity and top subject/tag panels
- Announcements
- Bookmarks
- Light/dark mode
- No admin accounts or admin screens

## Requirements

- Node.js 18 or newer
- A browser
- Same Wi-Fi/network if classmates are connecting to your laptop

## Run Locally

After cloning the repo:

```powershell
cd class-resource-hub
npm start
```

Then open:

```text
http://127.0.0.1:4173
```

## Private Prototype

This branch has the newer student-focused prototype. It is private to your own computer when run with:

```text
run_private_prototype.cmd
```

Then open:

```text
http://127.0.0.1:4174
```

On Windows, you can also double-click:

```text
run_class_hub.cmd
```

## Share On Same Wi-Fi

On Windows, double-click:

```text
run_network_hub.cmd
```

Or run:

```powershell
$env:CLASS_CODE="GENWISE"
$env:HOST="0.0.0.0"
$env:PORT="4173"
npm start
```

Then find your computer's IPv4 address:

```powershell
ipconfig
```

Share this style of link with classmates:

```text
http://YOUR-IPV4-ADDRESS:4173
```

Example:

```text
http://10.39.2.40:4173
```

## Configuration

These environment variables are optional:

```text
CLASS_CODE=GENWISE
HOST=127.0.0.1
PORT=4174
MAX_BODY_BYTES=83886080
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=class-resources
```

Use `HOST=0.0.0.0` when sharing on Wi-Fi.

Supabase is not connected yet. Add the project URL, anon key, and professor-provided schema details before switching the app from local JSON storage to Supabase.

## Data Storage

The app creates its own local database at:

```text
data/db.json
```

Uploaded files are stored in:

```text
uploads/
```

These files are intentionally ignored by Git so private class data is not pushed to GitHub.

## Troubleshooting

- If classmates cannot open the app, make sure the server is running and use `run_network_hub.cmd`.
- If the link says "refused to connect", restart the server.
- If Windows Firewall asks about Node.js, allow it on private networks.
- If classmates are on a different Wi-Fi or hotspot, the local network link will not work.
- If the laptop sleeps or shuts down, the app goes offline until the server is started again.

## Online Hosting

This app can be hosted online on a Node-capable platform. GitHub Pages alone is not enough because this app needs a server for uploads, comments, and the shared database.

## Future Ideas To Approve First

- Resource due dates
- Shared class calendar
- Anonymous resource requests
- Weekly digest page
- Simple file previews
- Classmate profile colors
