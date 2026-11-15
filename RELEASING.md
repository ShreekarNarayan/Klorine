# Releasing Klorine

How to turn the project folder into an installer, and how to send updates to
people who already have Klorine installed. For removing Windows' "unknown
publisher" warning, and for the Microsoft Store edition, see `SIGNING.md`.

Updates are delivered through the **Releases** page of a GitHub repository.
The installed Klorine looks there 15 seconds after it starts and then every
6 hours. It only *tells* the user a new version exists; nothing is downloaded
or installed until they click **Download update** in Settings.

---

## One-time setup

1. **Create the repository.** Sign in at <https://github.com>, click **New
   repository**, name it `klorine`, choose **Public**, and create it.

2. **Tell Klorine where it is.** Open `package.json`, find this line near the
   bottom, and replace `YOUR-GITHUB-USERNAME` with your GitHub username:

   ```json
   "owner": "YOUR-GITHUB-USERNAME",
   ```

   (If you named the repository something other than `klorine`, change the
   `"repo"` line just below it too.)

3. **Install the tools.** In the project folder run:

   ```
   npm install
   ```

4. **Put the source code on GitHub.** The easiest way is the free
   **GitHub Desktop** program (<https://desktop.github.com>):

   1. Sign in, then **File** -> **Add local repository** and choose the
      project folder (`E:\PrivacyBrowser`). If it offers to "create a
      repository here", accept.
   2. Type a short note such as `First version` in the **Summary** box and
      click **Commit to main**.
   3. Click **Publish repository**, untick "Keep this code private", and
      choose the `klorine` repository name.

   The `.gitignore` file keeps the large `node_modules` and `dist` folders
   out. Your saved passwords, bookmarks and settings are not in the project
   folder, so they are never uploaded.

---

## Try the installer on your own PC

```
npm run dist
```

This creates `dist\Klorine-Setup-1.0.0.exe`. Run it to install Klorine like
any other program. Nothing is uploaded.

---

## Publish a release

Do these steps for the first release and for every update.

1. **Raise the version number** in `package.json`, for example from
   `"version": "1.0.0"` to `"version": "1.0.1"`. An update is only offered
   when this number is higher than the one people have installed.

2. **Refresh what ships inside Klorine:**

   ```
   npm run update-filters
   npm install electron@latest --save-dev
   ```

   The first line downloads the newest tracker and ad block lists. The second
   brings in the newest Electron, which contains Chrome's security fixes.
   Then run `npm start` and check that Klorine still works.

3. **Send the changes to GitHub.** In GitHub Desktop: type a note such as
   `Version 1.0.1`, click **Commit to main**, then **Push origin**.

4. **Build the release on GitHub.** Open your repository on github.com ->
   **Actions** -> **Release** -> **Run workflow**. In a few minutes it builds
   the installer, signs it if SignPath is set up (see `SIGNING.md`), and
   creates a draft release.

5. **Publish it.** Open **Releases**, open the draft, write a line or two
   about what changed, and click **Publish release**. From that moment,
   installed copies of Klorine will find it.

Do not rename or delete the uploaded files. Klorine needs `latest.yml` and the
`.exe` exactly as they were uploaded.

### Releasing from your own PC instead

If GitHub's build is ever unavailable, you can build and upload from your PC.
This installer is never signed. Create an upload key first: GitHub -> your
picture -> **Settings** -> **Developer settings** -> **Personal access
tokens** -> **Fine-grained tokens**, with access to only the `klorine`
repository and **Contents: Read and write**. Keep it private. Then, in
PowerShell:

```
$env:GH_TOKEN="paste-your-token-here"
npm run release
```

and publish the draft as in step 5.

---

## How often to release

Electron publishes security fixes every week or two, matching Chrome. Because
Klorine can hold saved passwords, aim to publish an update **within a few days
of each new Electron release**. You can see the latest at
<https://releases.electronjs.org>. The Microsoft Store also requires browsers
to stay within 2 major Chromium versions.

---

## Good to know

- **"Windows protected your PC" warning.** Until Klorine is signed, Windows
  SmartScreen shows this when someone runs the installer. They can click
  **More info** -> **Run anyway**. See `SIGNING.md` for removing it.
- **Updates only work in the installed Klorine.** When started with
  `npm start`, Settings says so and the button is switched off.
- **What the update check reveals.** One request to GitHub, with no account
  or identifier: GitHub sees that some copy of Klorine checked for updates,
  and from which internet address.
- **Licenses to ship.** Keep the `fonts\LICENSE-*.txt` files, and credit
  EasyList (<https://easylist.to>) in your README, since its block lists are
  included in the `filters` folder.
