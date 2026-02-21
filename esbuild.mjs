import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";

const isWatch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  minify: true,
};

async function main() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(buildOptions);
    console.log("Build complete.");
  }

  // Copy slash command templates to dist for bundling
  const commandsSrc = path.resolve("./commands");
  const commandsDest = path.resolve("dist/commands");
  if (fs.existsSync(commandsSrc)) {
    fs.cpSync(commandsSrc, commandsDest, { recursive: true });
    console.log("Copied command templates to dist/commands/");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
