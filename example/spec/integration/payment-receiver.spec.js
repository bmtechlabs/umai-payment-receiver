'use strict';

var async = require('async'),
    should = require('should'),
    sinon = require('sinon'),
    supertest = require('supertest'),
    http = require('http');

var db = require('../../db');
var receiver = require('../../server.js');

/**
 * Insert test accounts into the database.
 */
function dbSeed(callback) {
  var accounts = [
    ['996700650835', 'Dan Kerimdzhanov', 'active'],
    ['996555362358', 'Andy Romashin', 'suspended']
  ];

  db.transaction(function (err, txn, done) {
    if (err) {
      return callback(err);
    }

    async.eachSeries(accounts, function (row, next) {
      txn.query(
        'INSERT INTO "accounts" ("requisite", "full_name", "status")\n' +
          'VALUES ($1, $2, $3::account_status)', row, next);
    }, function (err) {
      if (err) {
        return txn.abort(function () {
          done();
          callback(err);
        });
      }

      txn.commit(function (err) {
        done();
        callback(err);
      });
    });
  });
}

/**
 * Cleanup the database.
 */
function dbClean(callback) {
  db.connect(function (err, client, done) {
    if (err) {
      return callback(err);
    }

    client.query('TRUNCATE "accounts" CASCADE;', function (err) {
      done();
      callback(err || null);
    });
  });
}

/**
 * Get account balance.
 * todo: you may want to replace this function with your own implementation.
 * @param {string} requisite – account requisite
 * @param {function(err:Error, balance:number?)} callback
 */
function getAccountBalance(requisite, callback) {
  db.connect(function (err, client, done) {
    if (err) {
      return callback(err);
    }

    client.query(
      'SELECT "balance" FROM "accounts" WHERE "requisite" = $1;', [requisite],
      function (err, result) {
        done(); // release the database connection

        if (err) {
          return callback(err);
        }

        if (result.rowCount === 0) {
          return callback(new Error('expected account #' + requisite + ' to exist'));
        }

        callback(null, parseFloat(result.rows[0].balance));
      });
  });
}

describe('PaymentReceiverModule Implementation', function () {
  var agent;

  beforeEach(dbClean);
  beforeEach(dbSeed);

  // initialize superagent client
  beforeEach(function () {
    agent = supertest.agent(receiver.server);
  });

  function requestValidation(params) {
    return agent.post('/api/validate').send(params);
  }

  function requestTransaction(id) {
    return agent.get('/api/transactions/' + id);
  }

  function requestProcessing(id, params) {
    return agent.post('/api/transactions/' + id).send(params);
  }

  function requestCancellation(id) {
    return agent.delete('/api/transactions/' + id);
  }

  function requestListing(query) {
    return agent.get('/api/transactions').query(query);
  }

  describe('POST "/api/validate" (#validate)', function () {
    var params;

    describe('when valid (existing account) requisite is given', function () {
      // setup valid requisite
      beforeEach(function () {
        params = {
          requisite: '996700650835'
        };
      });

      it('responds [200 "OK"] with account identity in the body', function (done) {
        requestValidation(params)
          .expect(200)
          .end(function (err, res) {
            if (err) {
              if (res.status === 500) {
                err.message += ' (' + res.text + ')';
              }
              return done(err);
            }

            try {
              should.exist(res.text, 'expected response to have a body');
              res.text.should.eql('Dan Kerimdzhanov');
            }
            catch (e) {
              return done(e);
            }

            done();
          });
      });
    });

    describe('when invalid requisite is given', function () {
      // setup invalid requisite
      beforeEach(function () {
        params = {
          requisite: '000000000000'
        };
      });

      it('responds [404 "Not Found"]', function (done) {
        requestValidation(params).expect(404, done);
      });
    });
  });

  describe('POST "/api/transactions/:id" (#process)', function () {
    it('creates the transaction that is accessible through the `#get`',
      function (done) {
        var transactionId = '5648dc5077ba42ee6b13ff6f';

        var params = {
          requisite: '996700650835',
          amount: 45.95,
          timestamp: '2015-11-24T17:41:26.691Z'
        };

        var timerStart = new Date();

     /* Your module can respond [202 "Accepted"]
        and transaction with status `initialized` or `processing`.
        In such case UMAI system will re-request the transaction through
        the `GET "/api/transactions/:id"` again and again until it will
        be completed with one of the completion status (success/failure/cancelled).
        If you want to implement such behaviour, you may want to change the http
        expectations defined below and emit transaction processing completion
        before getting the transaction with the second request. */
        requestProcessing(transactionId, params)
          .end(function (err, res) {
            if (err) {
              return done(err);
            }

            if (!(res.status === 200 || res.status === 202)) {
              var message = 'expected 200 "OK" or 202 "Accepted", ' +
                'got ' + res.status + ' "' + http.STATUS_CODES[res.status] + '"';

              if (res.text) {
                message += '\n >>> ' + res.text;
              }

              return done(new Error(message));
            }

            if (res.status === 200) {
              try {
                res.headers
                  .should.have.property('content-type', 'application/json; charset=utf-8');
              }
              catch (e) {
                return done(e);
              }
            }

            requestTransaction(transactionId)
              .expect('content-type', 'application/json; charset=utf-8')
              .end(function (err, res) {
                if (err) {
                  if (res.status === 500) {
                    err.message += ' (' + res.text + ')';
                  }
                  return done(err);
                }

                var timerStop = new Date();

                try {
                  should.exist(res.body, 'expected response to have a body');

                  res.body.should.have.properties({
                    id: transactionId,
                    requisite: params.requisite,
                    amount: 45.95,
                    status: 'success'
                  });

                  res.body.should.have.property('timestamp');

                  // ensure that transaction timestamp is between start and stop
                  var timestamp = new Date(res.body.timestamp);
                  if (!(timerStart < timestamp && timerStop > timestamp)) {
                    return done(new Error(
                      'expected transaction timestamp to be ' +
                        'between "' + timerStart.toISOString() + '" ' +
                        'and "' + timerStop.toISOString() + '", ' +
                      'got "' + res.body.timestamp + '"'
                    ));
                  }
                }
                catch (e) {
                  return done(e);
                }

                done();
              });
          });
      });

    it('increases account balance by a given amount of credits', function (done) {
      var transactions = [{
        id: '5648dc5077ba42ee6b13ff6f',
        amount: 246.91
      }, {
        id: '564a50cb77ba42ee6b1407ca',
        amount: 370.37
      }, {
        id: '564a4ff477ba42ee6b1407c9',
        amount: 617.28
      }];

      async.each(transactions, function (transaction, next) {
        requestProcessing(transaction.id, {
          requisite: '996700650835',
          amount: transaction.amount,
          timestamp: (new Date()).toISOString()
        })
          .end(function (err, res) {
            if (err) {
              return next(err);
            }

            if (!(res.status === 200 || res.status === 202)) {
              var message = 'expected 200 "OK" or 202 "Accepted", ' +
                'got ' + res.status + ' "' + http.STATUS_CODES[res.status] + '"';

              if (res.text) {
                message += '\n >>> ' + res.text;
              }

              return next(new Error(message));
            }

            if (res.status === 200) {
              try {
                res.headers
                  .should.have.property('content-type', 'application/json; charset=utf-8');
              }
              catch (e) {
                return next(e);
              }
            }

            next();
          });
      }, function (err) { // -- transactions processing completed -- //
        if (err) {
          return done(err);
        }

        getAccountBalance('996700650835', function (err, balance) {
          if (err) {
            return done(err);
          }

          try {
            balance.should.eql(1234.56, 'expected account balance to equal 1234.56');
          }
          catch (e) {
            return done(e);
          }

          done();
        });
      });
    });

    it("doesn't process a transaction with the same id again", function (done) {
      // ...also make sure that the resulting response is always OK

      var transactionId = '5648dc5077ba42ee6b13ff6f';
      var params = {
        requisite: '996700650835',
        amount: 45.95,
        timestamp: '2015-11-24T17:41:26.691Z'
      };

      var timerStart = new Date();

      async.times(3, function (n, next) {
        requestProcessing(transactionId, params)
          .end(function (err, res) {
            if (err) {
              return next(err);
            }

            if (!(res.status === 200 || res.status === 202)) {
              var message = 'expected 200 "OK" or 202 "Accepted", ' +
                'got ' + res.status + ' "' + http.STATUS_CODES[res.status] + '"';

              if (res.text) {
                message += '\n >>> ' + res.text;
              }

              return next(new Error(message));
            }

            if (res.status === 200) {
              try {
                res.headers
                  .should.have.property('content-type', 'application/json; charset=utf-8');
              }
              catch (e) {
                return next(e);
              }
            }

            next();
          });
      }, function (err) { // -- transactions processing complete -- //
        if (err) {
          return done(err);
        }

        requestListing({ begin: timerStart.toISOString() })
          .expect(200)
          .expect('content-type', 'application/json; charset=utf-8')
          .end(function (err, res) {
            if (err) {
              if (res.status === 500) {
                err.message += ' (' + res.text + ')';
              }
              return done(err);
            }

            try {
              should.exist(res.body, 'expected response to have a body');

              res.body
                .should.be.an.instanceOf(Array)
                .with.lengthOf(1);

              res.body[0]
                .should.have.properties({
                  id: transactionId,
                  requisite: params.requisite,
                  amount: params.amount,
                  status: 'success'
                });

              res.body[0]
                .should.have.property('timestamp');
            }
            catch (e) {
              return done(e);
            }

            getAccountBalance(params.requisite, function (err, balance) {
              if (err) {
                return done(err);
              }

              try {
                balance.should.eql(45.95, 'expected account balance to increased once');
              }
              catch (e) {
                return done(e);
              }

              done();
            });
          });
      });
    });
  });

  describe('GET "/api/transactions/:id" (#get)', function () {
    var transactionId;

    // setup transaction id
    beforeEach(function () {
      transactionId = '5648dc5077ba42ee6b13ff6f';
    });

    // process the transaction
    beforeEach(function (done) {
      requestProcessing(transactionId, {
        requisite: '996700650835',
        amount: 45.95,
        timestamp: '2015-11-24T17:41:26.691Z'
      })
        .end(function (err, res) {
          if (err) {
            if (res.status === 500) {
              err.message += ' (' + res.text + ')';
            }
            return done(err);
          }

          done();
        });
    });

    it('responds [200 "OK"] and the transaction info as a json', function (done) {
      requestTransaction(transactionId)
        .expect(200)
        .expect('content-type', 'application/json; charset=utf-8')
        .end(function (err, res) {
          if (err) {
            if (res.status === 500) {
              err.message += ' (' + res.text + ')';
            }
            return done(err);
          }

          try {
            should.exist(res.body, 'expected response to have a body');
            res.body.should.have.properties({
              id: transactionId,
              requisite: '996700650835',
              amount: 45.95,
              status: 'success'
            });

            res.body.should.have.property('timestamp');
          }
          catch (e) {
            return done(e);
          }

          done();
        });
    });
  });

  describe('DELETE "/api/transactions/:id" (#cancel)', function () {
    var transactionId;

    // setup transaction id
    beforeEach(function () {
      transactionId = '5648dc5077ba42ee6b13ff6f';
    });

    // process the transaction
    beforeEach(function (done) {
      requestProcessing(transactionId, {
        requisite: '996700650835',
        amount: 45.95,
        timestamp: '2015-11-24T17:41:26.691Z'
      })
        .end(function (err, res) {
          if (err) {
            if (res.status === 500) {
              err.message += ' (' + res.text + ')';
            }
            return done(err);
          }

          done();
        });
    });

    it('changes the transaction status to "cancelled"', function (done) {
   /* Like a `#process`, the `#cancel` method can also respond [202 "Accepted"],
      immediately setting the transaction status to "processing".
      In such case UMAI system will re-request the transaction through
      the `GET "/api/transactions/:id"` request again and again until it will
      be completed with one of the completion status (cancelled/failure). */
      requestCancellation(transactionId)
        .end(function (err, res) {
          if (err) {
            return done(err);
          }

          if (!(res.status === 200 || res.status === 202)) {
            var message = 'expected 200 "OK" or 202 "Accepted", ' +
              'got ' + res.status + ' "' + http.STATUS_CODES[res.status] + '"';

            if (res.text) {
              message += '\n >>> ' + res.text;
            }

            return done(new Error(message));
          }

          requestTransaction(transactionId)
            .expect(200)
            .expect('content-type', 'application/json; charset=utf-8')
            .end(function (err, res) {
              if (err) {
                if (res.status === 500) {
                  err.message += ' (' + res.text + ')';
                }
                return done(err);
              }

              try {
                should.exist(res.body, 'expected response to have a body');

                res.body.should.have.properties({
                  id: transactionId,
                  requisite: '996700650835',
                  amount: 45.95,
                  status: 'cancelled'
                });
              }
              catch (e) {
                return done(e);
              }

              done();
            });
        });
    });
  });

  describe('GET "/api/transactions" (#list)', function () {
    var transactions;

    // process some transactions
    beforeEach(function (done) {
      transactions = [];

      async.eachSeries([{
        id: '5648dc5077ba42ee6b13ff6f',
        amount: 246.91
      }, {
        id: '564a50cb77ba42ee6b1407ca',
        amount: 370.37
      }, {
        id: '564a4ff477ba42ee6b1407c9',
        amount: 617.28
      }], function (transaction, next) {
        requestProcessing(transaction.id, {
          requisite: '996700650835',
          amount: transaction.amount,
          timestamp: (new Date()).toISOString()
        })
          .end(function (err, res) {
            if (err) {
              return next(err);
            }

            if (!(res.status === 200 || res.status === 202)) {
              var message = 'expected 200 "OK" or 202 "Accepted", ' +
                'got ' + res.status + ' "' + http.STATUS_CODES[res.status] + '"';

              if (res.text) {
                message += '\n >>> ' + res.text;
              }

              return next(new Error(message));
            }

            if (res.status === 200) {
              transactions.push(res.body);
              return next();
            }

            requestTransaction(res.body.id)
              .expect(200)
              .expect('content-type', 'application/json; charset=utf-8')
              .end(function (err, res) {
                if (err) {
                  if (res.status === 500) {
                    err.message += ' (' + res.text + ')';
                  }
                  return next(err);
                }

                transactions.push(res.body);

                next();
              });
          });
      }, done);
    });

    describe('when both `begin` and `end` are given', function () {
      it('responds the list of transactions for a given datetime range',
        function (done) {
          async.times(3, function (n, next) {
            requestListing({
              begin: transactions[0].timestamp,
              end: transactions[n].timestamp
            })
              .expect(200)
              .expect('content-type', 'application/json; charset=utf-8')
              .end(function (err, res) {
                if (err) {
                  if (res.status === 500) {
                    err.message += ' (' + res.text + ')';
                  }
                  return next(err);
                }

                try {
                  res.body
                    .should.be.an.instanceOf(Array)
                    .with.lengthOf(n);
                }
                catch (e) {
                  return next(e);
                }

                next();
              });
          }, done);
        });
    });

    describe('when only `begin` is given', function () {
      it('responds the list of transactions from `begin` to latest',
        function (done) {
          async.times(3, function (n, next) {
            requestListing({
              begin: transactions[n].timestamp
            })
              .expect(200)
              .expect('content-type', 'application/json; charset=utf-8')
              .end(function (err, res) {
                if (err) {
                  if (res.status === 500) {
                    err.message += ' (' + res.text + ')';
                  }
                  return next(err);
                }

                try {
                  res.body
                    .should.be.an.instanceOf(Array)
                    .with.lengthOf(3 - n);
                }
                catch (e) {
                  return next(e);
                }

                next();
              });
          }, done);
        });
    });
  });
});
