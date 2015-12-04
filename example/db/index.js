'use strict';

var pg = require('pg');
var Transaction = require('pg-transaction');

var env = process.env.NODE_ENV || 'dev';
var configs = require('./database.json')[env];

function getConfig(name, defaultValue) {
  var config = configs[name];

  if (typeof config === 'object' && config.ENV) {
    config = process.env[config.ENV];
  }
  else if (typeof config === 'undefined') {
    config = defaultValue;
  }

  return config;
}

/**
 * Connect to the database.
 * @param {function(err:Error, client:Object, done:function)} callback
 */
exports.connect = function connect(callback) {
  var conString = 'postgres://' + getConfig('user');

  var password = getConfig('password');
  if (password) {
    conString += ':' + password;
  }

  conString += '@' + getConfig('host', 'localhost') + '/' + getConfig('database');

  pg.connect(conString, callback);
};

/**
 * Perform database transaction.
 * @param {function(err:Error, transaction:Object, done:function)} callback
 */
exports.transaction = function transaction(callback) {
  exports.connect(function (err, connection, done) {
    if (err) {
      return callback(err);
    }

    var tnx = new Transaction(connection);

    tnx.begin(function (err) {
      if (err) {
        done();
        return callback(err);
      }

      callback(null, tnx, done);
    });
  });
};
