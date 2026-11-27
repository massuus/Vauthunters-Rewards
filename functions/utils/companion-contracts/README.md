# Companion API validation

These are the website's validators for incoming collector health reports and badge
catalogs. They intentionally have no dependency on the collector implementation.

The collector now lives in the private
[Vauthunters-Tools](https://github.com/massuus/Vauthunters-Tools) repository.
It communicates with this website through `/api/companion-sync` and
`/api/companion-health`; update both ends together if the wire format changes.

At the repository split, these validators match the collector's
`health-contract.mjs` and `badge-catalog.mjs`. Both sides validate public,
allowlisted metadata rather than raw cookies, logs or credentials.
