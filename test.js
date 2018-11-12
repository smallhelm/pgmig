const fs = require('fs')
const path = require('path')
const pg = require('pg')
const PgMig = require('./dist').PgMig
const test = require('ava')

test('PgMig', async function (t) {
  const dir = path.resolve(__dirname, 'test-migration')
  t.false(fs.existsSync(dir))

  const client = new pg.Client({ database: 'travis_ci_test' })
  await client.connect()
  await client.query('DROP TABLE IF EXISTS z_migration')
  await client.query('DROP TABLE IF EXISTS foo')
  await client.query('DROP TABLE IF EXISTS quux')
  await client.query('DROP TABLE IF EXISTS baz')

  let logs = []

  const core = new PgMig({
    dir,
    client,
    tablename: 'z_migration',
    logger: function (line) {
      logs.push(line)
    }
  })

  await core.setup()

  let st = await core.status()
  t.deepEqual(st, {
    available: [],
    applied: [],
    notApplied: [],
    notAvailable: []
  })

  fs.writeFileSync(path.resolve(dir, '000.js'), `
  module.exports = {
    async up(client) {
      await client.query('CREATE TABLE foo (bar TEXT)')
    },
    async down(client) {
      await client.query("DROP TABLE foo");
    }
  }
  `, 'utf8')
  fs.writeFileSync(path.resolve(dir, '001.js'), `
  module.exports = {
    async up(client) {
      await client.query('CREATE TABLE baz (qux TEXT)')
      await client.query('CREATE TABLE quux (quuz TEXT)')
    },
    async down(client) {
      await client.query("DROP TABLE quux");
      await client.query("DROP TABLE baz");
    }
  }
  `, 'utf8')

  st = await core.status()
  t.deepEqual(st, {
    available: ['000.js', '001.js'],
    applied: [],
    notApplied: ['000.js', '001.js'],
    notAvailable: []
  })

  await core.up(['000.js'])
  t.deepEqual(logs, [
    '[up] 000.js'
  ])
  logs = []

  st = await core.status()
  t.deepEqual(st, {
    available: ['000.js', '001.js'],
    applied: ['000.js'],
    notApplied: ['001.js'],
    notAvailable: []
  })

  await core.up(['001.js'])
  t.deepEqual(logs, [
    '[up] 001.js'
  ])
  logs = []

  st = await core.status()
  t.deepEqual(st, {
    available: ['000.js', '001.js'],
    applied: ['000.js', '001.js'],
    notApplied: [],
    notAvailable: []
  })

  await core.down(['001.js', '000.js'])
  t.deepEqual(logs, [
    '[down] 001.js',
    '[down] 000.js'
  ])
  logs = []

  st = await core.status()
  t.deepEqual(st, {
    available: ['000.js', '001.js'],
    applied: [],
    notApplied: ['000.js', '001.js'],
    notAvailable: []
  })

  await core.up(['000.js', '001.js'])
  t.deepEqual(logs, [
    '[up] 000.js',
    '[up] 001.js'
  ])
  logs = []

  fs.unlinkSync(path.resolve(dir, '001.js'))

  st = await core.status()
  t.deepEqual(st, {
    available: ['000.js'],
    applied: ['000.js', '001.js'],
    notApplied: [],
    notAvailable: ['001.js']
  })
})
