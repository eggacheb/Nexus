import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  resolveRawSkillName,
  type SkillDefinition,
  type SkillSource,
  type ExternalSkillSourceConfig,
} from "@localbridge/protocol";
import type { SkillValidator } from "./skill-validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SkillLoaderOptions {
  builtinDir?: string;
  userDir?: string;
  projectDirs?: Array<{ projectId: string; rootPath: string }>;
}

export class SkillLoader {
  private readonly builtinDir: string;
  private readonly userDir: string;
  private readonly defaultProjectDirs: Array<{ projectId: string; rootPath: string }>;

  constructor(
    private readonly validator: SkillValidator,
    options: SkillLoaderOptions = {}
  ) {
    this.builtinDir =
      options.builtinDir ||
      this.resolveDefaultBuiltinDir();

    this.userDir =
      options.userDir ||
      this.resolveDefaultUserDir();

    this.defaultProjectDirs = options.projectDirs || [];
  }

  private resolveDefaultBuiltinDir(): string {
    if (process.env.NEXUS_SKILLS_DIR && fs.existsSync(process.env.NEXUS_SKILLS_DIR)) {
      return process.env.NEXUS_SKILLS_DIR;
    }

    const candidates = [
      path.resolve(__dirname, "../skills"),
      path.resolve(__dirname, "../../resources/skills"),
      path.resolve(__dirname, "../../../resources/skills"),
      path.resolve(process.cwd(), "resources/skills"),
      path.resolve(process.cwd(), "apps/desktop/src-tauri/resources/skills"),
      path.resolve(process.cwd(), "../resources/skills"),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(path.join(cand, "nexus.project-inspect", "skill.yaml"))) {
        return cand;
      }
    }

    return path.resolve(process.cwd(), "resources/skills");
  }

  private resolveDefaultUserDir(): string {
    if (process.platform === "win32" && process.env.LOCALAPPDATA) {
      return path.join(process.env.LOCALAPPDATA, "LocalBridge", "skills");
    }
    return path.join(os.homedir(), ".localbridge", "skills");
  }

  getBuiltinDir(): string {
    return this.builtinDir;
  }

  getUserDir(): string {
    return this.userDir;
  }

  private sanitizeToStringList(input: any): string[] {
    if (!input) return [];
    const list = Array.isArray(input) ? input : [input];
    const result: string[] = [];
    for (const item of list) {
      if (!item) continue;
      if (typeof item === "string") {
        result.push(item.trim());
      } else if (typeof item === "object") {
        for (const [k, v] of Object.entries(item)) {
          if (typeof v === "string") {
            result.push(`${k}: ${v.trim()}`);
          } else if (Array.isArray(v)) {
            for (const sub of v) {
              if (typeof sub === "object") {
                for (const [sk, sv] of Object.entries(sub as any)) {
                  result.push(`${sk}: ${sv}`);
                }
              } else if (sub) {
                result.push(String(sub));
              }
            }
          } else if (v) {
            result.push(`${k}: ${JSON.stringify(v)}`);
          } else {
            result.push(k);
          }
        }
      } else {
        result.push(String(item).trim());
      }
    }
    return result;
  }

  getExternalSourcesConfigPath(): string {
    return path.join(this.userDir, "external_sources.json");
  }

  getDiscoveredSources(): ExternalSkillSourceConfig[] {
    // Pure blank default: do not auto-scan or force host agents!
    // User explicitly mounts and manages whichever skill directory they want.
    return [];
  }

  loadExternalSourceConfigs(): ExternalSkillSourceConfig[] {
    const configPath = this.getExternalSourcesConfigPath();
    if (!fs.existsSync(configPath)) {
      return [];
    }

    try {
      const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (Array.isArray(data)) {
        // Guarantee isCustom is true on all external paths so the user can delete/unmount any of them
        return data.map((item: any) => ({
          ...item,
          isCustom: true,
        }));
      }
    } catch {}

    return [];
  }

  saveExternalSourceConfigs(sources: ExternalSkillSourceConfig[]): void {
    const configPath = this.getExternalSourcesConfigPath();
    try {
      const parentDir = path.dirname(configPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(sources, null, 2), "utf-8");
    } catch {}
  }

  loadAll(projectDirs: Array<{ projectId: string; rootPath: string }> = []): SkillDefinition[] {
    const skills: SkillDefinition[] = [];

    // 1. Built-in skills
    skills.push(...this.loadFromDirectory(this.builtinDir, "builtin"));

    // 2. User skills
    skills.push(...this.loadFromDirectory(this.userDir, "user"));

    // 3. Project skills
    const activeProjectDirs = projectDirs.length > 0 ? projectDirs : this.defaultProjectDirs;
    for (const proj of activeProjectDirs) {
      const projSkillDir = path.join(proj.rootPath, ".nexus", "skills");
      skills.push(...this.loadFromDirectory(projSkillDir, "project", proj.projectId));
    }

    // 4. External Linked Agent skills (Zero-Copy)
    const externalSources = this.loadExternalSourceConfigs();
    for (const extSource of externalSources) {
      if (!extSource.enabled || !fs.existsSync(extSource.path)) continue;
      skills.push(
        ...this.loadFromDirectory(
          extSource.path,
          "external",
          undefined,
          extSource.id,
          extSource.name
        )
      );
    }

    // Deduplicate skills by canonical normalized sourcePath
    const seenPaths = new Set<string>();
    const deduplicated: SkillDefinition[] = [];
    for (const s of skills) {
      const normPath = s.sourcePath ? path.resolve(s.sourcePath).toLowerCase() : s.id;
      if (!seenPaths.has(normPath)) {
        seenPaths.add(normPath);
        deduplicated.push(s);
      }
    }

    return deduplicated;
  }

  loadMarkdownFileAsSkill(
    filePath: string,
    source: SkillSource,
    projectId?: string,
    originAgent?: string,
    sourceCollectionName?: string
  ): SkillDefinition | null {
    if (!fs.existsSync(filePath)) return null;
    let stat: fs.Stats | null = null;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return null;
    }
    if (!stat || !stat.isFile()) return null;

    const fileName = path.basename(filePath);
    const baseSlug = fileName.replace(/\.(md|markdown|txt)$/i, "");

    // Ignore non-skill metadata files
    if (/^(license|licence|copying|changelog|\.gitignore)$/i.test(baseSlug)) {
      return null;
    }

    let rawContent = "";
    try {
      rawContent = fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }

    if (!rawContent.trim()) return null;

    // Parse Frontmatter
    let frontmatter: Record<string, any> | null = null;
    let mainMarkdown = rawContent;
    const fmMatch = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (fmMatch) {
      try {
        const parsed = YAML.parse(fmMatch[1]);
        if (parsed && typeof parsed === "object") {
          frontmatter = parsed;
          mainMarkdown = fmMatch[2].trim();
        }
      } catch {}
    }

    // Determine Title / Name
    let title = typeof frontmatter?.name === "string" ? frontmatter.name.trim() : "";
    if (!title && typeof frontmatter?.name === "object" && frontmatter?.name !== null) {
      title = String(frontmatter.name["zh-CN"] || frontmatter.name["en-US"] || frontmatter.name["name"] || Object.values(frontmatter.name)[0] || "").trim();
    }
    if (!title) {
      const headingMatch = mainMarkdown.match(/^#{1,2}\s+([^\r\n]+)/m);
      if (headingMatch && headingMatch[1].trim()) {
        const hText = headingMatch[1].trim();
        if (
          ["quick start", "快速入门", "クイックスタート", "readme", "english readme"].includes(
            hText.toLowerCase()
          ) &&
          sourceCollectionName
        ) {
          title = `${sourceCollectionName} - ${hText}`;
        } else {
          title = hText;
        }
      } else {
        title = baseSlug.replace(/[-_]+/g, " ").trim();
      }
    }

    // Determine Description
    let description = typeof frontmatter?.description === "string" ? frontmatter.description.trim() : "";
    if (!description && typeof frontmatter?.description === "object" && frontmatter?.description !== null) {
      description = String(frontmatter.description["zh-CN"] || frontmatter.description["en-US"] || Object.values(frontmatter.description)[0] || "").trim();
    }
    if (!description) {
      const lines = mainMarkdown.split(/\r?\n/).map((l) => l.trim());
      for (const line of lines) {
        if (
          !line ||
          line.startsWith("#") ||
          line.startsWith("---") ||
          line.startsWith(">") ||
          line.startsWith("<div") ||
          line.startsWith("- [")
        ) {
          continue;
        }
        description = line;
        break;
      }
      if (!description) {
        description = `Documentation and instructions for ${title}`;
      }
    }

    // Triggers
    const triggers: string[] = [];
    if (Array.isArray(frontmatter?.triggers)) {
      triggers.push(...frontmatter.triggers.map(String));
    } else if (typeof frontmatter?.triggers === "string") {
      triggers.push(frontmatter.triggers);
    }
    if (title && !triggers.includes(title)) triggers.push(title);
    const cleanSlug = baseSlug.replace(/[-_]+/g, " ");
    if (cleanSlug && !triggers.includes(cleanSlug)) triggers.push(cleanSlug);

    const headingMatches = mainMarkdown.slice(0, 5000).match(/^#{2,3}\s+([^\r\n]+)/gm);
    if (headingMatches) {
      for (const h of headingMatches.slice(0, 8)) {
        const cleanH = h.replace(/^#{2,3}\s+/, "").trim();
        if (cleanH.length > 2 && cleanH.length < 50 && !triggers.includes(cleanH)) {
          triggers.push(cleanH);
        }
      }
    }

    // Tools
    const tools: string[] = [];
    if (Array.isArray(frontmatter?.tools)) {
      tools.push(...frontmatter.tools.map(String));
    }

    // Workflow
    const workflow: string[] = [];
    if (Array.isArray(frontmatter?.workflow)) {
      workflow.push(...frontmatter.workflow.map(String));
    } else {
      const stepMatches = mainMarkdown.match(/^###?\s+(?:步骤|Step|\d+[\.、])\s*([^\r\n]+)/gm);
      if (stepMatches) {
        for (const st of stepMatches.slice(0, 8)) {
          workflow.push(st.replace(/^###?\s+/, "").trim());
        }
      }
    }

    const cleanIdPart = baseSlug
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/^-+|-+$/g, "");
    const safeOrigin = originAgent ? originAgent.replace(/[^a-z0-9_-]/gi, "-") : "doc";
    const skillId = `ext.${safeOrigin}.${cleanIdPart || "skill"}`;

    return {
      id: skillId,
      version: frontmatter?.version || "1.0.0",
      name: { "zh-CN": title, "en-US": title, "ja-JP": title, "de-DE": title },
      description: {
        "zh-CN": description,
        "en-US": description,
        "ja-JP": description,
        "de-DE": description,
      },
      category: typeof frontmatter?.category === "string" ? frontmatter.category : "general",
      risk: frontmatter?.risk || "low",
      triggers,
      tools,
      workflow,
      enabled: true,
      source,
      sourcePath: filePath,
      projectId,
      instructions: rawContent,
      validationStatus: "valid",
      type: "raw",
      primaryDocument: fileName,
      collectionName: sourceCollectionName,
      summary: description,
      keywords: triggers,
      originAgent,
      externalPath: source === "external" ? filePath : undefined,
      isReadOnly: true,
      isAvailable: true,
    };
  }

  loadFromDirectory(
    dirPath: string,
    source: SkillSource,
    projectId?: string,
    originAgent?: string,
    sourceCollectionName?: string
  ): SkillDefinition[] {
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    // 1. If dirPath is itself a single skill (has skill.yaml, skill.yml, or SKILL.md directly)
    const hasSelfYaml =
      fs.existsSync(path.join(dirPath, "skill.yaml")) ||
      fs.existsSync(path.join(dirPath, "skill.yml"));
    const hasSelfSkillMd = fs.existsSync(path.join(dirPath, "SKILL.md"));
    if (hasSelfYaml || hasSelfSkillMd) {
      const selfSkill = this.loadSkillFromPath(
        dirPath,
        source,
        projectId,
        originAgent,
        sourceCollectionName
      );
      if (selfSkill) return [selfSkill];
    }

    const skills: SkillDefinition[] = [];
    let entries: string[] = [];

    try {
      entries = fs.readdirSync(dirPath);
    } catch {
      return [];
    }

    // 2. Discover markdown files directly in dirPath
    const directMdFiles = entries.filter((e) => /\.(md|markdown)$/i.test(e));
    for (const mf of directMdFiles) {
      const docSkill = this.loadMarkdownFileAsSkill(
        path.join(dirPath, mf),
        source,
        projectId,
        originAgent,
        sourceCollectionName || path.basename(dirPath)
      );
      if (docSkill) {
        skills.push(docSkill);
      }
    }

    // 3. Process subdirectories
    for (const entry of entries) {
      const skillPath = path.join(dirPath, entry);
      if (
        ["node_modules", ".git", "dist", "build", "assets", "images", "img"].includes(
          entry.toLowerCase()
        )
      ) {
        continue;
      }

      try {
        // Check symlink state
        let isSymlink = false;
        try {
          const lstat = fs.lstatSync(skillPath);
          isSymlink = lstat.isSymbolicLink();
        } catch {}

        let stat: fs.Stats | null = null;
        let isBrokenSymlink = false;
        try {
          stat = fs.statSync(skillPath);
        } catch {
          if (isSymlink) isBrokenSymlink = true;
        }

        if (isBrokenSymlink) {
          skills.push({
            id: entry,
            version: "1.0.0",
            name: { "zh-CN": entry, "en-US": entry },
            description: {
              "zh-CN": "符号链接，目标路径未授权或不可访问，内容读取不到。",
              "en-US": "Symbolic link target is inaccessible or outside authorization.",
            },
            category: "general",
            risk: "medium",
            triggers: [],
            tools: [],
            workflow: [],
            enabled: false,
            source,
            sourcePath: skillPath,
            projectId,
            instructions: "",
            validationStatus: "invalid",
            validationErrors: ["Symbolic link target is inaccessible."],
            originAgent,
            externalPath: source === "external" ? skillPath : undefined,
            isReadOnly: true,
            isAvailable: false,
            readError: "Symbolic link target is inaccessible or missing.",
          });
          continue;
        }

        if (!stat || !stat.isDirectory()) {
          continue;
        }

        const subHasYaml =
          fs.existsSync(path.join(skillPath, "skill.yaml")) ||
          fs.existsSync(path.join(skillPath, "skill.yml"));
        const subHasSkillMd = fs.existsSync(path.join(skillPath, "SKILL.md"));

        if (subHasYaml || subHasSkillMd) {
          const skill = this.loadSkillFromPath(
            skillPath,
            source,
            projectId,
            originAgent,
            sourceCollectionName || entry
          );
          if (skill) {
            skills.push(skill);
          }
        } else {
          // Subfolder without skill.yaml/SKILL.md (e.g. `docs/`, `skills/`, `references/`)
          let subEntries: string[] = [];
          try {
            subEntries = fs.readdirSync(skillPath);
          } catch {}
          const subMds = subEntries.filter((f) => /\.(md|markdown)$/i.test(f));
          if (subMds.length > 0) {
            for (const sm of subMds) {
              const subSkill = this.loadMarkdownFileAsSkill(
                path.join(skillPath, sm),
                source,
                projectId,
                originAgent,
                sourceCollectionName ? `${sourceCollectionName}/${entry}` : entry
              );
              if (subSkill) skills.push(subSkill);
            }
          }
        }
      } catch (err: any) {
        skills.push({
          id: entry,
          version: "1.0.0",
          name: { "zh-CN": entry, "en-US": entry },
          description: { "zh-CN": "加载失败", "en-US": "Failed to load skill" },
          category: "general",
          risk: "medium",
          triggers: [],
          tools: [],
          workflow: [],
          enabled: false,
          source,
          sourcePath: skillPath,
          projectId,
          instructions: "",
          validationStatus: "invalid",
          validationErrors: [err?.message || String(err)],
          originAgent,
          externalPath: source === "external" ? skillPath : undefined,
          isReadOnly: true,
          isAvailable: false,
          readError: err?.message || String(err),
        });
      }
    }

    return skills;
  }

  loadSkillFromPath(
    skillDir: string,
    source: SkillSource,
    projectId?: string,
    originAgent?: string,
    sourceCollectionName?: string
  ): SkillDefinition | null {
    const yamlPath = path.join(skillDir, "skill.yaml");
    const ymlPath = path.join(skillDir, "skill.yml");
    const activeYamlPath = fs.existsSync(yamlPath)
      ? yamlPath
      : fs.existsSync(ymlPath)
      ? ymlPath
      : null;
    const mdPath = path.join(skillDir, "SKILL.md");

    const dirName = path.basename(skillDir);

    if (!activeYamlPath) {
      return this.loadRawSkillFromPath(
        skillDir,
        source,
        projectId,
        originAgent,
        sourceCollectionName
      );
    }

    let parsedYaml: any = null;
    let yamlErrors: string[] = [];
    let markdownContent = "";

    try {
      const rawYaml = fs.readFileSync(activeYamlPath, "utf-8");
      parsedYaml = YAML.parse(rawYaml);
    } catch (err: any) {
      yamlErrors.push(`Failed to parse skill.yaml: ${err?.message || String(err)}`);
    }

    if (fs.existsSync(mdPath)) {
      try {
        markdownContent = fs.readFileSync(mdPath, "utf-8");
      } catch (err: any) {
        yamlErrors.push(`Failed to read SKILL.md: ${err?.message || String(err)}`);
      }
    }

    const skillId = parsedYaml?.id || dirName;
    const validation = this.validator.validate(skillDir, parsedYaml, markdownContent, {
      isBuiltin: source === "builtin",
    });
    const combinedErrors = [...yamlErrors, ...validation.errors];
    const finalStatus =
      combinedErrors.length > 0
        ? "invalid"
        : (validation as any).warnings?.length > 0 || Boolean(validation.securityWarning)
        ? "warning"
        : "valid";

    return {
      id: skillId,
      version: parsedYaml?.version ?? "1.0.0",
      name:
        typeof parsedYaml?.name === "string"
          ? { "zh-CN": parsedYaml.name, "en-US": parsedYaml.name }
          : typeof parsedYaml?.name === "object" && parsedYaml?.name !== null
          ? {
              "zh-CN": String(parsedYaml.name["zh-CN"] || parsedYaml.name["en-US"] || Object.values(parsedYaml.name)[0] || dirName),
              "en-US": String(parsedYaml.name["en-US"] || parsedYaml.name["zh-CN"] || Object.values(parsedYaml.name)[0] || dirName),
            }
          : { "zh-CN": dirName, "en-US": dirName },
      description:
        typeof parsedYaml?.description === "string"
          ? { "zh-CN": parsedYaml.description, "en-US": parsedYaml.description }
          : typeof parsedYaml?.description === "object" && parsedYaml?.description !== null
          ? {
              "zh-CN": String(parsedYaml.description["zh-CN"] || parsedYaml.description["en-US"] || Object.values(parsedYaml.description)[0] || ""),
              "en-US": String(parsedYaml.description["en-US"] || parsedYaml.description["zh-CN"] || Object.values(parsedYaml.description)[0] || ""),
            }
          : { "zh-CN": "", "en-US": "" },
      category: typeof parsedYaml?.category === "string" ? parsedYaml.category : "general",
      risk: parsedYaml?.risk || "low",
      triggers: this.sanitizeToStringList(parsedYaml?.triggers),
      tools: this.sanitizeToStringList(parsedYaml?.tools),
      workflow: this.sanitizeToStringList(parsedYaml?.workflow),
      enabled: parsedYaml?.enabled ?? (finalStatus === "valid" || finalStatus === "warning"),
      source,
      sourcePath: skillDir,
      projectId,
      instructions: markdownContent,
      validationStatus: finalStatus,
      validationErrors: combinedErrors.length > 0 ? combinedErrors : undefined,
      securityWarning: validation.securityWarning,
      type: "nexus",
      primaryDocument: "SKILL.md",
      collectionId: parsedYaml?.collectionId,
      collectionName: sourceCollectionName || parsedYaml?.collectionName,
      summary:
        parsedYaml?.summary ||
        (typeof parsedYaml?.description === "string"
          ? parsedYaml.description
          : parsedYaml?.description?.["zh-CN"] || parsedYaml?.description?.["en-US"] || ""),
      keywords: parsedYaml?.keywords || (Array.isArray(parsedYaml?.triggers) ? parsedYaml.triggers : []),
      originAgent,
      externalPath: source === "external" ? skillDir : undefined,
      isReadOnly: source === "external" || source === "builtin",
      isAvailable: true,
    };
  }

  loadRawSkillFromPath(
    skillDir: string,
    source: SkillSource,
    projectId?: string,
    originAgent?: string,
    sourceCollectionName?: string
  ): SkillDefinition | null {
    const rawJsonPath = path.join(skillDir, "raw-skill.json");
    let rawMeta: any = null;
    if (fs.existsSync(rawJsonPath)) {
      try {
        rawMeta = JSON.parse(fs.readFileSync(rawJsonPath, "utf-8"));
      } catch {}
    }

    const dirName = path.basename(skillDir);
    const skillId =
      rawMeta?.id ||
      (source === "external"
        ? (dirName.startsWith("ext.") ? dirName : `ext.${originAgent || "linked"}.${dirName.replace(/^user\./, "")}`)
        : (dirName.startsWith("user.") ? dirName : `user.${dirName}`));

    // Discover documents in skillDir
    const docFiles: string[] = [];
    let primaryDoc = rawMeta?.primaryDocument;
    let markdownContent = "";
    let skillMdContent = "";
    let readmeContent = "";

    try {
      const scanDocs = (dir: string, relPrefix = "") => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            if (["references", "docs", "doc", "examples", "agents", "skills"].includes(entry.name.toLowerCase())) {
              scanDocs(path.join(dir, entry.name), relPath);
            }
          } else if (entry.isFile() && /\.(md|txt)$/i.test(entry.name)) {
            docFiles.push(relPath);
            if (entry.name.toLowerCase() === "skill.md") {
              try {
                skillMdContent = fs.readFileSync(path.join(dir, entry.name), "utf-8");
              } catch {}
            } else if (entry.name.toLowerCase() === "readme.md") {
              try {
                readmeContent = fs.readFileSync(path.join(dir, entry.name), "utf-8");
              } catch {}
            }
          }
        }
      };
      scanDocs(skillDir);
    } catch {}

    if (!primaryDoc) {
      if (docFiles.some((f) => f.toLowerCase() === "skill.md")) {
        primaryDoc = docFiles.find((f) => f.toLowerCase() === "skill.md")!;
      } else if (docFiles.some((f) => f.toLowerCase() === "readme.md")) {
        primaryDoc = docFiles.find((f) => f.toLowerCase() === "readme.md")!;
      } else if (docFiles.length > 0) {
        primaryDoc = docFiles[0];
      }
    }

    if (primaryDoc) {
      const fullDocPath = path.join(skillDir, primaryDoc);
      if (fs.existsSync(fullDocPath)) {
        try {
          markdownContent = fs.readFileSync(fullDocPath, "utf-8");
        } catch {}
      }
    }

    if (!primaryDoc && !markdownContent && docFiles.length === 0) {
      return null;
    }

    // Parse YAML Frontmatter
    let frontmatter: Record<string, any> | null = null;
    const textToCheck = markdownContent || skillMdContent;
    if (textToCheck) {
      const fmMatch = textToCheck.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (fmMatch) {
        try {
          const parsed = YAML.parse(fmMatch[1]);
          if (parsed && typeof parsed === "object") {
            frontmatter = parsed;
            if (markdownContent && fmMatch[2]) {
              markdownContent = fmMatch[2].trim();
            }
          }
        } catch {}
      }
    }

    // Determine Title / Name
    let skillName = typeof frontmatter?.name === "string" ? frontmatter.name : typeof rawMeta?.name === "string" ? rawMeta.name : "";
    if (!skillName && typeof frontmatter?.name === "object" && frontmatter?.name !== null) {
      skillName = String(frontmatter.name["zh-CN"] || frontmatter.name["en-US"] || Object.values(frontmatter.name)[0] || "");
    }
    if (!skillName && typeof rawMeta?.name === "object" && rawMeta?.name !== null) {
      skillName = String(rawMeta.name["zh-CN"] || rawMeta.name["en-US"] || Object.values(rawMeta.name)[0] || "");
    }
    if (!skillName) {
      const titleFromDoc = resolveRawSkillName({
        skillMdContent,
        readmeContent,
        folderName: dirName.replace(/^user\./, ""),
      });
      skillName = titleFromDoc || dirName;
    }

    // Determine Description
    let descriptionText =
      typeof frontmatter?.description === "string"
        ? frontmatter.description
        : typeof rawMeta?.description === "string"
        ? rawMeta.description
        : "";
    if (!descriptionText && typeof frontmatter?.description === "object" && frontmatter?.description !== null) {
      descriptionText = String(frontmatter.description["zh-CN"] || frontmatter.description["en-US"] || Object.values(frontmatter.description)[0] || "");
    }
    if (!descriptionText && typeof rawMeta?.description === "object" && rawMeta?.description !== null) {
      descriptionText = String(rawMeta.description["zh-CN"] || rawMeta.description["en-US"] || Object.values(rawMeta.description)[0] || "");
    }

    if (!descriptionText) {
      const contentForDesc = markdownContent || skillMdContent || readmeContent;
      const lines = contentForDesc.split(/\r?\n/).map((l) => l.trim());
      for (const line of lines) {
        if (!line || line.startsWith("#") || line.startsWith("---") || line.startsWith(">")) continue;
        descriptionText = line;
        break;
      }
      if (!descriptionText) {
        descriptionText = `Skill definition for ${skillName}`;
      }
    }

    // Extract Triggers
    let triggers: string[] = [];
    if (Array.isArray(frontmatter?.triggers)) {
      triggers = frontmatter.triggers;
    } else if (typeof frontmatter?.triggers === "string") {
      triggers = [frontmatter.triggers];
    } else if (Array.isArray(rawMeta?.triggers)) {
      triggers = rawMeta.triggers;
    } else {
      // Look for trigger keywords in markdown
      const fullText = markdownContent || skillMdContent;
      const trigMatch = fullText.match(/(?:触发词|Triggers?|Trigger keywords?)[：:]\s*([^\n]+)/i);
      if (trigMatch && trigMatch[1]) {
        triggers = trigMatch[1]
          .split(/[,，、/|]/)
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      }
    }

    // Auto-extract document names & headings into triggers & keywords (Crucial for external/raw folders like docs)
    const autoDocTriggers: string[] = [];
    if (dirName && !["src", "dist", "node_modules"].includes(dirName.toLowerCase())) {
      autoDocTriggers.push(dirName);
    }
    for (const docFile of docFiles) {
      const baseName = path.basename(docFile).replace(/\.(md|markdown|txt)$/i, "").trim();
      if (baseName && !["readme", "skill", "index", "doc", "docs"].includes(baseName.toLowerCase())) {
        autoDocTriggers.push(baseName);
      }
      try {
        const docAbs = path.join(skillDir, docFile);
        if (fs.existsSync(docAbs)) {
          const sample = fs.readFileSync(docAbs, "utf-8").slice(0, 4000);
          const headingMatches = sample.match(/^#{1,3}\s+([^\r\n]+)/gm);
          if (headingMatches) {
            for (const h of headingMatches) {
              const cleanH = h.replace(/^#{1,3}\s+/, "").trim();
              if (cleanH && cleanH.length >= 2 && cleanH.length <= 40) {
                autoDocTriggers.push(cleanH);
              }
            }
          }
        }
      } catch {}
    }
    triggers = Array.from(new Set([...triggers, ...autoDocTriggers]));

    // Extract Workflow
    let workflow: string[] = [];
    if (Array.isArray(frontmatter?.workflow)) {
      workflow = frontmatter.workflow;
    } else {
      const fullText = markdownContent || skillMdContent;
      const wfSection = fullText.match(/##\s*(?:工作流|Workflow|Steps|Execution Flow)[\s\S]*?(?=\n##|\n---|$)/i);
      if (wfSection) {
        const stepLines = wfSection[0].split(/\r?\n/).filter((l) => /^\s*\d+\./.test(l));
        workflow = stepLines.map((l) => l.replace(/^\s*\d+\.\s*/, "").trim());
      }
      if (workflow.length === 0) {
        workflow = [
          "查阅并解析技能文档中的指导原则与规范",
          "按文档要求调用 MCP 工具执行具体操作",
          "核对任务执行结果并反馈交付",
        ];
      }
    }

    // Extract Tools
    let tools: string[] = [];
    if (Array.isArray(frontmatter?.tools)) {
      tools = frontmatter.tools;
    } else if (Array.isArray(rawMeta?.tools)) {
      tools = rawMeta.tools;
    } else {
      // Scan for common tool names in markdown
      const fullText = markdownContent || skillMdContent;
      const commonTools = ["run_command", "file_read", "file_edit", "directory_list", "file_write", "lsp", "git"];
      tools = commonTools.filter((t) => fullText.includes(t));
    }

    // Determine Risk
    const riskLevel: "low" | "medium" | "high" =
      frontmatter?.risk === "high" || frontmatter?.risk === "medium" || frontmatter?.risk === "low"
        ? frontmatter.risk
        : tools.some((t) => t.includes("delete") || t.includes("write") || t.includes("command"))
        ? "medium"
        : "low";

    return {
      id: skillId,
      version: rawMeta?.version ?? "1.0.0",
      name: { "zh-CN": skillName, "en-US": skillName },
      description: { "zh-CN": descriptionText, "en-US": descriptionText },
      category: frontmatter?.category || rawMeta?.category || "general",
      risk: riskLevel,
      triggers: this.sanitizeToStringList(triggers),
      tools: this.sanitizeToStringList(tools),
      workflow: this.sanitizeToStringList(workflow),
      enabled: rawMeta?.enabled ?? true,
      source,
      sourcePath: skillDir,
      projectId,
      instructions: markdownContent || skillMdContent || readmeContent || "",
      validationStatus: "valid",
      type: "raw",
      primaryDocument: primaryDoc,
      availableDocuments: docFiles,
      summary: descriptionText,
      keywords: triggers,
      originAgent,
      externalPath: source === "external" ? skillDir : undefined,
      isReadOnly: true,
      isAvailable: true,
      collectionName: sourceCollectionName,
    };
  }
}
