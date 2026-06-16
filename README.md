# Class Resource Hub

A class-only resource sharing website for a small group of students.

## Current Version

- Student accounts by name plus class invite code
- Default invite code: `GENWISE`
- Upload downloadable files
- Share text notes, prompts, and links
- One-click copy for text and prompts
- Links open in a new tab
- Subject folders with resource and open-request counts
- Tags, search, folder filters, and type filters
- Edit/delete your own resources
- Comments under resources
- Resource requests
- Pinned resources
- Announcements
- Bookmarks
- Light/dark mode
- No admin accounts or admin screens

## Run Locally

Double-click `run_class_hub.cmd`, or run:

```powershell
$env:CLASS_CODE="GENWISE"
$env:PORT="4173"
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
```

Open:

```text
http://127.0.0.1:4173
```

## Class Access

For classmates on the same Wi-Fi, run with:

```powershell
$env:HOST="0.0.0.0"
$env:CLASS_CODE="GENWISE"
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
```

Then share your computer's local network IP with the port, for example `http://192.168.1.10:4173`.

For real online hosting, the app can be deployed for free later, but you will need at least one free hosting account.

## Future Ideas To Approve First

- Resource due dates
- Shared class calendar
- Anonymous resource requests
- Weekly digest page
- Simple file previews
- Classmate profile colors
