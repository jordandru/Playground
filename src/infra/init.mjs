import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATE_FILES = [
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  "infra.config.json"
];
const TEMPLATE_DIRECTORIES = [
  ".github",
  "scripts",
  "src",
  "test"
];
const REPORTS_PLACEHOLDER = "reports/infra/.gitkeep";

function ensureDirectory(directoryPath) {
  mkdirSync(directoryPath, { recursive: true });
}

function normalizePackageName(rawName) {
  const normalized = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "playground";
}

function toTitle(rawName) {
  return rawName
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Playground";
}

function countFiles(rootPath, relativePath) {
  const absolutePath = path.join(rootPath, relativePath);
  const stat = statSync(absolutePath);

  if (stat.isFile()) {
    return 1;
  }

  return readdirSync(absolutePath).reduce(
    (total, entry) => total + countFiles(rootPath, path.join(relativePath, entry)),
    0
  );
}

function directoryHasEntries(directoryPath) {
  return existsSync(directoryPath) && readdirSync(directoryPath).length > 0;
}

function customizePackageJson(packageJsonText, packageName) {
  const packageJson = JSON.parse(packageJsonText);
  packageJson.name = packageName;

  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

function customizeReadme(readmeText, title) {
  return readmeText.replace(/^# .+$/m, `# ${title}`);
}

function writeFileFromTemplate(sourceRoot, targetRoot, relativePath, transform) {
  const sourcePath = path.join(sourceRoot, relativePath);
  const targetPath = path.join(targetRoot, relativePath);
  const content = readFileSync(sourcePath, "utf8");
  const finalContent = transform ? transform(content) : content;

  ensureDirectory(path.dirname(targetPath));
  writeFileSync(targetPath, finalContent);
}

function writeTemplateDirectory(sourceRoot, targetRoot, relativePath) {
  const sourcePath = path.join(sourceRoot, relativePath);
  const targetPath = path.join(targetRoot, relativePath);

  cpSync(sourcePath, targetPath, {
    recursive: true,
    force: true
  });
}

function parseInitArgs(args) {
  const parsed = {
    target: null,
    name: null,
    force: false,
    json: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--force") {
      parsed.force = true;
      continue;
    }

    if (arg === "--name") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("Missing value for --name.");
      }

      parsed.name = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (parsed.target) {
      throw new Error("Only one target directory can be provided.");
    }

    parsed.target = arg;
  }

  if (!parsed.target) {
    throw new Error("Missing target directory. Usage: npm run infra:init -- <target-directory> [--name <package-name>] [--force]");
  }

  return parsed;
}

export function createInfrastructureScaffold({
  cwd = process.cwd(),
  targetDir,
  name,
  force = false
} = {}) {
  if (!targetDir) {
    throw new Error("A target directory is required.");
  }

  const sourceRoot = repoRoot;
  const resolvedTarget = path.resolve(cwd, targetDir);

  if (resolvedTarget === sourceRoot) {
    throw new Error("Refusing to scaffold into the current repository root.");
  }

  if (!existsSync(resolvedTarget)) {
    ensureDirectory(resolvedTarget);
  } else if (!force && directoryHasEntries(resolvedTarget)) {
    throw new Error(`Target directory is not empty: ${resolvedTarget}`);
  }

  const folderName = path.basename(resolvedTarget);
  const packageName = normalizePackageName(name ?? folderName);
  const readmeTitle = toTitle(folderName);

  for (const relativePath of TEMPLATE_FILES) {
    writeFileFromTemplate(sourceRoot, resolvedTarget, relativePath);
  }

  writeFileFromTemplate(
    sourceRoot,
    resolvedTarget,
    "package.json",
    (content) => customizePackageJson(content, packageName)
  );
  writeFileFromTemplate(
    sourceRoot,
    resolvedTarget,
    "README.md",
    (content) => customizeReadme(content, readmeTitle)
  );

  for (const relativePath of TEMPLATE_DIRECTORIES) {
    writeTemplateDirectory(sourceRoot, resolvedTarget, relativePath);
  }

  writeFileFromTemplate(sourceRoot, resolvedTarget, REPORTS_PLACEHOLDER);

  const filesWritten = [
    ...TEMPLATE_FILES,
    "package.json",
    "README.md",
    ...TEMPLATE_DIRECTORIES,
    REPORTS_PLACEHOLDER
  ].reduce((total, relativePath) => total + countFiles(resolvedTarget, relativePath), 0);

  return {
    targetDir: resolvedTarget,
    packageName,
    readmeTitle,
    filesWritten,
    nextSteps: [
      `cd ${resolvedTarget}`,
      "git init",
      "npm test",
      "npm run infra:check",
      "git add .",
      "git commit -m \"Initial infrastructure scaffold\""
    ]
  };
}

export function formatMarkdownInit(result) {
  return [
    "# Infrastructure Init",
    "",
    `Scaffolded: \`${result.targetDir}\``,
    `Package name: \`${result.packageName}\``,
    `README title: \`${result.readmeTitle}\``,
    `Files written: \`${result.filesWritten}\``,
    "",
    "## Next Steps",
    ...result.nextSteps.map((step) => `- ${step}`)
  ].join("\n");
}

export function runInfrastructureInit({
  cwd = process.cwd(),
  args = []
} = {}) {
  const parsed = parseInitArgs(args);
  const scaffold = createInfrastructureScaffold({
    cwd,
    targetDir: parsed.target,
    name: parsed.name,
    force: parsed.force
  });

  return {
    scaffold,
    output: parsed.json
      ? JSON.stringify(scaffold, null, 2)
      : formatMarkdownInit(scaffold),
    exitCode: 0
  };
}
