# The Bowerbird family

**Bowerbird** is the shared family name for a set of local-first tools. It is
not the name of one application, and it is not the name or persona of the
agent maintaining the repository.

## Apps

| App | Purpose | Repository |
| --- | --- | --- |
| **Bowerbird Contact Porter** | Move contacts between providers | `SlopWare/bowerbird-contact-porter` |
| **Bowerbird Signature Builder** | Build Outlook-safe HTML email signatures | `SlopWare/signature-studio` |
| **Bowerbird Mail** | Native mail client (Phase 0: engine only) | `SlopWare/bowerbird-mail` |

## Naming rules

- User-facing title: **Bowerbird <App>** — for example *Bowerbird Signature
  Builder*. Never just “Bowerbird” where the app identity is meant.
- The wordmark may show “Bowerbird” with the app name as a subtitle; the
  document title, manifest, exports and footer carry the full name.
- Short names (home-screen labels, window titles) use the app part:
  *Signature Builder*, *Contact Porter*.
- Repository slugs and package identifiers are historical and need not match
  the display name; keep them stable to avoid breaking URLs, drafts and
  releases.
- Agents working in these repositories are not “Bowerbird” and must not adopt
  the family name as their own.

## Shared conventions

- Local-first: no account, no backend, no data leaving the machine.
- Plain files and browser APIs over frameworks where practical.
- Honest client support: document what each mail client actually renders.
- Each app keeps its own release train and its own repository; the family name
  is shared branding, not a monorepo requirement.
