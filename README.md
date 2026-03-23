# PCSlotCheck

An open-source PC component slot compatibility checker. Select a motherboard, assign components to specific physical slots, and get warnings about mismatches, suboptimal placements, and bottlenecks.

Unlike broad compatibility tools like PCPartPicker, PCSlotCheck operates at the **slot level** — catching issues like:

- Gen5 NVMe drive in a Gen4 M.2 slot (performance loss)
- M.2 slots that disable SATA ports when populated
- RAM in non-optimal DIMM slots for dual-channel
- SATA drives assigned to NVMe-only M.2 slots (won't work)

## Why?

Motherboard manuals bury slot-level details across dozens of pages. PCSlotCheck models every slot, its capabilities, and its sharing rules so you don't have to dig through footnotes to figure out if populating M.2_1 disables SATA ports 5 and 6.

Built by [Hake Hardware](https://youtube.com/@hakehardware).

## Quick Start

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How Data Works

All hardware data lives as YAML files in `data/` — that's the source of truth. At build time, YAML gets compiled to static JSON that the app serves. No database needed (Phase 1).

Want to add a motherboard or component? See [CONTRIBUTING.md](CONTRIBUTING.md).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Generate data + production build |
| `npm run validate` | Validate YAML against schemas |
| `npm run validate -- --changed-only` | Validate only changed files (CI) |
| `npm run check-duplicates` | Check for duplicate IDs |
| `npm run sanity-check` | Flag out-of-range values |
| `npm run generate-manifest` | Compile YAML → static JSON |
| `npm run test` | Run all tests |

## Project Structure

```
data/                    # YAML hardware data (source of truth)
├── motherboards/        # Organized by manufacturer
├── components/          # nvme/, gpu/, ram/, sata/
└── schema/              # JSON Schema definitions
scripts/                 # Data pipeline (TypeScript)
src/
├── app/                 # Next.js App Router pages
├── lib/                 # Validation engine, types, sharing
└── components/          # React UI components
tests/
├── unit/                # Unit tests
└── property/            # Property-based tests (fast-check)
```

## Tech Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4
- Vitest + fast-check for testing
- YAML → JSON build pipeline with schema validation
- GitHub Actions CI
- Vercel hosting

## Contributing

The easiest way to help is adding motherboard and component data. Each board is a single YAML file — no code changes needed. PRs are validated automatically by CI.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

## Roadmap

- **Phase 1** (current): Static data, client-side validation, ~10-20 boards
- **Phase 2**: Database + sync pipeline, 100+ boards, search, contribution form
- **Phase 3**: LLM build analysis, saved builds, bottleneck scoring
- **Phase 4**: Laptops, servers, historical boards, public API

## License

[MIT](LICENSE)
