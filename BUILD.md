# Build and Release

This project publishes desktop releases through GitHub Actions. The release
workflow builds macOS, Linux, and Windows packages, uploads the versioned
artifact archive to GitHub Releases, and uploads the current update feed to
Tencent Cloud COS with COSCLI.

The macOS package is built for direct distribution through COS/CDN. This
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

The updater feed is uploaded to COS:

```text
${TENCENT_COS_REMOTE_PREFIX}/${channel}/
```

The immutable version archive is uploaded to GitHub Releases:

```text
v${packageVersion}
```

## GitHub Variables

Configure these in GitHub repository settings under **Settings > Secrets and
variables > Actions > Variables**.

| Name | Required | Description |
| --- | --- | --- |
| `TENCENT_COS_REMOTE_PREFIX` | No | COS object prefix for release files. Defaults to `skillpkg-studio` when unset. Do not include leading or trailing slashes. |
| `SKILLPKG_UPDATE_SERVER_URL` | No | COS/CDN base URL used by electron-builder metadata. Defaults to `https://oss.skillpkg.com/studio`. The workflow appends the selected channel, for example `/latest`. |

The application runtime currently defaults to
`https://oss.skillpkg.com/studio/latest` for the `latest` channel.
If production uses another domain, update `electron/updateConfig.js` before
releasing or make sure the runtime environment provides
`SKILLPKG_UPDATE_SERVER_URL`.

## GitHub Secrets

Configure these in GitHub repository settings under **Settings > Secrets and
variables > Actions > Secrets**.

### Tencent Cloud COS

| Name | Required | Description |
| --- | --- | --- |
| `TENCENT_COS_SECRET_ID` | Yes | Tencent Cloud API SecretId with write access to the target bucket. Use a least-privilege sub-account when possible. |
| `TENCENT_COS_SECRET_KEY` | Yes | Tencent Cloud API SecretKey for the same identity. |
| `TENCENT_COS_BUCKET` | Yes | COS bucket name, including APPID, for example `releases-1250000000`. |
| `TENCENT_COS_REGION` | Yes | COS bucket region, for example `ap-shanghai` or `ap-guangzhou`. |

The workflow downloads the Linux amd64 COSCLI binary from Tencent Cloud's
official download endpoint and uploads the current channel feed with the bucket
endpoint `cos.${TENCENT_COS_REGION}.myqcloud.com`.

### macOS Signing and Notarization for Direct Distribution

These values are for a Developer ID signed app distributed from Tencent Cloud
COS. They are not App Store distribution credentials for a `mas` build.

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
- GitHub Release `v${packageVersion}` contains the complete versioned artifact
  set for all supported platforms.
- COS channel feed contains the complete current release set for all supported
  platforms.
