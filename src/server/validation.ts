import { z } from "zod";
import { ENVIRONMENTS } from "@/lib/types";
import { ServiceError } from "./errors";

// Business rules for flag input. Every mutation goes through these schemas on the server.
export const RULES = {
  key: /^[a-z][a-z0-9_]{2,63}$/,
  owner: /^[a-z][a-z0-9-]{1,39}$/,
  tag: /^[a-z0-9-]{1,24}$/,
  maxTags: 10,
  nameMin: 3,
  nameMax: 80,
  descriptionMax: 500,
};

const key = z
  .string()
  .regex(RULES.key, "Key must be 3-64 characters of lowercase letters, digits or underscores, starting with a letter");
const name = z.string().trim().min(RULES.nameMin).max(RULES.nameMax);
const description = z.string().trim().max(RULES.descriptionMax);
const owner = z
  .string()
  .trim()
  .regex(RULES.owner, "Owner must be a team slug such as payments-platform");
const tags = z
  .array(z.string().trim().regex(RULES.tag, "Tags must be 1-24 lowercase letters, digits or hyphens"))
  .max(RULES.maxTags)
  .refine((t) => new Set(t).size === t.length, "Tags must be unique");
const expectedVersion = z.number().int().positive();

export const environmentSchema = z.enum(ENVIRONMENTS);

export const createFlagSchema = z.strictObject({
  key,
  name,
  description: description.default(""),
  owner,
  tags: tags.default([]),
});

export const updateFlagSchema = z.strictObject({
  name: name.optional(),
  description: description.optional(),
  owner: owner.optional(),
  tags: tags.optional(),
  expectedVersion,
});

export const setEnvironmentSchema = z.strictObject({
  enabled: z.boolean(),
  expectedVersion,
  confirmProduction: z.string().optional(),
});

export const archiveFlagSchema = z.strictObject({ expectedVersion });

export const flagFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  environment: environmentSchema.optional(),
  status: z.enum(["all", "enabled", "disabled"]).default("all"),
  includeArchived: z.boolean().default(false),
});

export const requestIdSchema = z.coerce.number().int().positive();

export const approvalFiltersSchema = z.object({
  status: z.enum(["all", "pending", "approved", "rejected"]).default("all"),
  flag: z.string().trim().max(64).optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const auditFiltersSchema = z.object({
  flag: z.string().trim().max(64).optional(),
  actor: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ServiceError(
      "VALIDATION_FAILED",
      "Invalid input",
      result.error.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message })),
    );
  }
  return result.data;
}
