import { z } from "zod";

export const RAMCapacitySchema = z
  .object({
    per_module_gb: z.number().positive(),
    modules: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    total_gb: z.number().positive(),
  })
  .refine((data) => data.total_gb === data.per_module_gb * data.modules, {
    message: "total_gb must equal per_module_gb * modules",
  });
