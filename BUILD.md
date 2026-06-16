# Build and Release

This project publishes desktop releases through GitHub Actions. The release
workflow builds macOS, Linux, and Windows packages, uploads all installers and
electron-updater metadata to GitHub Releases, and the packaged app checks
`AGISurge/skillpkg-studio` GitHub Releases for updates.

The macOS package is built for direct distribution from GitHub Releases. This
pipeline does not build a Mac App Store (`mas`) target and does not upload
anything to App Store Connect for App Store distribution. Apple credentials are
used only for notarization through Apple Notary Service.

## Triggering a Release

- Tag release: push a tag named `v<package.json version>`, for example
  `v0.1.0`. The workflow fails if the tag version does not match
  `package.json`.
- Manual release: run the `Release` workflow from GitHub Actions. The manual
  trigger builds the current `package.json` version and accepts a `channel`
  input. The default channel is `latest`.

The immutable release archive and update feed are both uploaded to GitHub
Releases:

```text
https://github.com/AGISurge/skillpkg-studio/releases/tag/v${packageVersion}
```

The app defaults to GitHub release updates from:

```text
owner: AGISurge
repo: skillpkg-studio
channel: latest
```

For a non-default update source, set these environment variables before
packaging:

| Name | Required | Description |
| --- | --- | --- |
| `SKILLPKG_UPDATE_CHANNEL` | No | electron-updater metadata channel. Defaults to `latest`. |
| `SKILLPKG_UPDATE_GITHUB_OWNER` | No | GitHub owner for release updates. Defaults to `AGISurge`. |
| `SKILLPKG_UPDATE_GITHUB_REPO` | No | GitHub repository for release updates. Defaults to `skillpkg-studio`. |

## GitHub Secrets

Configure these in GitHub repository settings under **Settings > Secrets and
variables > Actions > Secrets**.

### macOS Signing and Notarization for Direct Distribution

These values are for a Developer ID signed app distributed from GitHub
Releases. They are not App Store distribution credentials for a `mas` build.

| Name | Required | Description |
| --- | --- | --- |
| `CSC_LINK` | Yes | Developer ID Application certificate for electron-builder. Store as a base64-encoded `.p12` value or another electron-builder supported certificate reference. |
| `CSC_KEY_PASSWORD` | Yes | Password for the `.p12` certificate in `CSC_LINK`. |
| `APPLE_ID` | Yes | Apple Developer account email used for notarization. |
| `APPLE_ID_PASS` | Yes | App-specific password for `APPLE_ID`. This is mapped to `APPLE_APP_SPECIFIC_PASSWORD` in CI. Do not use the normal Apple ID login password. |
| `APPLE_TEAM_ID` | Yes | Apple Developer Team ID. |

Example command for preparing the Developer ID certificate value on macOS:

```bash
base64 -i DeveloperIDApplication.p12 | pbcopy
```

### Linux Signing

Linux `.deb` packages require maintainer metadata. The release config sets this
in `electron-builder.config.cjs` as `SkillPKG <support@skillpkg.com>`. Update
that value if the project has a different official release contact.

| Name | Required | Description |
| --- | --- | --- |
| `LINUX_GPG_PRIVATE_KEY_BASE64` | Yes | Base64-encoded armored private key used to create detached signatures for Linux artifacts. |
| `LINUX_GPG_KEY_ID` | No | GPG key ID to pass to `gpg --local-user`. Recommended when the imported keyring contains more than one key. |
| `LINUX_GPG_PASSPHRASE` | No | GPG key passphrase. Required only when the imported private key is passphrase-protected. |

Example:

```bash
gpg --armor --export-secret-keys YOUR_KEY_ID | base64 | pbcopy
```

### Windows Signing

Windows is included in this release pipeline as an unsigned NSIS package. No
Windows signing secret is required for the current workflow.

If Windows code signing is added later, add certificate secrets such as
`WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`, then update the Windows build job to
pass those values to electron-builder.

## Local Verification

Run these before pushing a release tag:

```bash
npm test -- --watchAll=false
npm run build
```

Platform package commands:

```bash
npm run dist:mac
npm run dist:linux
npm run dist:win
```

Signed local packages:

```bash
npm run dist:mac:signed
npm run dist:linux:signed
```

## CI Acceptance Checklist

- macOS job produces signed and notarized `.dmg` and `.zip` artifacts plus
  update metadata.
- Linux job produces `.AppImage`, `.deb`, `.sig`, `.sha256`, and update
  metadata.
- Windows job produces an unsigned NSIS `.exe` installer plus update metadata.
- GitHub Release `v${packageVersion}` contains the complete artifact set and
  electron-updater metadata for all supported platforms.
