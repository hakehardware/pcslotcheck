import type { Metadata } from "next";
import type { ComponentTypeKey } from "@/lib/form-helpers";
import ContributeClient from "./ContributeClient";

import motherboardSchema from "../../../data/schema/motherboard.schema.json";
import cpuSchema from "../../../data/schema/component-cpu.schema.json";
import gpuSchema from "../../../data/schema/component-gpu.schema.json";
import nvmeSchema from "../../../data/schema/component-nvme.schema.json";
import ramSchema from "../../../data/schema/component-ram.schema.json";
import sataSsdSchema from "../../../data/schema/component-sata-ssd.schema.json";
import sataHddSchema from "../../../data/schema/component-sata-hdd.schema.json";

export const metadata: Metadata = {
  title: "Contribute | PCSlotCheck",
  description: "Generate schema-compliant YAML files for PC components",
};

const schemas: Record<ComponentTypeKey, object> = {
  motherboard: motherboardSchema,
  cpu: cpuSchema,
  gpu: gpuSchema,
  nvme: nvmeSchema,
  ram: ramSchema,
  sata_ssd: sataSsdSchema,
  sata_hdd: sataHddSchema,
};

export default function ContributePage() {
  return <ContributeClient schemas={schemas} />;
}
