# Klorine privacy policy

*Last updated: 15 November 2026*

Klorine is a web browser. This page explains what information Klorine
handles, where it goes, and what stays on your computer.

## The short version

- **Klorine's developers collect nothing.** There is no Klorine account, no
  usage statistics, no crash reports, no advertising ID, and no server that
  Klorine reports to. We cannot see what you browse, search for or save.
- **Your browsing is wiped when you close Klorine**: history, cookies, cache
  and site data.
- **Nothing is saved unless you choose it**, and what you save stays on your
  computer.
- Klorine does contact a few outside services to do its job. They are all
  listed below, with what each one can see and how to switch it off.

## What stays on your computer

Klorine keeps these files in its own folder in your Windows user profile.
They are never sent anywhere.

| What | When it exists | Protection |
|---|---|---|
| Saved passwords and kept bookmarks (the "vault") | Only if you set up the vault in Settings | Encrypted with your master password (scrypt + AES-256-GCM) and with Windows' protection for your user account. Without the master password nobody can open it, including us. |
| Start page settings: watchlist, weather place, widget positions | Once you change them | Not sensitive; stored as plain settings |
| Your own wallpaper image | If you upload one | Hidden details in the photo (such as location) are removed first |
| "Hide my time zone" choice | Once you change it | A plain setting |
| A prepared copy of the tracker block lists | Always | Contains only the public block lists |

To remove everything: Settings -> Saved data -> **Delete vault**, and
uninstall Klorine, which removes its folder.

## Outside services Klorine contacts

Besides the websites you choose to visit, Klorine itself contacts only these.
Each one receives your internet (IP) address, as every internet connection
does, plus what is listed. Klorine sends no cookies and no identifier to any
of them.

| Service | When | What it receives | How to switch it off |
|---|---|---|---|
| **Your search engine**: DuckDuckGo (default), Startpage or Brave Search | When you search from the address bar | The words you search for | Type full web addresses instead, or pick another engine in Settings |
| **Yahoo Finance** | While the Markets widget is on and a new tab page is showing (about once a minute), and when you search for a stock | The stock symbols on your watchlist; the names you search for | Settings -> Start page widgets -> Stock tracker off |
| **Open-Meteo** (weather and air quality) | Only after you type a place into the Weather widget; then about every 15 minutes while a new tab page is showing | The place name you search for; the rough coordinates of the chosen place (rounded to about 1 km). Never your own location. | Settings -> Start page widgets -> Weather off |
| **GitHub** (updates) | Installer edition only: 15 seconds after Klorine starts, then every 6 hours. Downloads happen only when you click. | That some copy of Klorine checked for a new version | Not switchable, because security updates matter. The Microsoft Store edition does not contact GitHub; the Store delivers its updates. |

Each service handles what it receives under its own privacy policy:
[DuckDuckGo](https://duckduckgo.com/privacy),
[Startpage](https://www.startpage.com/en/privacy-policy),
[Brave Search](https://search.brave.com/help/privacy-policy),
[Yahoo](https://legal.yahoo.com/us/en/yahoo/privacy/index.html),
[Open-Meteo](https://open-meteo.com/en/terms),
[GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

Klorine's fonts, icons and block lists are built into the app, so starting
Klorine does not download them from anywhere.

## Websites you visit

Websites you open receive what any browser sends them: your IP address, the
pages you ask for, and whatever you type into them. Klorine reduces what they
can learn:

- **Trackers and adverts are blocked** using the EasyList and EasyPrivacy
  lists, plus Klorine's own short list.
- **Tracking codes are removed from links** (such as `utm_source` and
  `fbclid`).
- **A "do not sell or share" signal** (Global Privacy Control) is sent with
  every request.
- **Fingerprinting is disrupted**: each site sees slightly different,
  made-up details about your computer, which change every session.
- **Permissions are refused**: websites cannot use your location, camera,
  microphone or notifications.
- **Optionally, your time zone is hidden** (Settings -> Privacy).

Klorine cannot control what a website does with information you give it, for
example when you sign in or fill in a form. If you switch Shields off for a
site, these protections are off for that site.

## Passwords

Klorine offers to save a password only after you set up the vault, and saves
it only when you click **Save**. Passwords are filled in only when you click
the key button, and only on the exact site they were saved for. They never
leave your computer: there is no sync and no cloud backup. If you forget your
master password, the vault cannot be recovered, only deleted.

## Importing from other browsers

When you choose Import, Klorine reads **bookmarks only** from the browser or
file you pick, on your own computer. It never reads other browsers'
passwords, history or cookies. A passwords file (CSV) is read only if you
choose one yourself, and Klorine then offers to delete that file.

## Children

Klorine is a general-purpose browser. It does not knowingly collect
information from anyone, including children.

## Changes to this policy

If Klorine starts contacting a new service, or handles information
differently, this page will be updated in the same release and the change
noted in the release notes.

## Contact

Questions or concerns: open an issue at
<https://github.com/ShreekarNarayan/Klorine/issues>.
