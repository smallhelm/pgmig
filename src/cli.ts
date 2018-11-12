import { PgMig } from "./";
import * as path from "path";
import * as fs from "fs";
import { Client } from "pg";
const Confirm = require("prompt-confirm");

const template = `module.exports = {
  up: async function up (client) {
  },
  down: async function down (client) {
  }
}
`;

interface CliCmd {
  desc: string;
  fn: (core: PgMig, args: string[]) => any;
}

const cmds: { [cmd: string]: CliCmd } = {
  sync: {
    desc: "migrate up until up-to-date",
    fn: async function(core) {
      const s = await core.status();
      if (s.notApplied.length === 0) {
        console.log("up-to-date");
        return;
      }
      await core.up(s.notApplied);
    }
  },
  up: {
    desc: "migrate 1 up",
    fn: async function(core) {
      const s = await core.status();
      if (s.notApplied.length === 0) {
        console.log("up-to-date");
        return;
      }
      await core.up([s.notApplied[0]]);
    }
  },
  down: {
    desc: "migrate 1 down",
    fn: async function(core) {
      const s = await core.status();
      const name = s.applied[s.applied.length - 1];
      if (!name) {
        console.log("nothing to down");
        return;
      }
      const cnf = new Confirm({
        message:
          "Do you really want to undo " +
          name +
          ", which may involve deleting data?",
        default: false
      });
      if (await cnf.run()) {
        await core.down([name]);
      }
    }
  },
  st: {
    desc: "status",
    fn: async function(core) {
      const s = await core.status();
      console.log("status  name");
      console.log("------  ----");
      s.available.forEach(function(name) {
        const done = s.applied.indexOf(name) >= 0;
        console.log(done ? "ok     " : "-      ", name);
      });
      if (s.notAvailable.length > 0) {
        throw new Error("MISSING FILEs: " + s.notAvailable.join(", "));
      }
    }
  },
  new: {
    desc: "make a new migration",
    fn: function(core, args) {
      const name = args
        .join(" ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, "_");

      const prefix = new Date()
        .toISOString()
        .replace(/:/g, "")
        .replace(/T/, "-")
        .substr(0, 17);
      const fname = prefix + "-" + name + ".js";
      const fpath = path.resolve(core.dir, fname);
      fs.writeFileSync(fpath, template, "utf8");
      console.log(path.relative(process.cwd(), fpath));
    }
  }
};

export = async function runCli(dir: string, client?: Client) {
  if (!client) {
    client = new Client();
  }
  try {
    const core = new PgMig({
      dir,
      client,
      logger: function(line) {
        console.log(line);
      }
    });
    const cliname = path.basename(process.argv[1]);
    const args = process.argv.slice(2);

    const cmdname = args[0];
    if (!cmds.hasOwnProperty(cmdname)) {
      console.log("usage: " + cliname + " [command]");
      console.log();
      Object.keys(cmds).forEach(function(cmdname) {
        console.log(cmdname + "\t" + cmds[cmdname].desc);
      });
      console.log();
      process.exit(1);
    }
    await client.connect();
    await core.setup();
    await cmds[cmdname].fn(core, args.slice(1));
    process.exit(0);
  } catch (err) {
    console.error();
    console.error(err.stack);
    console.error(JSON.stringify(err));
    console.error();
    process.exit(1);
  }
};
