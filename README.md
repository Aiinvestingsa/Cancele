# Cancele Social Media

A responsive black-and-gold social-network starter for **GitHub Pages + Supabase**.

## Included

- Email/password signup and login through Supabase Auth
- User profiles, bios and avatar uploads
- Community feed, text posts and photo/video uploads
- Likes, comments and post sharing (copies a post URL)
- Friend requests and acceptance
- Private one-to-one messages between accepted friends
- Marketplace listings in South African rand (ZAR)
- Admin-only post moderation UI
- Row Level Security (RLS) policies and Storage policies
- Responsive layout for phones and desktops

## What works immediately vs. needs setup

**Works immediately:** the static design, navigation, responsive layout and local form validation.

**Requires Supabase setup:** account creation/login, persistent/shared posts, profiles, media uploads, likes, comments, friend requests, messaging, marketplace listings and admin moderation. These features will not persist or work correctly until the SQL is applied and the project credentials are added.

**Important:** this is a starter application, not a fully audited production social network. Before public launch, add abuse reporting, moderation queues, rate limits, email/password recovery UX, privacy policy/terms, backups, monitoring, upload scanning and a tested account deletion/export process. Public media is readable by anyone with its URL. Do not upload sensitive files. Private messages are protected by database RLS, but message encryption beyond Supabase transport/storage protections is not implemented. The app currently refreshes messages when the conversation is opened or sent; realtime subscriptions are not configured.

## 1. Create a Supabase project

1. Open https://supabase.com and create a project.
2. In **Project Settings → API** (or API Keys), copy:
   - Project URL
   - Publishable key (or legacy anon key)
3. Never use the `service_role` / secret key in frontend code.
4. In **SQL Editor**, open a new query, paste the entire `supabase-schema.sql` file and run it.
5. Confirm the tables and policies were created without errors.

The SQL creates the `cancele-media` public storage bucket and the upload/read policies. Public media means anyone with the URL can view uploaded media; only authenticated owners can upload into their own user-ID folder.

## 2. Configure the site

Open `index.html` and find the final `window.CANCELE_CONFIG` object. Replace:

```js
SUPABASE_URL: "YOUR_SUPABASE_PROJECT_URL",
SUPABASE_ANON_KEY: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
```

with your project's URL and **publishable/anon key**. These are browser-safe only when the database is protected by the supplied RLS policies. Do not put secret keys in GitHub.

## 3. Configure authentication URLs

In Supabase, open **Authentication → URL Configuration**:
- Site URL: your GitHub Pages URL, e.g. `https://YOUR-USERNAME.github.io/Cancele-Social-Media/`
- Add that URL to Redirect URLs.
- If using a project site, keep the trailing slash as shown.
- For local testing, you may also add `http://localhost:8000/`.

For a simpler first launch, you can disable email confirmation in Supabase Auth settings while testing. For a public site, keep email confirmation enabled and configure your email provider/templates. The starter displays a message after signup and expects users to confirm by email if confirmation is enabled.

## 4. Deploy to GitHub Pages

1. Create a GitHub repository, for example `Cancele-Social-Media`.
2. Upload `index.html`, `style.css`, `app.js`, `supabase-schema.sql`, and `README.md` to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main`, folder `/ (root)`, and Save.
6. Wait for the Pages deployment to complete, then open the URL GitHub shows.
7. Update the Supabase Site URL and Redirect URLs to match the exact GitHub Pages URL.

No build step is required. The page loads the Supabase JavaScript client from jsDelivr, so visitors need an internet connection.

## 5. Create the first admin

1. Register your own Cancele account on the deployed site.
2. In Supabase → Authentication → Users, copy your user's UUID.
3. In SQL Editor, run the following after replacing the UUID:

```sql
update public.profiles
set is_admin = true
where id = 'YOUR-AUTH-USER-UUID';
```

4. Sign out and sign back in. The Admin Console link should appear.

The browser UI cannot grant admin status. The SQL only grants it to the account you explicitly choose. Keep admin accounts protected with strong passwords and MFA where available.

## 6. Test checklist

- [ ] Create a test account and confirm email if enabled.
- [ ] Sign in and edit your profile.
- [ ] Publish a text post.
- [ ] Upload a small image and a short video.
- [ ] Like a post and add a comment.
- [ ] Register a second test account in another browser/private window.
- [ ] Send and accept a friend request.
- [ ] Send a message to the accepted friend.
- [ ] Publish a marketplace listing.
- [ ] Promote a trusted test account to admin and verify post moderation.
- [ ] Verify a logged-out user cannot read database content or upload files.

## Troubleshooting

- **“Setup required”**: check the URL and key in `index.html`; ensure no spaces or missing characters.
- **Invalid API key / failed fetch**: use the project's publishable/anon key, not a secret key. Check that the URL belongs to the same project.
- **Email confirmation / login issue**: check Supabase Auth → URL Configuration, confirmation email, spam folder and Auth logs.
- **Permission denied / RLS error**: rerun `supabase-schema.sql` in SQL Editor and inspect table policies.
- **Uploads fail**: confirm the `cancele-media` bucket exists and storage policies were created. Use supported image/video types and files below 30 MB.
- **Friend request unique constraint**: an existing request or friendship already exists between these accounts. The starter does not yet offer a “cancel request” button.
- **No admin menu**: promote the user in SQL and sign out/in again.

## Security and production notes

- Never expose Supabase service-role/secret keys in this repository.
- The frontend uses the public publishable/anon key and relies on RLS for authorization.
- The current public media bucket makes media URLs publicly readable. For private media, use a private bucket and signed URLs with additional code.
- Add CAPTCHA/rate limiting to auth and posting before public launch.
- Add user blocking, reporting, moderation workflow, content rules, and account deletion.
- Add pagination and realtime updates for large communities.
- Have the schema and policies reviewed before using the site for sensitive or commercial activity.
