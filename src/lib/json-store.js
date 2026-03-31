import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

async function ensureDirectory() {
  await fs.mkdir(config.dataDir, { recursive: true });
}

async function ensureFile(filePath, defaultValue) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

export class JsonStore {
  constructor(filename, defaultValue) {
    this.filePath = path.join(config.dataDir, filename);
    this.defaultValue = defaultValue;
  }

  async read() {
    await ensureDirectory();
    await ensureFile(this.filePath, this.defaultValue);
    const raw = await fs.readFile(this.filePath, "utf8");
    return JSON.parse(raw);
  }

  async write(value) {
    await ensureDirectory();
    await fs.writeFile(this.filePath, JSON.stringify(value, null, 2));
    return value;
  }

  async update(updater) {
    const current = await this.read();
    const next = await updater(current);
    return this.write(next);
  }
}
