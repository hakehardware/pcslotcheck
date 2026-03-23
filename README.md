# PCSlotCheck

An open-source PC component slot compatibility checker. Select a motherboard, assign components (NVMe drives, GPUs, RAM, SATA devices) to specific physical slots, and get warnings about mismatches, suboptimal placements, and bottlenecks.

Unlike broad compatibility tools, PCSlotCheck operates at the **slot level** — catching issues like a Gen5 NVMe in a Gen4 slot, M.2 slots disabling SATA ports, or RAM in non-optimal DIMM slots.

## Quick Start

```bash
# Install dependencies
npm ci

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Generate data manifest and build for production |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run validate` | Validate all YAML data against schemas |
| `npm run validate -- --changed-only` | Validate only changed YAML files (used in CI) |
| `npm run check-duplicates` | Check for duplicate IDs across data files |
| `npm run sanity-check` | Flag values outside reasonable ranges |
| `npm run generate-manifest` | Compile YAML data into static JSON |

## Project Structure

```
pcslotcheck/
├── data/                    # YAML hardware data (source of truth)
│   ├── motherboards/        # Organized by manufacturer
│   ├── components/          # nvme/, gpu/, ram/, sata/
│   └── schema/              # JSON Schema definitions
├── scripts/                 # Data pipeline scripts (TypeScript)
├── src/
│   ├── app/                 # Next.js App Router pages
│   ├── lib/                 # Shared modules (types, validation, sharing)
│   └── components/          # Reusable React UI components
└── tests/                   # Unit and property-based tests
```

## Tech Stack

- **Framework**: Next.js 16 (App Router) with TypeScript
- **Styling**: Tailwind CSS v4
- **Hosting**: Vercel
- **Data**: YAML files compiled to static JSON at build time (Phase 1)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add motherboard and component data via YAML files.

## License

Open source. See repository for license details.
