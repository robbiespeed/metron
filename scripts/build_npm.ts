import { build, emptyDir, type BuildOptions } from "@deno/dnt";
import { parse } from "@std/jsonc";
import { assert } from "@std/assert";

const configFile = import.meta.resolve("../deno.jsonc");

const baseBuildOptions = {
  configFile,
  packageManager: "pnpm",
  shims: {
    deno: "dev",
  },
  scriptModule: false,
  compilerOptions: {
    target: "Latest",
  },
  filterDiagnostic(diagnostic) {
    return !(diagnostic.file?.fileName.endsWith("jsr.io/@std/internal/1.0.12/assertion_state.ts") === true);
  }
} satisfies Partial<BuildOptions>;

const baseRepository = {
  type: "git",
  url: "git+https://github.com/robbiespeed/metron.git",
};

const packages = ["core"];

const decoder = new TextDecoder("utf-8");

for (const name of packages) {
  const outDir = `./npm/${name}`;
  await emptyDir(outDir);

  const denoConfig = parse(decoder.decode(await Deno.readFile(`packages/${name}/deno.jsonc`)));

  assert(denoConfig !== null && typeof denoConfig === "object", "config must be an object");
  assert("version" in denoConfig, "config must contain version");

  const { version } = denoConfig;
  assert(typeof version === "string", "version must be a string");

  await build({
    ...baseBuildOptions,
    entryPoints: [
      `./packages/${name}/mod.ts`
    ],
    outDir,
    package: {
      name: `@metron/${name}`,
      version,
      repository: {
        ...baseRepository,
        directory: `packages/${name}`
      }
    },
  });

  await Deno.copyFile("LICENSE", `npm/${name}/LICENSE`);
  await Deno.copyFile(`packages/${name}/README.md`, `npm/${name}/README.md`);
}
