import { Buffer } from "node:buffer";
import console from "node:console";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import process from "node:process";

import { pinnedSourceProvenance } from "../src/provenance-state.mjs";

const CANONICAL = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const COMMIT = /^[a-f0-9]{40}$/;
const LOCAL_MARKDOWN_LINK = /\]\((?!https?:\/\/|mailto:|#)([^)\s]+\.md(?:#[^)\s]*)?)\)/g;
const LARGE_BLOCK_BYTES = 256;
const DEPENDENCY_SHINGLE_WORDS = 8;
const MIN_SHARED_DEPENDENCY_SHINGLES = 12;
const MIN_DEPENDENCY_SHINGLE_COVERAGE = 0.2;

async function required(root, name, file, errors) {
  try {
    const value = await readFile(join(root, name, file), "utf8");
    if (!value.length) errors.push(name + ": empty " + file);
    return value;
  } catch {
    errors.push(name + ": missing " + file);
    return "";
  }
}

function parseProvenance(name, source, errors) {
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    errors.push(name + ": provenance.json is not valid JSON");
    return null;
  }

  if (
    !value ||
    value.name !== name ||
    !CANONICAL.test(name) ||
    !["public", "hidden"].includes(value.visibility) ||
    !Array.isArray(value.dependencies)
  ) {
    errors.push(name + ": provenance metadata is invalid");
    return null;
  }

  const explicit = value.sourceProvenance;
  const pinned = pinnedSourceProvenance(value);
  if (explicit?.type === "absent") {
    if (
      Object.prototype.hasOwnProperty.call(value, "upstream") ||
      Object.prototype.hasOwnProperty.call(value, "license") ||
      Object.prototype.hasOwnProperty.call(value, "attribution")
    ) {
      errors.push(name + ": absent Source Provenance must not fabricate pinned metadata");
      return null;
    }
  } else if (!pinned || !COMMIT.test(pinned.commit ?? "")) {
    errors.push(name + ": provenance metadata is invalid");
    return null;
  }

  if (
    Object.prototype.hasOwnProperty.call(value, "adaptations") ||
    !value.projection
  ) {
    errors.push(name + ": legacy free-text provenance is forbidden");
    return null;
  }

  if (
    !Array.isArray(value.projection.sources) ||
    value.projection.sources.length === 0 ||
    !Array.isArray(value.projection.changeRecords) ||
    typeof value.projection.entrypoint !== "string"
  ) {
    errors.push(name + ": structured Mechanical Projection metadata is incomplete");
    return null;
  }

  return value;
}

function unresolvedSupportingLinks(runtime, provenance) {
  const sourcePaths = provenance.projection.sources.map((source) => source.path);
  const generatedPaths = new Set(sourcePaths);
  const generatedNames = new Set(sourcePaths.map((path) => basename(path)));
  const pinned = pinnedSourceProvenance(provenance);
  const inlinedUpstreamNames = new Set([
    ...(pinned?.location ? [basename(pinned.location).toLowerCase()] : []),
    ...sourcePaths
      .map((path) => basename(path).toLowerCase())
      .filter((name) => name.startsWith("upstream-"))
      .map((name) => name.slice("upstream-".length)),
  ]);

  return [...runtime.matchAll(LOCAL_MARKDOWN_LINK)]
    .map((match) => match[1].split("#", 1)[0].replace(/^\.\//, ""))
    .filter((path) => {
      const name = basename(path);
      if (generatedPaths.has(path) || generatedNames.has(name)) return true;
      if (isTargetRepositoryDocument(path)) return false;
      return !inlinedUpstreamNames.has(name.toLowerCase());
    });
}

function isTargetRepositoryDocument(path) {
  const normalized = path.replace(/^\.\//, "");
  return /(?:^|\/)CONTEXT(?:-MAP)?\.md$/i.test(normalized) ||
    /^docs\/adr\/.+\.md$/i.test(normalized);
}

function hasLargeRepeatedBlock(runtime) {
  const seen = new Set();
  for (const block of runtime.split(/\n{2,}/)) {
    const normalized = block.trim();
    if (Buffer.byteLength(normalized, "utf8") < LARGE_BLOCK_BYTES) continue;
    if (seen.has(normalized)) return true;
    seen.add(normalized);
  }
  return false;
}

function normalizedRuntimeWords(runtime) {
  return runtime.toLowerCase().match(/[a-z0-9]+(?:[-_][a-z0-9]+)*/g) ?? [];
}

function runtimeShingles(words, width) {
  const shingles = new Set();
  for (let index = 0; index + width <= words.length; index += 1) {
    shingles.add(words.slice(index, index + width).join(" "));
  }
  return shingles;
}

function hasMaterialDependencyEmbedding(runtime, dependencyRuntime) {
  const exact = dependencyRuntime.trim();
  if (!exact) return false;
  if (runtime.includes(exact)) return true;

  const dependencyWords = normalizedRuntimeWords(dependencyRuntime);
  if (
    dependencyWords.length <
    DEPENDENCY_SHINGLE_WORDS + MIN_SHARED_DEPENDENCY_SHINGLES - 1
  ) {
    return false;
  }

  const dependencyShingles = runtimeShingles(
    dependencyWords,
    DEPENDENCY_SHINGLE_WORDS,
  );
  const runtimeShinglesSet = runtimeShingles(
    normalizedRuntimeWords(runtime),
    DEPENDENCY_SHINGLE_WORDS,
  );
  let shared = 0;
  for (const shingle of dependencyShingles) {
    if (runtimeShinglesSet.has(shingle)) shared += 1;
  }

  return (
    shared >= MIN_SHARED_DEPENDENCY_SHINGLES &&
    shared / dependencyShingles.size >= MIN_DEPENDENCY_SHINGLE_COVERAGE
  );
}

async function runtimeSizes(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }

  const sizes = new Map();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const runtime = await readFile(join(root, entry.name, "runtime.md"), "utf8");
      sizes.set(entry.name, Buffer.byteLength(runtime, "utf8"));
    } catch {
      continue;
    }
  }
  return sizes;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function bundleSnapshot(root, name) {
  const bundleRoot = join(root, name);
  const files = new Map();

  async function visit(directory, prefix) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return false;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = prefix ? prefix + "/" + entry.name : entry.name;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path, relative);
      } else if (entry.isFile()) {
        files.set(relative, sha256(await readFile(path)));
      }
    }
    return true;
  }

  return (await visit(bundleRoot, "")) ? files : null;
}

async function baselineInvariantErrors(root, baselineRoot) {
  let entries;
  try {
    entries = await readdir(baselineRoot, { withFileTypes: true });
  } catch {
    return ["cannot read corpus baseline: " + baselineRoot];
  }

  const errors = [];
  for (const entry of entries
    .filter((item) => item.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const baseline = await bundleSnapshot(baselineRoot, entry.name);
    const current = await bundleSnapshot(root, entry.name);
    if (!current) {
      errors.push("existing baseline bundle removed: " + entry.name);
      continue;
    }
    if (!baseline) {
      errors.push("cannot read baseline bundle: " + entry.name);
      continue;
    }

    const paths = new Set([...baseline.keys(), ...current.keys()]);
    for (const path of [...paths].sort()) {
      if (baseline.get(path) !== current.get(path)) {
        errors.push("existing baseline bundle changed: " + entry.name + "/" + path);
      }
    }
  }
  return errors;
}

function signedBytes(value) {
  return (value >= 0 ? "+" : "") + value + " bytes vs baseline";
}

export async function auditCorpus(root) {
  const errors = [];
  const skills = [];
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const name = entry.name;
    const provenanceSource = await required(root, name, "provenance.json", errors);
    const runtime = await required(root, name, "runtime.md", errors);

    const provenance = parseProvenance(name, provenanceSource, errors);
    if (!provenance || !runtime) continue;

    for (const source of provenance.projection.sources) {
      if (typeof source?.path === "string") {
        await required(root, name, source.path, errors);
      }
    }
    if (pinnedSourceProvenance(provenance)) {
      await required(root, name, "LICENSE", errors);
    }

    const unresolved = unresolvedSupportingLinks(runtime, provenance);
    if (unresolved.length) {
      errors.push(
        name +
          ": unresolved Supporting Document reference: " +
          unresolved.join(", "),
      );
    }
    if (runtime.includes("# Remote execution contract")) {
      errors.push(name + ": Generated Runtime embeds the Runtime Envelope");
    }
    if (hasLargeRepeatedBlock(runtime)) {
      errors.push(name + ": Generated Runtime repeats a large boilerplate block");
    }

    skills.push({
      name,
      visibility: provenance.visibility,
      dependencies: provenance.dependencies,
      runtime,
      runtimeBytes: Buffer.byteLength(runtime, "utf8"),
    });
  }

  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  for (const skill of skills) {
    for (const dependency of skill.dependencies) {
      const child = byName.get(dependency);
      if (!child) {
        errors.push(skill.name + ": unresolved dependency " + dependency);
        continue;
      }
      if (hasMaterialDependencyEmbedding(skill.runtime, child.runtime)) {
        errors.push(skill.name + ": embeds Dependency Skill runtime " + dependency);
      }
    }
  }

  const publicNames = skills
    .filter((skill) => skill.visibility === "public")
    .map((skill) => skill.name);
  if (publicNames.length >= 3) {
    for (const skill of skills) {
      if (publicNames.every((name) => skill.runtime.includes(name))) {
        errors.push(skill.name + ": Generated Runtime embeds the installed public catalog");
      }
    }
  }

  return { errors, skills };
}

const root = process.argv[2] ?? "skills";
const result = await auditCorpus(root);
const baselineRoot = process.env.CORPUS_BASELINE_ROOT ?? null;
const baselineSizes = baselineRoot ? await runtimeSizes(baselineRoot) : null;
if (baselineRoot) {
  result.errors.push(...await baselineInvariantErrors(root, baselineRoot));
}
const publicCount = result.skills.filter((skill) => skill.visibility === "public").length;
const hiddenCount = result.skills.filter((skill) => skill.visibility === "hidden").length;
console.log(
  "Corpus: " +
    result.skills.length +
    " skills (" +
    publicCount +
    " public, " +
    hiddenCount +
    " hidden)",
);
for (const skill of result.skills) {
  const baselineBytes = baselineSizes?.get(skill.name);
  const delta =
    baselineSizes === null
      ? ""
      : ", " + signedBytes(skill.runtimeBytes - (baselineBytes ?? 0));
  console.log(
    "runtime " +
      skill.name +
      ": " +
      skill.runtimeBytes +
      " bytes (~" +
      Math.ceil(skill.runtimeBytes / 4) +
      " tokens)" +
      delta,
  );
}
if (baselineSizes !== null) {
  const currentNames = new Set(result.skills.map((skill) => skill.name));
  for (const [name, bytes] of baselineSizes) {
    if (currentNames.has(name)) continue;
    console.log("runtime " + name + ": removed, " + signedBytes(-bytes));
  }
}
for (const error of result.errors) console.error("error: " + error);
if (result.errors.length) process.exitCode = 1;
