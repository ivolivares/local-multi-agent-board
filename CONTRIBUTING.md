# Contributing to Local Vercel Board (`lvb`)

Thank you for contributing to **Local Vercel Board**, an open-source MIT project by [Iván Olivares](https://iolivares.com).

## Repository Layout

- `app/`, `components/`, `lib/` — Next.js App Router retro desktop UI and local board API.
- `packages/local-vercel-board/` — Standalone publishable npm package (`local-vercel-board` / `lvb` CLI & SPEC-aligned local server powered by `@poppinss/cliui`).
- `scripts/` — Helper scripts (`setup-board.sh` wrapper and `vb.mjs`).

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the desktop board UI, or run the standalone CLI + interactive TUI directly:

```bash
npm run lvb -- serve --port 4100 --dir .board --attach
```

## Running Tests & Verification

Before opening a pull request, please verify:

```bash
# Run all unit tests (desktop logic + CLI + SPEC.md engine)
npm test

# Verify production build
npm run build

# Verify live Vercel Board v1 SPEC.md conformance
npm run lvb -- conformance --url http://127.0.0.1:4100
```

## Pull Request Guidelines

1. Keep PRs focused and include unit tests (`node:test`) for pure logic or SPEC behavior changes.
2. Ensure changes to `packages/local-vercel-board/` remain aligned with [`vercel/board/SPEC.md`](https://github.com/vercel/board/blob/main/SPEC.md).
3. Follow our [Code of Conduct](./CODE_OF_CONDUCT.md).
4. By submitting a contribution, you agree that your contribution is licensed under the repository's [MIT License](./LICENSE).
