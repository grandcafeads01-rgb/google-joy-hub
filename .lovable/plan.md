# Google Workspace Dashboard

A dashboard where each signed-in user connects their own Google account, then reads Gmail and manages Drive files.

## What you'll get

- **Lovable auth** (email/password + Google sign-in) protecting the dashboard
- **Left sidebar** with: Gmail, Drive, Settings
- **Gmail page** — inbox list, live polling for new mail with toast notifications + unread badge
- **Drive page** — list files/folders, create folder, upload, download
- **Settings page** — "Connect Google Workspace" button + connection status / disconnect

## How Google access works (important)

Lovable auth's built-in Google sign-in only authenticates the user — it does NOT grant Gmail/Drive API access. To read each user's own Gmail/Drive, we use Lovable's **App User Connector** OAuth flow (separate from the login). On the Settings page, the user clicks "Connect Google", consents to Gmail + Drive scopes, and we store the resulting `connection_id` against their Supabase user. All Gmail/Drive API calls run server-side via `callAsAppUser` using that connection_id.

This requires **one setup step from you**: a Google OAuth client ID configured as a Lovable connector client. I'll request the secret `GOOGLE_APP_USER_CONNECTOR_CLIENT_ID` when we get there and walk you through creating it in Google Cloud Console (enable Gmail API + Drive API, add the Lovable redirect URI).

## Architecture

```text
Routes
  /                       → landing, redirects to /dashboard if signed in
  /login                  → Lovable auth (email + Google sign-in)
  /_authenticated/
    dashboard             → overview
    dashboard/gmail       → inbox + live notifications
    dashboard/drive       → file browser
    dashboard/settings    → connect/disconnect Google
  /oauth/google/return    → OAuth callback, stores connection_id

Server functions (src/lib/google.functions.ts)
  startGoogleConnect()    → returns Google consent URL
  saveGoogleConnection()  → persists connection_id to google_connections table
  getGoogleConnection()   → fetch current user's connection
  disconnectGoogle()      → clear connection
  listGmailMessages()     → GET /gmail/v1/users/me/messages + batch metadata
  listDriveFiles()        → GET /drive/v3/files
  createDriveFolder()     → POST /drive/v3/files (mimeType folder)
  getDriveDownloadUrl()   → GET /drive/v3/files/{id}?alt=media (streamed back)
  uploadToDrive()         → POST /upload/drive/v3/files (multipart)

DB (Lovable Cloud / Supabase)
  google_connections(user_id pk, connection_id, connected_at)
  RLS: user can only see/modify their own row
```

## Live Gmail notifications

`useQuery` with `refetchInterval: 30s` against `listGmailMessages`. On each refetch, diff against last seen message ID; new IDs trigger a `sonner` toast + bump the sidebar unread badge.

## Build order

1. Enable Lovable Cloud + create `google_connections` table with RLS
2. Auth shell: `/login` page with email + Google, `_authenticated` guard, root context wiring
3. Dashboard layout with shadcn sidebar (Gmail / Drive / Settings)
4. App User Connector helper file + request `GOOGLE_APP_USER_CONNECTOR_CLIENT_ID` secret
5. Settings page: connect/disconnect flow + `/oauth/google/return` handler
6. Gmail page: inbox list + polling + toast notifications
7. Drive page: list, create folder, upload, download
8. Polish: empty states, loading skeletons, error toasts

## What I need from you during the build

- Confirm to proceed → I'll enable Cloud and start
- Later: a Google OAuth client ID (I'll give exact steps when we get to step 4)

Approve to start, or tell me what to adjust.