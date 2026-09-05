import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../", import.meta.url);
/** Reads a repository document relative to the project root. */
const read = (path: string) => readFile(new URL(path, ROOT), "utf8");

describe("issue 15 release documentation", () => {
  /** Verifies that operators have the complete local lifecycle documented. */
  it("documents the complete operator lifecycle", async () => {
    const operator = await read("docs/operator.md");
    expect(operator).toContain("Node.js 20");
    expect(operator).toContain("TypeScript 5.9");
    expect(operator).toContain("http://127.0.0.1:2092/mcp");
    expect(operator).toContain("/healthz");
    for (const command of ["mcp-skills", "mcps skills", "mcps all", "mcps status", "mcps stop skills", "mcps restart skills", "mcps logs skills"]) {
      expect(operator).toContain(command);
    }
    expect(operator).toContain("Secure MCP Tunnel");
  });

  /** Verifies that users have the public and dependency loading model documented. */
  it("documents the user-facing loading and dependency model", async () => {
    const user = await read("docs/user.md");
    expect(user).toContain("load_skill");
    expect(user).toContain("list_skills");
    for (const hidden of ["codebase-design", "domain-modeling", "grilling", "tdd"]) {
      expect(user).toContain(hidden);
    }
    expect(user).toContain("upstream-defined timing");
    expect(user).toContain("Live Capability");
    expect(user).toMatch(/stop|partial completion/i);
  });

  /** Verifies that maintenance guidance points to the canonical contract. */
  it("documents maintenance without duplicating the canonical contract", async () => {
    const maintainer = await read("docs/maintainer.md");
    for (const term of ["Upstream Skill Bundle", "Mechanical Projection", "Change Record", "Supporting Document", "Runtime Envelope", "Temporary Upstream Fix", "npm run corpus:check"]) {
      expect(maintainer).toContain(term);
    }
    expect(maintainer).toContain("issue #1");
  });

  /** Verifies that architecture guidance preserves the product boundary. */
  it("documents the architecture decisions at the product boundary", async () => {
    const architecture = await read("docs/architecture.md");
    for (const term of ["load_skill", "list_skills", "catalog-independent", "exact canonical name", "committed Generated Runtime", "GitHub-only", "loopback", "no runtime provenance service"]) {
      expect(architecture).toContain(term);
    }
  });

  /** Verifies that the tunnel guide matches the launcher lifecycle. */
  it("keeps the Secure MCP Tunnel guide aligned with the launcher lifecycle", async () => {
    const tunnel = await read("docs/SECURE_MCP_TUNNEL.md");
    expect(tunnel).toContain("chatgpt-chat-skills-mcp");
    expect(tunnel).toContain("chatgpt-chat-skills-mcp-2");
    expect(tunnel).not.toContain("chatgpt-chat-skills-mcp-3");
    expect(tunnel).not.toContain("CONTROL_PLANE_API_KEY_AGENT");
    expect(tunnel).toContain("stateless loopback service");
    expect(tunnel).toContain("mcp-skills");
    expect(tunnel).toContain("mcps status");
    expect(tunnel).not.toContain("tunnel-client runtimes create");
    expect(tunnel).not.toContain("tunnel-client runtimes connect");
  });

  /** Verifies that the completed release proof has one consistent success status. */
  it("keeps release proof status aligned with completed observations", async () => {
    const proof = await read("docs/release-proof.md");
    expect(proof).toContain("Status: PASS");
    expect(proof).not.toContain("Status: FAIL");
    expect(proof).toContain("exactly seven public skills");
    for (const skill of ["code-review", "grill-with-docs", "handoff", "implement", "improve-codebase-architecture", "to-spec", "to-tickets"]) {
      expect(proof).toContain(skill);
    }
    expect(proof).toContain("native GitHub relationship or label");
    expect(proof).toContain("required Live Capability");
    expect(proof).toContain("two genuinely independent child conversations");
    expect(proof).toContain("npm run corpus:check");
    expect(proof).toContain("evals/release/README.md");
    expect(proof).toContain("#12");
    expect(proof).not.toContain("exactly eight public skills");
    expect(proof).toContain("Overall status: `PASS`");
  });
});
