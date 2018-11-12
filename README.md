# postgres-mig

[![Build Status](https://travis-ci.org/smallhelm/pgmig.svg)](https://travis-ci.org/smallhelm/pgmig)
[![TypeScript](https://img.shields.io/badge/types-TypeScript-blue.svg)](https://www.typescriptlang.org)

Simple PostgreSQL migrations for nodejs without an ORM.

```sh
npm i postgres-mig
```

## Example

```js
// NOTE: `client` is a `pg` client
module.exports = {
  /**
   * Run anything you need
   * to migrate the database `up`
   *
   * NOTE: this is wrapped in a transaction,
   * so the writes will either all succeed or all fail.
   */
  async up(client) {
    await client.query(`CREATE TYPE Greeting AS ENUM ('hi', 'hello')`);
    await client.query(`
      CREATE TABLE HelloWorld (
        kind Greeting,
        name TEXT
      )
    `);
  },
  /**
   * Run anything you need
   * to migrate the database `down` (i.e. undo the `up`)
   */
  async down(client) {
    await client.query("DROP TABLE HelloWorld");
    await client.query("DROP TYPE Greeting"); // NOTE: you'll want to drop in reverse order of your creates
  }
};
```

Migration scripts like this, live in your git repository in a folder called `migration`.

```
migration/2018-12-25-000000-add-christmas-table.js
```

It's important that the file names sort such that the older ones run before the newer ones. Hence why the convention of using ISO date timestamps to prefix the names. It also helps avoid name collisions with people you are working with.

`pgmig` keeps track of which migrations have been applied in a table called `migration`

## CLI

This npm package ships with an executable script. `pgmig`

```txt
usage: pgmig [command]

sync    migrate up until up-to-date
up      migrate 1 up
down    migrate 1 down
st      status
new     make a new migration
```

If you want to configure the directory or connection wrap this in your own script.

```js
#!/usr/bin/env node

// path to your migrations
var dir = __dirname + "/migration";

// connect to your db
var Client = require("pg").Client;
var client = new Client({..});

require("postgres-mig").runCli(dir, client);
```

## API

You can programmatically run migrations. Useful for testing.

```js
import { PgMig } from "postgres-mig";
// or
var PgMig = require("postgres-mig").PgMig;
```

Read the code, it's less than 100 lines. [src/PgMig.ts](https://github.com/smallhelm/pgmig/blob/master/src/PgMig.ts)

For example, an [ava](https://www.npmjs.com/package/ava) test script.

```js
test.before("reset db", async function(t) {
  var ROOTCLIENT = new pg.Client({
    database: "invpaint_test" // hardcode to be sure we never touch prod
    // ...
  });
  await ROOTCLIENT.connect();
  await ROOTCLIENT.query("DROP SCHEMA public CASCADE");
  await ROOTCLIENT.query("CREATE SCHEMA public AUTHORIZATION invpaint_test");
  await ROOTCLIENT.query("CREATE EXTENSION pgcrypto");
  await ROOTCLIENT.end();

  var client = await env.pool.connect();

  var pgmig = new PgMig({
    client: client,
    dir: path.resolve(__dirname, "../migration")
  });
  await pgmig.setup();

  // Test `down` migrations
  await pgmig.up((await pgmig.status()).notApplied);
  await pgmig.down((await pgmig.status()).applied.reverse());

  // Get the database set up so we can continue testing
  await pgmig.up((await pgmig.status()).notApplied);

  await client.release();

  t.true(true, "got setup");
});
```

## License

MIT
