# Klorine

A simple, privacy-focused web browser for Windows, built with Electron.

Klorine blocks trackers, forgets your browsing when you close it, and never
reports anything to its developers. It is free and open source.

**[Download the latest version](https://github.com/ShreekarNarayan/Klorine/releases/latest)**

## What it does

**Privacy**

- Blocks adverts and trackers with the EasyList and EasyPrivacy lists.
- Wipes history, cookies, cache and site data every time it closes.
- Disrupts fingerprinting: every site sees slightly different, made-up
  details about your computer, and they change each session.
- Removes tracking codes from links and sends the Global Privacy Control
  signal.
- Refuses location, camera, microphone and notification requests, and keeps
  WebRTC from revealing your local network address.
- Shields button: see what was blocked on a page, block JavaScript for a
  site, or switch protection off for a site that breaks.
- Optional: hide your time zone from websites.

**Saved data, only if you choose it**

- An encrypted vault, opened with a master password, for saved passwords and
  bookmarks. It stays on your computer: no account, no sync.
- Passwords are filled in only when you click, and only on the exact site
  they were saved for.
- Import bookmarks from Chrome, Edge, Brave, Firefox or a bookmarks file, and
  passwords from a CSV file.

**Everyday browsing**

- Tabs on top or down the side, colour tab groups, and split view.
- A new tab page with a wallpaper you can change and two optional widgets:
  Markets (a stock watchlist) and Weather (with air quality, for a place you
  type; Klorine never asks for your location).
- Built-in soundscapes: rain, wind and café sounds, generated on your
  computer.
- Light and dark themes with a choice of accent colours.
- Search with DuckDuckGo, Startpage or Brave Search.

## Install

Download `Klorine-Setup-<version>.exe` from the
[Releases page](https://github.com/ShreekarNarayan/Klorine/releases/latest)
and run it. To remove Klorine, use **Settings -> Apps -> Installed apps** in
Windows and choose **Uninstall**.

Windows may show "Windows protected your PC" for a new program it has not
seen often. Click **More info**, then **Run anyway**.

Klorine tells you when a new version is available; you choose when to
download and install it (Settings -> About and updates).

## Privacy

Klorine's developers collect nothing. The few outside services Klorine
contacts (your search engine, and the optional stock and weather widgets) are
listed, with what each can see, in the [privacy policy](PRIVACY.md).

## Run it from the source code

You need [Node.js](https://nodejs.org) (version 22 or newer).

```
npm install
npm start
```

To build the installer yourself, run `npm run dist`. See
[RELEASING.md](RELEASING.md) and [SIGNING.md](SIGNING.md).

## Code signing policy

Klorine's installers are built from this repository by the
[Release workflow](.github/workflows/release.yml), and every release is
approved by hand before it is published.

- Committers and reviewers: [ShreekarNarayan](https://github.com/ShreekarNarayan)
- Approvers: [ShreekarNarayan](https://github.com/ShreekarNarayan)

Privacy: see the [privacy policy](PRIVACY.md). Klorine sends no information
to its developers.

## Credits and licenses

Klorine is released under the [MIT License](LICENSE). It includes and relies
on the work of others:

- [Electron](https://www.electronjs.org) and Chromium (MIT and BSD licenses).
- [EasyList and EasyPrivacy](https://easylist.to) block lists, in the
  `filters` folder (GPL v3 or CC BY-SA 3.0).
- [Ghostery's adblocker library](https://github.com/ghostery/adblocker)
  (MPL 2.0), which matches requests against those lists.
- Google Sans and Material Symbols fonts, in the `fonts` folder (SIL Open
  Font License 1.1; the license texts are in that folder).
- [electron-updater and electron-builder](https://www.electron.build) (MIT).
- Weather and air quality data from [Open-Meteo](https://open-meteo.com)
  (CC BY 4.0). Stock prices from Yahoo Finance.
