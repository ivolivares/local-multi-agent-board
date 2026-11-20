# Contributing to Local Multi-Agent Board (`lb`)

Thank you for contributing to **Local Multi-Agent Board**, an open-source MIT project by [Iván Olivares](https://iolivares.com).

## Repository Layout

- `app/`, `components/`, `lib/` — Next.js App Router retro desktop UI and local board API.
- `packages/local-board/` — Standalone publishable npm package (`local-board` / `lb` CLI & Specification-aligned local server powered by `@poppinss/cliui`).
- `scripts/` — Helper scripts (`setup-board.sh` wrapper and `vb.mjs`).

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the desktop board UI, or run the standalone CLI + interactive TUI directly:

```bash
npm run lb -- serve --port 4100 --dir .board --attach
```

## Running Tests & Verification

Before opening a pull request, please verify:

```bash
# Run all unit tests (desktop logic + CLI + Specification engine)
npm test

# Verify production build
npm run build

# Verify live Board v1 Specification conformance
npm run lb -- conformance --url http://127.0.0.1:4100
```

## Pull Request Guidelines

1. Keep PRs focused and include unit tests (`node:test`) for pure logic or protocol behavior changes.
2. Ensure changes to `packages/local-board/` remain aligned with the [Board v1 Specification](https://github.com/vercel/board/blob/main/SPEC.md).
3. Follow our [Code of Conduct](./CODE_OF_CONDUCT.md).
4. By submitting a contribution, you agree that your contribution is licensed under the repository's [MIT License](./LICENSE).
