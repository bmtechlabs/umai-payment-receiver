'use strict';

var async = require('async');
var db = require('./index');

var accounts = [
  ['996700650835', 'Dan Kerimdzhanov', 'active'],
  ['996555362358', 'Andy Romashin', 'suspended']
];

db.transaction(function (err, txn, complete) {
  if (err) {
    console.log(err);
    process.exit(1);
  }

  async.eachSeries(accounts, function (row, next) {
    txn.query(
      'INSERT INTO "accounts" ("requisite", "full_name", "status")\n' +
        'VALUES ($1, $2, $3::account_status)', row, next);
  }, function (err) {
    if (err) {
      txn.rollback();
      console.log(err);
    }
    else {
      txn.commit();
      console.log('Done!'); // >>>
    }

    complete();

    process.exit(err ? 1 : 0);
  });
});
