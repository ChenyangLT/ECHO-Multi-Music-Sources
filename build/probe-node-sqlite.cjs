// Throwaway: does this Electron/Node expose node:sqlite with a better-sqlite3-like API?
const { app } = require('electron');

const run = async () => {
  let sqlite = null;
  try {
    sqlite = require('node:sqlite');
  } catch (error) {
    console.log('node:sqlite unavailable:', error.message);
    app.exit(1);
    return;
  }
  console.log('node:sqlite keys:', Object.keys(sqlite).join(','));
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER, flag INTEGER)');
  const insert = db.prepare('INSERT INTO t (id, n, flag) VALUES (?, ?, ?)');
  console.log('run result:', JSON.stringify(insert.run('a', 1, 1)));
  db.prepare('INSERT INTO t (id, n, flag) VALUES (?, ?, ?)').run('b', 2, 0);
  console.log('get:', JSON.stringify(db.prepare('SELECT * FROM t WHERE id = ?').get('a')));
  console.log('all:', JSON.stringify(db.prepare('SELECT * FROM t WHERE n >= ? ORDER BY n').all(1)));
  console.log('update:', JSON.stringify(db.prepare('UPDATE t SET flag = 0 WHERE id = ?').run('a')));
  console.log('has transaction:', typeof db.transaction, '| has name:', typeof db.name);
  try {
    db.exec('PRAGMA journal_mode = MEMORY');
    console.log('pragma via exec: ok');
  } catch (error) {
    console.log('pragma via exec failed:', error.message);
  }
  try {
    console.log('pragma via prepare:', JSON.stringify(db.prepare('PRAGMA table_info(t)').all()));
  } catch (error) {
    console.log('pragma via prepare failed:', error.message);
  }
  console.log('node:', process.versions.node, 'electron:', process.versions.electron);
  app.exit(0);
};

app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});
