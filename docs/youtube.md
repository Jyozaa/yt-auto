# YouTube setup

GitHub Actions starts with `YOUTUBE_UPLOAD_ENABLED=false` and `YOUTUBE_ALLOW_PUBLIC=false`. An upload requires a QA-passed artifact. The default video privacy is private. Public, unlisted and scheduled publication also require the separate publication switch.

1. In Google Cloud, enable **YouTube Data API v3** and configure the OAuth consent screen. Add the uploading Google account as a test user if the app uses Testing status.
2. Create a Desktop OAuth client. Download its JSON outside the working tree.
3. Run the local helper with an authenticated `gh` session. Open the printed Google OAuth URL and authorize the intended YouTube channel. The loopback callback uses state and PKCE. The helper sends the client ID, client secret and offline refresh token directly to GitHub Actions Secrets.
4. Verify that `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REFRESH_TOKEN` appear in repository **Settings → Secrets and variables → Actions**. Store no token in a story or workflow file.
5. When ready to test a private upload, set the repository Actions variable `YOUTUBE_UPLOAD_ENABLED=true` and process a fresh issue. Check the video ID and private visibility in YouTube Studio before enabling public release.

```sh
npm run youtube:auth -- /absolute/path/to/desktop-oauth-client.json Jyozaa/yt-auto
```

The [Google OAuth guide](https://developers.google.com/identity/protocols/oauth2/native-app) describes desktop clients and refresh tokens. Testing-status external apps may issue short-lived refresh tokens. The [videos.insert reference](https://developers.google.com/youtube/v3/docs/videos/insert) describes upload quota and restrictions on visibility for unverified API projects. Check Google's requirements before changing release settings.

Metadata comes from the story's YouTube title, summary or provided description, citations, tags, category and privacy. Set a future ISO timestamp in `publish.publishAt` with `publish.privacy=private` for scheduled publication, after enabling both switches. The uploader uses resumable sessions and queries acknowledged byte ranges after transient failures. It reports authentication and quota errors through Actions logs.

## Interrupted upload

A durable `upload-started` record is written before the first upload request. An ambiguous outcome intentionally stays locked. Check YouTube Studio, the issue and its Actions run for the matching title and outcome. If the video is present, preserve its video ID and reconcile the record as uploaded. If an administrator confirms the video was never created, explicitly reconcile before attempting a fresh upload. Upload retries never bypass an existing barrier.
