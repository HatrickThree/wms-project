import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient, Prisma } from "wms-prisma-client";

// Run locally with Node 24; never from a deployment build or a browser request.
const [command, ...args] = process.argv.slice(2);
const argument = (name) => args[args.indexOf(name) + 1];
const models = Prisma.dmmf.datamodel.models;
const excluded = new Set(["UserSession", "LoginAttempt"]);
const fields = (model) => model.fields.filter((field) => field.kind !== "object");
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const schemaHash = digest(models.map((model) => [model.name, fields(model).map(({ name, type }) => [name, type])]));
const canonical = (rows) => rows.map((row) => JSON.stringify(row)).sort();

function normalize(value, field) {
  if (value === null) {
    if (field.isRequired) throw new Error(`Missing ${field.name}`);
    return null;
  }
  if (field.type === "DateTime") {
    // SQLite stores Prisma timestamps as milliseconds or UTC SQL/ISO text.
    const date = new Date(typeof value === "string" && !/[zZ]|[+-]\d\d:\d\d$/.test(value)
      ? value.replace(" ", "T") + "Z" : value);
    if (!Number.isFinite(date.getTime())) throw new Error(`Invalid date: ${field.name}`);
    return date.toISOString();
  }
  if (field.type === "Boolean") {
    if (![true, false, 0, 1].includes(value)) throw new Error(`Invalid boolean: ${field.name}`);
    return Boolean(value);
  }
  if (field.type === "Int") {
    if (!Number.isSafeInteger(value) || value < -2147483648 || value > 2147483647)
      throw new Error(`Invalid PostgreSQL integer: ${field.name}`);
    return value;
  }
  if (field.type === "Float" && (typeof value !== "number" || !Number.isFinite(value)))
    throw new Error(`Invalid number: ${field.name}`);
  if (field.kind === "enum") {
    const enumeration = Prisma.dmmf.datamodel.enums.find((item) => item.name === field.type);
    if (!enumeration.values.some((item) => item.name === value)) throw new Error(`Invalid enum: ${field.name}`);
  }
  if ((field.type === "String" || field.kind === "enum") && typeof value !== "string")
    throw new Error(`Invalid text: ${field.name}`);
  return value;
}

function normalizeRow(row, model) {
  const columns = fields(model);
  if (Object.keys(row).length !== columns.length || columns.some((field) => !Object.hasOwn(row, field.name)))
    throw new Error(`Column mismatch for ${model.name}; update the source schema before exporting`);
  return Object.fromEntries(columns.map((field) => [field.name, normalize(row[field.name], field)]));
}

function orderedModels() {
  const pending = models.filter((model) => !excluded.has(model.name));
  const done = new Set(), ordered = [];
  while (pending.length) {
    const index = pending.findIndex((model) => model.fields.every((field) =>
      !field.relationFromFields?.length || done.has(field.type) || field.type === model.name));
    if (index < 0) throw new Error("Cyclic model dependencies require an explicit import plan");
    const [model] = pending.splice(index, 1);
    ordered.push(model); done.add(model.name);
  }
  return ordered;
}

if (command === "export") {
  if (!args.includes("--source") || !args.includes("--out")) throw new Error("Use export --source prisma/dev.db --out .local/sqlite-export.json");
  const { DatabaseSync } = await import("node:sqlite");
  const source = resolve(argument("--source")), output = resolve(argument("--out"));
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    db.exec("BEGIN");
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("Source integrity check failed; no export created");
    const tables = {};
    for (const model of orderedModels()) {
      tables[model.name] = db.prepare(`SELECT * FROM "${model.name}"`).all().map((row) => normalizeRow(row, model));
    }
    const data = { format: "stockspace-sqlite-v1", schemaHash, exportedAt: new Date().toISOString(), tables, checksum: digest(tables) };
    await mkdir(dirname(output), { recursive: true });
    // Never overwrite a previous snapshot accidentally.
    await writeFile(output, JSON.stringify(data), { flag: "wx", mode: 0o600 });
    console.log(`Exported ${Object.values(tables).reduce((sum, rows) => sum + rows.length, 0)} rows to ${output}. Sessions excluded; source unchanged.`);
  } finally { db.close(); }
} else if (command === "import") {
  if (!args.includes("--file") || !args.includes("--confirm-empty"))
    throw new Error("Use import --file .local/sqlite-export.json --confirm-empty; the target must be a freshly migrated empty database");
  const connection = process.env.DIRECT_URL;
  if (!connection || !["postgresql:", "postgres:"].includes(new URL(connection).protocol))
    throw new Error("Set DIRECT_URL to the target PostgreSQL session/direct connection");
  const data = JSON.parse(await readFile(resolve(argument("--file")), "utf8"));
  if (data.format !== "stockspace-sqlite-v1" || data.schemaHash !== schemaHash || data.checksum !== digest(data.tables))
    throw new Error("Export format, schema or checksum does not match; no data imported");
  const ordered = orderedModels();
  if (Object.keys(data.tables).length !== ordered.length || ordered.some((model) => !Array.isArray(data.tables[model.name])))
    throw new Error("Incomplete or unexpected table list");
  for (const model of ordered) data.tables[model.name] = data.tables[model.name].map((row) => normalizeRow(row, model));
  const db = new PrismaClient({ datasourceUrl: connection });
  try {
    await db.$transaction(async (tx) => {
      for (const model of models) {
        if (await tx[model.name[0].toLowerCase() + model.name.slice(1)].count())
          throw new Error(`Target table ${model.name} is not empty; import refused`);
      }
      for (const model of ordered) {
        const delegate = tx[model.name[0].toLowerCase() + model.name.slice(1)];
        const rows = data.tables[model.name];
        for (let offset = 0; offset < rows.length; offset += 250)
          await delegate.createMany({ data: rows.slice(offset, offset + 250) });
        const actual = (await delegate.findMany()).map((row) => normalizeRow(row, model));
        if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(rows)))
          throw new Error(`Verification failed for ${model.name}; rolling back all tables`);
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 });
    console.log("Imported and verified every stored field, ID, balance and history record. All users must sign in again.");
  } finally { await db.$disconnect(); }
} else {
  throw new Error("Choose export or import; see docs/SUPABASE-DEPLOYMENT.md");
}
