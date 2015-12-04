'use strict';

var fs = require('fs');
var path = require('path');

exports.up = function (db, callback) {
  var filePath = path.join(__dirname + '/sqls/20151125225556-create-transactions.sql');
  fs.readFile(filePath, {encoding: 'utf-8'}, function (err, data) {
    if (err) {
      return callback(err);
    }

    db.runSql(data, callback);
  });
};

exports.down = function (db, callback) {
  var filePath = path.join(__dirname + '/sqls/20151125225556-drop-transactions.sql');
  fs.readFile(filePath, {encoding: 'utf-8'}, function (err, data) {
    if (err) {
      return callback(err);
    }

    db.runSql(data, callback);
  });
};
