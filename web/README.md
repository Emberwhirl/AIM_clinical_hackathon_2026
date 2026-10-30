# EHDS Access Desk — front end

The source of truth is [ErmisCho/clinical_hachathlon](https://github.com/ErmisCho/clinical_hachathlon),
folder `web/`. The repository `ErmisCho/health-data-access-desk` is only the deployment
mirror that Lovable builds the live site from; do not open pull requests there.

Live: https://health-data-access-compass.lovable.app

## Development

```sh
bun install
bun run dev
bun run test
bun run build
```

## Publishing

Merge into `clinical_hachathlon`, then push the `web/` subtree to the mirror and publish
in Lovable (Publish → Publish changes):

```sh
git subtree push --prefix=web https://github.com/ErmisCho/health-data-access-desk.git main
```

Lovable also commits edits made in its editor straight to the mirror; pull those back with
`git subtree pull --prefix=web https://github.com/ErmisCho/health-data-access-desk.git main`.
