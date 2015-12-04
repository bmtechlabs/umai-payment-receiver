'use strict';

var PaymentReceiver = require('../index');
var STATUS = PaymentReceiver.STATUS; // payment receiver status dictionary

var db = require('./db');

/**
 * Check whether a given `err` is an "external id duplication" constraint.
 * @param {Error} err
 */
function isDuplicateIdConstraint(err) {
  return parseInt(err.code) === 23505 && err.constraint === 'transactions_external_id_idx';
}

/**
 * Transaction representation object.
 * @constructor
 * @param {Object} row – transaction database entry
 */
function Transaction(row) {
  this.id = row['external_id']; // transaction id that is sent by UMAI
  this.requisite = row.requisite;
  this.amount = parseFloat(row.amount);
  this.status = row.status;

  if (row.message) { // assign message if present
    this.message = row.message;
  }

  if (row.completed) { // if transaction is completed (success/failure)
    // issue a completion datetime as a transaction timestamp
    this.timestamp = row.completed;
  }

  // define any internal information if needed
  this.internal = { id: parseInt(row.id) };

  if (row.cancelled) {
    this.internal.cancelled = row.cancelled;
  }
}

var receiver = new PaymentReceiver({
  /**
   * Validate payment requisites (identify account by a given requisite).
   * @param {Object} params – parameters that are sent by UMAI's server
   * @param {string} params.requisite – user entered requisite (phone number/account id/email/etc.)
   * @param {string} [params.service] – service identifier (for processing or complex systems)
   * @param {function(err:Error, status:number?, message:string?)} callback
   */
  validate: function (params, callback) {
    db.connect(function (err, client, done) {
      if (err) {
        return callback(err); // responds [500 "Internal Server Error"], the error will be logged
      }

      client.query(
        'SELECT "full_name", "status"\n' +
          'FROM "accounts" WHERE "requisite"=$1;',
        [params.requisite],
        function (err, result) {
          done(); // release the database connection

          if (err) {
            return callback(err); // responds [500 "Internal Server Error"]
          }

          var account = result.rows[0];

          if (!account) { // if account doesn't exist
            return callback(null, STATUS.NOT_FOUND,
              "account doesn't exist"); // responds [404 "Not Found"]
          }

          if (account.status !== 'active') {
            // responds [403 "Forbidden"] describing the reason
            return callback(null, STATUS.FORBIDDEN, 'Please activate your account');
          }

          // if validation successful, responds [200 "OK"] with account identity
          callback(null, STATUS.OK, account['full_name']);
        });
    });
  },

  /**
   * Process the payment transaction.
   * @param {Object} params – transaction parameters
   * @param {string} params.id – transaction unique identifier
   * @param {string} params.requisite – user entered requisite (phone number/account id/email/etc.)
   * @param {number} params.amount – transaction amount,
   *                              the floating point number in the format of `0.00`
   * @param {Date} params.timestamp – transaction initialization datetime
   * @param {string} [params.service] – service identifier (for processing or complex systems)
   * @param {function(err:Error, status:number?, message:string?)} callback
   */
  process: function (params, callback) {
    // Transaction params are already passed through the `#validate`, so we can consider that:
    //  * params are valid,
    //  * account existing and "active",
    //  * and all values are normalized.
    db.transaction(function (err, txn, done) {
      if (err) {
        return callback(err);
      }

      txn.query(
        'SELECT "id", "balance"\n' +
        '  FROM "accounts" WHERE "requisite" = $1\n' +
        'FOR UPDATE;', // lock the account balance
          [params.requisite],
        function (err, result) {
          if (err) {
            done(); // release the database connection
            return callback(err); // responds [500 "Internal Server Error"]
          }

          var account = result.rows[0];

          // insert the transaction record marking it "successfully completed" immediately
          txn.query(
            'INSERT INTO "transactions"\n' +
            '  ("external_id", "account_id", "requisite", "amount", "status", "completed")\n' +
            'VALUES ($1, $2, $3, $4::numeric(8,2), \'success\', NOW());',
              [params.id, account.id, params.requisite, params.amount],
            function (err) {
              if (err) {
                return txn.abort(function () { // unlock the account balance
                  done(); // release the database connection

                  if (isDuplicateIdConstraint(err)) {
                    return callback(null, STATUS.OK); // responds [200 "OK"] as already processed
                  }
                  else {
                    return callback(err); // responds [500 "Internal Server Error"]
                  }
                });
              }

              // update the account balance
              txn.query(
                'UPDATE "accounts"\n' +
                '  SET "balance" = ("balance" + $1::numeric(8,2))\n' +
                'WHERE "id" = $2;',
                  [params.amount, account.id],
                function (err) {
                  if (err) {
                    return txn.abort(function () { // unlock the account balance
                      done(); // release the database connection
                      callback(err); // responds [500 "Internal Server Error"]
                    });
                  }

                  // commit the transaction
                  txn.commit(function (err) {
                    done(); // release the database connection

                    if (err) {
                      return callback(err);
                    }

                    // if transaction needs some time to be processed,
                    // yield with `STATUS.ACCEPTED` that causes UMAI system to request
                    // the transaction status after a certain period of time.
                    //callback(null, STATUS.ACCEPTED); // responds [202 "Accepted"]

                    // if transaction completes immediately, yield with `STATUS.OK`
                    // that will cause request to pass through the `#get` method
                    // to respond transaction information immediately.
                    callback(null, STATUS.OK); // responds [200 "OK"] and transaction info
                });
              });
            });
        });
    });
  },

  /**
   * Get transaction by id.
   * @param {string} id – transaction unique identifier
   * @param {function(err:Error, status:number?, result:Object?)} callback
   */
  get: function (id, callback) {
    db.connect(function (err, client, done) {
      if (err) {
        return callback(err);
      }

      client.query(
        'SELECT * FROM "transactions"\n' +
        '  WHERE "external_id" = $1;', [id],
        function (err, result) {
          done(); // release the database connection

          if (err) {
            return callback(err); // responds [500 "Internal Server Error"]
          }

          if (!result.rowCount) { // if transaction doesn't exist
            return callback(null, STATUS.NOT_FOUND,
              'transaction doesn\'t exist'); // responds [404 "Not Found"]
          }

          callback(null, STATUS.OK, new Transaction(result.rows[0]));
        });
    });
  },

  /**
   * Cancel a previously processed payment transaction.
   * @param {string} id – transaction unique identifier
   * @param {function(err:Error, status:number?)} callback
   */
  cancel: function (id, callback) {
    db.transaction(function (err, txn, done) {
      if (err) {
        return done(err);
      }

      txn.query(
        'SELECT "account_id", "amount", "status"\n' +
        '  FROM "transactions" WHERE "external_id" = $1\n' +
        'FOR UPDATE;', [id], // lock transaction
        function (err, result) {
          if (err) {
            return txn.abort(function () { // rollback the transaction
              done(); // release the database connection
              callback(err); // responds [500 "Internal Server Error"]
            });
          }

          if (!result.rowCount) {
            return txn.abort(function () { // rollback the transaction
              done(); // release the database connection
              callback(null, STATUS.NOT_FOUND); // responds [404 "Not Found"]
            });
          }

          var transaction = result.rows[0];

          if (transaction.status === 'cancelled') {
            return txn.abort(function () { // release the transaction
              done(); // release the database connection
              callback(null, STATUS.OK); // responds [200 "OK"] as already cancelled
            });
          }

          // update the account balance
          txn.query(
            'UPDATE "accounts"\n' +
            '  SET "balance" = ("balance" - $1::numeric(8,2))\n' +
            'WHERE "id" = $2;',
              [transaction.amount, transaction['account_id']],
            function (err) {
              if (err) {
                return txn.abort(function () { // release the transaction
                  done(); // release the database connection
                  callback(err); // responds [500 "Internal Server Error"]
                });
              }

              txn.query(
                'UPDATE "transactions"\n' +
                '  SET "status" = \'cancelled\'::transaction_status\n' +
                'WHERE "external_id" = $1;', [id],
                function (err) {
                  if (err) {
                    return txn.abort(function () { // release the transaction
                      done(); // release the database connection
                      callback(err); // responds [500 "Internal Server Error"]
                    });
                  }
                });

              // commit the transaction
              txn.commit(function (err) {
                done(); // release the database connection

                if (err) {
                  return callback(err);
                }

                // if transaction needs some time to be cancelled,
                // yield with `STATUS.ACCEPTED` that causes UMAI system to request
                // the transaction status after a certain period of time.
                //callback(null, STATUS.ACCEPTED); // responds [202 "Accepted"]

                // if transaction cancellation completes immediately, yield with `STATUS.OK`
                // that will cause request to pass through the `#get` method
                // to respond transaction information immediately.
                callback(null, STATUS.OK); // responds [200 "OK"] and transaction info
              });
            });
        });
    });
  },

  /**
   * Query transactions for a specific datetime range.
   * @param {Object} query – parameters that are sent by UMAI's server
   * @param {Date} query.begin – datetime to start search from
   * @param {Date} [query.end] – datetime to search till
   * @param {function(err:Error, status:number?, result:Object[]?)} callback
   */
  list: function (query, callback) {
    db.connect(function (err, client, done) {
      if (err) {
        return callback(err); // responds [500 "Internal Server Error"]
      }

      client.query(
        'SELECT * FROM "transactions"\n' +
        '  WHERE "completed" ' + (query.end ? 'BETWEEN $1 AND $2' : '>= $1') + ';',
          (query.end ? [query.begin, query.end] : [query.begin]),
        function (err, result) {
          done(); // release the database connection

          if (err) {
            return callback(err); // responds [500 "Internal Server Error"]
          }

          // responds [200 "OK"] and the resulting transactions list
          callback(null, STATUS.OK, result.rows.map(function (row) {
            return new Transaction(row);
          }));
        });
    });
  }
});

if (process.env.NODE_ENV !== 'test') {
  // It's usually a good practice to specify the IP address of
  //   a network interface for listening to (like VPN interface).
  receiver.listen(3000, '127.0.0.1', function () {
    var address = receiver.server.address();

    var host = address.address,
        port = address.port;

    console.log('UMAI payments receiver started and listening on %s:%s', host, port);
  });
}

module.exports = receiver; // expose receiver for testing purposes
