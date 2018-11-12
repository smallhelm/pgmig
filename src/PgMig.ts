import * as path from "path";
import * as fs from "fs";
import { ClientBase } from "pg";

export interface PgMigConf {
  client: ClientBase;
  dir: string;
  tablename?: string;
  logger?: (line: string) => any;
}

export class PgMig {
  private client: ClientBase;
  readonly dir: string;
  private tablename = "migration";
  private logger = (line: string) => null;

  constructor(conf: PgMigConf) {
    this.client = conf.client;
    this.dir = conf.dir;
    if (conf.tablename) {
      this.tablename = conf.tablename;
    }
    if (conf.logger) {
      this.logger = conf.logger;
    }
  }

  async setup() {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir);
    }

    await this.client.query(`
    CREATE TABLE IF NOT EXISTS ${this.tablename} (
      name    TEXT NOT NULL,
      PRIMARY KEY (name)
    )`);
  }

  async status() {
    const available = fs.readdirSync(this.dir).sort();
    const appliedR = await this.client.query(
      "SELECT name FROM " + this.tablename + " ORDER BY name ASC"
    );
    const applied = appliedR.rows
      .map((row: { name: string }) => row.name)
      .sort();
    return {
      available,
      applied,
      notApplied: available.filter(name => applied.indexOf(name) < 0),
      notAvailable: applied.filter(name => available.indexOf(name) < 0)
    };
  }

  up(names: string[]) {
    return this.execute(true, names);
  }

  down(names: string[]) {
    return this.execute(false, names);
  }

  private async execute(isUp: boolean, names: string[]) {
    const fnName = isUp ? "up" : "down";
    for (const name of names) {
      this.logger(`[${fnName}] ${name}`);
      const mod = require(path.resolve(this.dir, name));
      try {
        await this.client.query("BEGIN");
        await mod[fnName](this.client);
        const sql = isUp
          ? "INSERT INTO " + this.tablename + " (name) VALUES ($1)"
          : "DELETE FROM " + this.tablename + " WHERE name = $1";
        await this.client.query(sql, [name]);
      } catch (err) {
        await this.client.query("ROLLBACK");
        throw err;
      }
      await this.client.query("COMMIT");
    }
  }
}
