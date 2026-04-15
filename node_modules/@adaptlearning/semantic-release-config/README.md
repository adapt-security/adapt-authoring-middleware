# Adapt semantic-release-config

Shared [semantic-release](https://github.com/semantic-release/semantic-release) configuration and reusable GitHub Actions workflow for Adapt repos.

## What's included

- **Shared config** (`index.js`) — commit analyzer and release notes using the [ESLint preset](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-eslint), plus npm, GitHub, and git plugins
- **Reusable workflow** (`.github/workflows/release.yml`) — a GitHub Actions workflow that runs semantic-release on push to the default branch

## Setup

### 1. Install the config package

```bash
npm install --save-dev @adaptlearning/semantic-release-config
```

### 2. Add release config to `package.json`

Replace any inline `release` config with:

```json
{
  "release": {
    "extends": "@adaptlearning/semantic-release-config"
  }
}
```

### 3. Remove redundant devDependencies

The following are now provided by this package or the `semantic-release` package, and can be removed from your `devDependencies`:

- `semantic-release`
- `@semantic-release/commit-analyzer`
- `@semantic-release/git`
- `@semantic-release/github`
- `@semantic-release/npm`
- `@semantic-release/release-notes-generator`
- `conventional-changelog-eslint`

### 4. Use the reusable workflow

Replace your `.github/workflows/releases.yml` with:

```yaml
name: Release

on:
  push:
    branches:
      - master

permissions:
  contents: write
  issues: write
  pull-requests: write
  id-token: write

jobs:
  release:
    uses: adaptlearning/semantic-release-config/.github/workflows/release.yml@master
```

> **Important note on permissions:**
>
> The `permissions` block is required in the calling workflow. GitHub Actions only grants permissions that are explicitly listed — once a `permissions` key is present, any unlisted permission defaults to `none`. These are needed for semantic-release to push tags, comment on issues/PRs, and for trusted publishing via OIDC.

## Trusted publishing

Trusted publishing lets GitHub Actions publish to npm without long-lived access tokens. Instead, npm verifies the identity of the GitHub Actions workflow using OpenID Connect (OIDC). This means no `NPM_TOKEN` secret to manage or rotate, and published packages include a provenance attestation linking them back to the exact source commit and workflow run.

### GitHub repo setup

The calling workflow must include the following permissions (see step 3 above):

- `contents: write` — push version tags and create GitHub releases
- `issues: write` — comment on released issues
- `pull-requests: write` — comment on released pull requests
- `id-token: write` — request an OIDC token for trusted publishing

### npm package setup

Each npm package needs to be linked to its GitHub repo on npmjs.com:

1. Go to **npmjs.com** > your package > **Settings** > **Publishing access**
2. Under **Trusted publishing**, click **Add new provider**
3. Configure the provider:
   - **Registry**: `GitHub Actions`
   - **Repository owner**: the GitHub org (e.g. `adapt-security`)
   - **Repository name**: the repo name (e.g. `adapt-authoring-core`)
   - **Workflow filename**: `releases.yml`
4. Save — the package can now only be published by the matching workflow
