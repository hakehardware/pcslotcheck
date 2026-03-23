# Contributing to PCSlotCheck

The primary way to contribute is by adding hardware data — motherboard and component YAML files. All data lives in the `data/` directory and is validated automatically via CI.

## Data Directory Structure

```
data/
├── motherboards/{manufacturer}/{model-slug}.yaml
├── components/
│   ├── nvme/{model-slug}.yaml
│   ├── gpu/{model-slug}.yaml
│   ├── ram/{model-slug}.yaml
│   └── sata/{model-slug}.yaml
└── schema/                  # JSON Schema definitions (do not edit)
```

## File Naming Conventions

- Use **kebab-case** for all filenames: lowercase, words separated by hyphens.
- The filename (without `.yaml`) must match the `id` field inside the file.
- Examples:
  - `data/motherboards/msi/msi-mag-b850-tomahawk-wifi.yaml` → `id: msi-mag-b850-tomahawk-wifi`
  - `data/components/nvme/samsung-990-pro-2tb.yaml` → `id: samsung-990-pro-2tb`

## Required Fields by Component Type

### Motherboard

`id`, `manufacturer`, `model`, `chipset`, `socket`, `form_factor`, `memory`, `m2_slots`, `pcie_slots`, `sata_ports`, `sources`, `schema_version`

- `memory`: includes type, speeds, capacity, ECC support, slot layout, and recommended population order.
- `m2_slots`: each slot needs interface type, PCIe gen/lanes, form factors, source (CPU/Chipset), SATA support, and any sharing rules.
- `pcie_slots`: each slot needs gen, lanes, physical size, source, and sharing rules.
- `sata_ports`: each port needs version, source, and what disables it (if anything).
- `sources`: at least one URL to the manufacturer spec page or manual.

### NVMe

`id`, `type` ("nvme"), `manufacturer`, `model`, `interface` (protocol, pcie_gen, lanes), `form_factor`, `capacity_gb`, `schema_version`

### GPU

`id`, `type` ("gpu"), `manufacturer`, `model`, `interface` (pcie_gen, lanes), `physical` (slot_width, length_mm), `power` (tdp_w, recommended_psu_w), `schema_version`

### RAM

`id`, `type` ("ram"), `manufacturer`, `model`, `interface` (type, speed_mhz, base_speed_mhz), `capacity` (per_module_gb, modules, total_gb), `schema_version`

### SATA Drive

`id`, `type` ("sata_drive"), `manufacturer`, `model`, `form_factor`, `capacity_gb`, `interface`, `schema_version`

## Contribution Workflow

1. **Fork** the repository and create a branch (e.g., `data/add-asus-rog-strix-b850`).
2. **Add your YAML file** in the correct directory with a kebab-case filename.
3. **Validate locally** before pushing:
   ```bash
   npm run validate
   npm run check-duplicates
   npm run sanity-check
   ```
4. **Open a Pull Request** targeting `main`.
5. CI will automatically run schema validation, duplicate checks, and sanity checks on your changes.
6. A maintainer will review the data for accuracy and merge.

## Validation Rules

CI enforces the following on every PR that touches `data/`:

- All YAML files must pass schema validation against their JSON Schema.
- The `id` field must match the filename stem.
- No duplicate `id` values across the entire `data/` directory.
- Numeric values must be within reasonable ranges (e.g., PCIe gen ≤ 5, TDP ≤ 1000W, storage ≤ 64TB).

## Tips

- Use existing YAML files as templates — copy one and modify it.
- Always include a `sources` entry (motherboards) linking to the official spec page.
- Set `schema_version` to `"1.0"` for all new files.
- If a slot has sharing rules (e.g., using M.2_3 disables SATA ports 5–6), document them in the `sharing` array.
