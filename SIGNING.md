# Signing Klorine

Windows warns people about programs it cannot trace to a known publisher
("Windows protected your PC"). Signing fixes that. Klorine is set up for two
free routes, and you can use both:

| | Microsoft Store edition | GitHub installer |
|---|---|---|
| Who signs it | Microsoft, automatically | SignPath Foundation (free for open source) |
| Windows warning | Never | Fades as more people install it |
| Updates | Delivered by the Store | Klorine's own updater (Settings) |
| You need | A free developer account, and Microsoft's review of each version | To apply to SignPath and be accepted |
| Best for | Most people | People who avoid the Store |

Paid certificates are not worth it for Klorine: since 2024 even the expensive
"EV" kind no longer removes the warning straight away, and Microsoft's own
low-cost signing service is not open to individual developers in India.

---

## Part A: Microsoft Store

### One-time setup

1. **Create a developer account.** Go to <https://storedeveloper.microsoft.com>
   and register as an **individual**. It is free. Microsoft will ask you to
   confirm your identity.

2. **Reserve the name.** In Partner Center choose **Apps and games** ->
   **New product** -> **MSIX or PWA app**, and reserve the name `Klorine`.

3. **Copy your identity values.** Open the new product -> **Product
   management** -> **Product identity**. You will see three values. Put them
   in `package.json`, in the `"appx"` section near the bottom:

   | Partner Center shows | Goes in package.json as |
   |---|---|
   | Package/Identity/Name | `"identityName"` (replaces `YOUR-STORE-IDENTITY-NAME`) |
   | Package/Identity/Publisher (starts with `CN=`) | `"publisher"` (replaces `CN=YOUR-STORE-PUBLISHER-ID`) |
   | Package/Properties/PublisherDisplayName | `"publisherDisplayName"` (replaces `YOUR-STORE-PUBLISHER-NAME`) |

   Copy them exactly, including capital letters. A mismatch makes Microsoft
   reject the upload.

### Each version

1. Raise `"version"` in `package.json` (the same number as the GitHub release).
2. Build the Store package:

   ```
   npm run dist:store
   ```

   This creates `dist\Klorine-Store-<version>.appx`. It is not signed, and
   that is correct: Microsoft signs it after review.
3. In Partner Center, start a **submission**, upload the `.appx` under
   **Packages**, and fill in the listing: description, screenshots, age
   rating, and the link to your privacy policy.
4. If asked why Klorine needs the `runFullTrust` capability, answer: *"Klorine
   is a desktop web browser built with Electron, which requires it."*
5. Submit. Review usually takes from a few hours to a few days.

### Rules to know

- **Browsers must stay current.** Store policy 10.2.1 requires browsers to use
  Chromium or Gecko and to be no more than 2 major versions behind. Klorine
  uses Chromium through Electron, so run
  `npm install electron@latest --save-dev` before every release.
- **The Store edition does not update itself.** Settings shows "Updates are
  delivered by the Microsoft Store" and Klorine never contacts GitHub.
- The tile logos are in `build\appx`. They were made from Klorine's icon; if
  you change the icon, replace them with pictures of the same sizes.

---

## Part B: GitHub installer, signed by SignPath Foundation

SignPath Foundation signs open-source programs for free. It only accepts
projects that are already public and released, so the order is: release
unsigned first, then apply.

### Step 1: Publish an unsigned release

Follow `RELEASING.md` to put the source code on GitHub and run the **Release**
workflow. Until SignPath is set up, the workflow skips signing and says so.

### Step 2: Prepare the repository

SignPath checks these before accepting a project:

- A `README.md` that says what Klorine does, with a link to the Releases page.
- An open-source license file. Klorine uses MIT, which qualifies.
- A privacy policy, linked from the README.
- A **Code signing policy** section in the README. Use this, filling in your
  GitHub username:

  ```markdown
  ## Code signing policy

  Free code signing provided by [SignPath.io](https://signpath.io),
  certificate by [SignPath Foundation](https://signpath.org).

  - Committers and reviewers: [YOUR-GITHUB-USERNAME](https://github.com/YOUR-GITHUB-USERNAME)
  - Approvers: [YOUR-GITHUB-USERNAME](https://github.com/YOUR-GITHUB-USERNAME)

  Klorine's installers are built from this repository by the
  [Release workflow](.github/workflows/release.yml), and every release is
  approved by hand before it is signed.

  Privacy: see the [privacy policy](PRIVACY.md). Klorine sends no information
  to its developers. The outside services it contacts, and when, are listed
  there.
  ```

- Two-step sign-in (2FA) switched on for your GitHub account: your picture ->
  **Settings** -> **Password and authentication**.

### Step 3: Apply

Apply at <https://signpath.org>. Describe Klorine and link the repository.
They decide whether to accept a project, and a brand-new project may be asked
to come back once it has some users and history.

### Step 4: Connect SignPath to the workflow (after you are accepted)

In **SignPath** (they will give you an organization and a project):

1. Install the **SignPath GitHub App** on the `klorine` repository.
2. Add the predefined **GitHub.com** trusted build system to your
   organization and link it to the Klorine project.
3. Set the project's **artifact configuration** to:

   ```xml
   <?xml version="1.0" encoding="utf-8"?>
   <artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
     <zip-file>
       <pe-file path="Klorine-Setup-*.exe">
         <authenticode-sign/>
       </pe-file>
     </zip-file>
   </artifact-configuration>
   ```

4. Note your **organization ID**, the **project slug** and the **signing
   policy slug** (usually `release-signing`).
5. Create an **API token** for a user allowed to submit signing requests.

In **GitHub**: repository -> **Settings** -> **Secrets and variables** ->
**Actions**.

| Tab | Name | Value |
|---|---|---|
| Secrets | `SIGNPATH_API_TOKEN` | the API token |
| Variables | `SIGNPATH_ORGANIZATION_ID` | your organization ID |
| Variables | `SIGNPATH_PROJECT_SLUG` | the project slug |
| Variables | `SIGNPATH_SIGNING_POLICY_SLUG` | the signing policy slug |

### Step 5: Release as usual

Run the **Release** workflow. It now pauses at "Sign the installer with
SignPath" for up to an hour. Open signpath.io, check the request, and
**approve** it. The workflow then finishes and creates the draft release with
the signed installer.

### Limits to know

- **The warning does not vanish at once.** Windows builds trust in a new
  publisher as people install its software. Early downloads may still be
  warned; this fades with each signed release.
- **Only the installer is signed**, not the program files inside it. A few
  Windows 11 PCs have "Smart App Control" switched on, which can block
  programs that are not fully signed. Those users should install Klorine from
  the Microsoft Store instead.
