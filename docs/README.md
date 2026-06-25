# AuraOn Docs Site

This folder is a standalone static documentation site for:

```text
docs.auraon.xyz
```

## Deploy on Vercel

Create a separate Vercel project from the same GitHub repo and set:

```text
Framework preset: Other
Root directory: docs
Build command: empty
Output directory: .
Install command: empty
```

Then add the custom domain:

```text
docs.auraon.xyz
```

Keep the main app project pointed at the repo root for `auraon.xyz`.

