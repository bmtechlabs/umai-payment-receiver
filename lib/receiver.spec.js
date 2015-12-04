'use strict';

var inherits = require('util').inherits;

var should = require('should'),
    sinon = require('sinon'),
    supertest = require('supertest');

var PaymentReceiver = require('./receiver');

describe('PaymentReceiverAPI', function () {
  describe('constructor', function () {
    it('supports node.js-styled inheritance', function () {
      function TestReceiver () {
        PaymentReceiver.call(this);
      }

      inherits(TestReceiver, PaymentReceiver);
      TestReceiver.prototype.validate = sinon.stub();

      var instance = new TestReceiver();

      if (TestReceiver.prototype.validate.called) {
        throw new Error('expected `TestReceiver#validate` to have not been called yet');
      }

      instance.validate();

      if (!TestReceiver.prototype.validate.called) {
        throw new Error('expected `TestReceiver#validate` to have been called');
      }
    });

    it('allows singleton definition inheritance', function () {
      var validateStub = sinon.stub();

      var instance = new PaymentReceiver({
        validate: validateStub
      });

      if (validateStub.called) {
        throw new Error('expected `receiver#validate` to have not been called yet');
      }

      instance.validate();

      if (!validateStub.called) {
        throw new Error('expected `receiver#validate` to have been called');
      }
    });
  });

  describe('http server', function () {
    var agent,
        params,
        instance;

    var validateStub,
        processStub,
        getStub,
        cancelStub,
        listStub;

    // create receiver implementation
    beforeEach(function () {
      instance = new PaymentReceiver({
        validate: (validateStub = sinon.stub()),
        process:  (processStub  = sinon.stub()),
        get:      (getStub      = sinon.stub()),
        cancel:   (cancelStub   = sinon.stub()),
        list:     (listStub     = sinon.stub())
      });
    });

    // initialize superagent client
    beforeEach(function () {
      agent = supertest.agent(instance.server);
    });

    it('responds [404 "Not Found"] for unrecognized requests', function (done) {
      agent.post('/unrecognized-path').expect(404, done);
    });

    describe('GET "/api/about"', function () {
      function requestAbout() {
        return agent.get('/api/about');
      }

      it('responds the `version` field from the `package.json`', function (done) {
        requestAbout()
          .expect(200)
          .end(function (err, res) {
            if (err) {
              return done(err);
            }

            var packageJSON = require('../package.json');

            try {
              res.body.should.have.properties({
                version: packageJSON.version
              });
            }
            catch (e) {
              return done(e);
            }

            done();
          });
      });
    });

    describe('POST "/api/validate" (validate)', function () {
      // setup params to validate
      beforeEach(function () {
        params = {
          requisite: '996700650835',
          amount: 12.45
        };
      });

      function requestValidation() {
        return agent.post('/api/validate').send(params);
      }

      it('responds [400 "Bad Request"] if `requisite` is missing', function (done) {
        delete params.requisite;

        validateStub.yieldsAsync(new Error('expected `#validate` stub to have not been called'));

        requestValidation()
          .expect(400)
          .expect('missing parameter `requisite`', done);
      });

      it('calls `#validate` implementation', function (done) {
        validateStub.yieldsAsync(null, 200);

        requestValidation()
          .end(function (err) {
            if (err) {
              return done(err);
            }

            if (!validateStub.called) {
              return done(new Error('expected `#validate` stub to have been called'));
            }

            if (!validateStub.calledOnce) {
              return done(new Error('expected `#validate` stub to have been called once'));
            }

            var args = validateStub.firstCall.args;
            if (!args.length) {
              return done(new Error('expected `#validate` to have been called with arguments'));
            }

            try {
              args[0].should.have.properties(params);
            }
            catch (e) {
              return done(e);
            }

            done();
          });
      });

      describe('if `#validate` calls back with an error', function () {
        // stub validation error
        beforeEach(function () {
          validateStub.yieldsAsync(new Error('stubbed validation error'));
        });

        it('responds [500 "Internal Server Error"]', function (done) {
          requestValidation()
            .expect(500)
            .end(function (err, res) {
              if (err) {
                return done(err);
              }

              try {
                should.exist(res.text, 'expected response body to have an error message');
                res.text.should.eql('Error: stubbed validation error');
              }
              catch (e) {
                return done(e);
              }

              done();
            });
        });
      });

      describe('when `#validate` calls back with a status and message', function () {
        // stub successful validation
        beforeEach(function () {
          validateStub.yieldsAsync(null, 200, 'Stubbed Account Identity');
        });

        it('responds with that status and message', function (done) {
          requestValidation()
            .expect(200)
            .end(function (err, res) {
              if (err) {
                return done(err);
              }

              try {
                res.text.should.eql('Stubbed Account Identity');
              }
              catch (e) {
                return done(e);
              }

              done();
            });
        });
      });
    });

    describe('POST "/api/transactions/:id" (process)', function () {
      var transactionId;

      // setup transaction id
      beforeEach(function () {
        transactionId = '5648dc5077ba42ee6b13ff6f';
      });

      // setup transaction params
      beforeEach(function () {
        params = {
          requisite: '996700650835',
          amount: 12.45,
          timestamp: '2015-11-24T17:41:26.691Z'
        };
      });

      function requestProcessing() {
        return agent.post('/api/transactions/' + transactionId).send(params);
      }

      it('responds [400 "Bad Request"] if `amount` is missing', function (done) {
        delete params.amount;

        validateStub.yieldsAsync(new Error('expected `#validate` stub to have not been called'));

        requestProcessing()
          .expect(400)
          .expect('missing parameter `amount`', done);
      });

      it('responds [400 "Bad Request"] if `timestamp` is missing', function (done) {
        delete params.timestamp;

        validateStub.yieldsAsync(new Error('expected `#validate` stub to have not been called'));

        requestProcessing()
          .expect(400)
          .expect('missing parameter `timestamp`', done);
      });

      it('responds [422 "Unprocessable Entity"] if `timestamp` is not a valid ISO datetime',
        function (done) {
          params.timestamp = 'abc';

          validateStub.yieldsAsync(new Error(
            'expected `#validate` stub to have not been called'
          ));

          requestProcessing()
            .expect(422)
            .expect('parameter `timestamp` is not a valid ISO datetime', done);
        });

      it('calls `#validate` implementation', function (done) {
        validateStub.yieldsAsync(null, 200);
        processStub.yieldsAsync(null, 200);
        getStub.yieldsAsync(null, 200);

        requestProcessing()
          .end(function (err) {
            if (err) {
              return done(err);
            }

            if (!validateStub.called) {
              return done(new Error('expected `#validate` stub to have been called'));
            }

            if (!validateStub.calledOnce) {
              return done(new Error('expected `#validate` stub to have been called once'));
            }

            var args = validateStub.firstCall.args;
            if (!args.length) {
              return done(new Error('expected `#validate` to have been called with arguments'));
            }

            try {
              args[0].should.have.properties({
                requisite: params.requisite,
                amount: params.amount
              });

              args[0].should.have.property('timestamp')
                .with.instanceOf(Date)
                .and.eql(new Date('2015-11-24T17:41:26.691Z'));
            }
            catch (e) {
              return done(e);
            }

            done();
          });
      });

      describe('if `#validate` calls back with an error', function () {
        // stub validation error
        beforeEach(function () {
          validateStub.yieldsAsync(new Error('stubbed validation error'));
          processStub.throws(new Error('expected `#process` stub to have not been called'));
          getStub.throws(new Error('expected `#get` stub to have not been called'));
        });

        it('responds [500 "Internal Server Error"]', function (done) {
          requestProcessing()
            .expect(500)
            .end(function (err, res) {
              if (err) {
                return done(err);
              }

              try {
                should.exist(res.text, 'expected response body to have an error message');
                res.text.should.eql('Error: stubbed validation error');
              }
              catch (e) {
                return done(e);
              }

              done();
            });
        });
      });

      describe('if validation is not successful', function () {
        // ensure `#process` stub to not be called
        beforeEach(function () {
          processStub.throws(new Error('expected `#process` stub to have not been called'));
        });

        it('responds with a resulting status', function (done) {
          validateStub.yieldsAsync(null, 404);

          requestProcessing()
            .expect(404, done);
        });

        it('responds a message in the body if given', function (done) {
          validateStub.yieldsAsync(null, 403, 'stubbed validation message');

          requestProcessing()
            .end(function (err, res) {
              if (err) {
                return done(err);
              }

              try {
                should.exist(res.text, 'expected response body to have a message');
                res.text.should.eql('stubbed validation message');
              }
              catch (e) {
                return done(e);
              }

              done();
            });
        });
      });

      describe('when validation succeeds', function () {
        // stub validation success
        beforeEach(function () {
          validateStub.yieldsAsync(null, 200, 'Stubbed Account Identity');
        });

        it('calls `#process` implementation', function (done) {
          processStub.yieldsAsync(null, 200);
          getStub.yieldsAsync(null, 200);

          requestProcessing()
            .end(function (err) {
              if (err) {
                return done(err);
              }

              if (!processStub.called) {
                return done(new Error('expected `#process` stub to have been called'));
              }

              if (!processStub.calledOnce) {
                return done(new Error('expected `#process` stub to have been called once'));
              }

              var args = processStub.firstCall.args;
              if (!args.length) {
                return done(new Error('expected `#process` to have been called with arguments'));
              }

              try {
                args[0].should.have.properties({
                  requisite: params.requisite,
                  amount: params.amount
                });

                args[0].should.have.property('timestamp')
                  .with.instanceOf(Date)
                  .and.eql(new Date('2015-11-24T17:41:26.691Z'));
              }
              catch (e) {
                return done(e);
              }

              done();
            });
        });

        describe('if `#process` calls back with an error', function () {
          // stub processing error
          beforeEach(function () {
            processStub.yieldsAsync(new Error('stubbed processing error'));
          });

          it('responds [500 "Internal Server Error"]', function (done) {
            requestProcessing()
              .expect(500)
              .end(function (err, res) {
                if (err) {
                  return done(err);
                }

                try {
                  should.exist(res.text, 'expected response body to have an error message');
                  res.text.should.eql('Error: stubbed processing error');
                }
                catch (e) {
                  return done(e);
                }

                done();
              });
          });
        });

        describe('when `#process` calls back with status [200 "OK"]', function () {
          // stub successful processing
          beforeEach(function () {
            processStub.yieldsAsync(null, 200);
          });

          it('calls `#get` implementation', function (done) {
            getStub.yieldsAsync(null, 200);

            requestProcessing()
              .end(function (err) {
                if (err) {
                  return done(err);
                }

                if (!getStub.called) {
                  return done(new Error('expected `#get` stub to have been called'));
                }

                if (!getStub.calledOnce) {
                  return done(new Error('expected `#get` stub to have been called once'));
                }

                var args = getStub.firstCall.args;
                if (!args.length) {
                  return done(new Error('expected `#get` to have been called with arguments'));
                }

                try {
                  args[0].should.eql(transactionId);
                }
                catch (e) {
                  return done(e);
                }

                done();
              });
          });

          describe('if `#get` calls back with an error', function () {
            // stub getting error
            beforeEach(function () {
              getStub.yieldsAsync(new Error('stubbed getting error'));
            });

            it('responds [500 "Internal Server Error"]', function (done) {
              requestProcessing()
                .expect(500)
                .end(function (err, res) {
                  if (err) {
                    return done(err);
                  }

                  try {
                    should.exist(res.text, 'expected response body to have an error message');
                    res.text.should.eql('Error: stubbed getting error');
                  }
                  catch (e) {
                    return done(e);
                  }

                  done();
                });
            });
          });

          describe('when `#get` calls back with a status and object', function () {
            var transaction;

            // setup transaction object
            beforeEach(function () {
              transaction = {
                id: transactionId,
                requisite: '996700650835',
                amount: 12.45,
                status: 'processing',
                internal: { id: 10004 }
              };
            });

            it('responds with that status and object as a json', function (done) {
              getStub.yieldsAsync(null, 200, transaction);

              requestProcessing()
                .expect(200)
                .expect('Content-Type', /json/)
                .expect(transaction, done);
            });

            it('converts transaction timestamp to ISO string', function (done) {
              transaction.status = 'success';
              transaction.timestamp = new Date('2015-11-15T16:15:31.390Z');

              getStub.yieldsAsync(null, 200, transaction);

              requestProcessing()
                .expect(200)
                .expect('Content-Type', /json/)
                .expect({
                  id: transaction.id,
                  requisite: transaction.requisite,
                  amount: transaction.amount,
                  status: transaction.status,
                  timestamp: '2015-11-15T16:15:31.390Z',
                  internal: transaction.internal
                }, done);
            });
          });
        });

        describe('when `#process` calls back with status [202 "Accepted"]', function () {
          // stub accepted processing
          beforeEach(function () {
            processStub.yieldsAsync(null, 202);
          });

          it('responds [202 "Accepted"] immediately', function (done) {
            getStub.yieldsAsync(new Error('expected `#get` stub to have not been called'));
            requestProcessing().expect(202, done);
          });
        });
      });
    });

    describe('GET "/api/transactions/:id" (get)', function () {
      var transactionId;

      // setup transaction id
      beforeEach(function () {
        transactionId = '5648dc5077ba42ee6b13ff6f';
      });

      function requestTransaction() {
        return agent.get('/api/transactions/' + transactionId);
      }

      it('calls `#get` implementation', function (done) {
        getStub.yieldsAsync(null, 200);

        requestTransaction()
          .end(function (err) {
            if (err) {
              return done(err);
            }

            if (!getStub.called) {
              return done(new Error('expected `#get` stub to have been called'));
            }

            if (!getStub.calledOnce) {
              return done(new Error('expected `#get` stub to have been called once'));
            }

            var args = getStub.firstCall.args;
            if (!args.length) {
              return done(new Error('expected `#get` to have been called with arguments'));
            }

            try {
              args[0].should.eql(transactionId);
            }
            catch (e) {
              return done(e);
            }

            done();
          });
      });

      describe('if `#get` calls back with an error', function () {
        // stub getting error
        beforeEach(function () {
          getStub.yieldsAsync(new Error('stubbed getting error'));
        });

        it('responds [500 "Internal Server Error"]', function (done) {
          requestTransaction()
            .expect(500)
            .end(function (err, res) {
              if (err) {
                return done(err);
              }

              try {
                should.exist(res.text, 'expected response body to have an error message');
                res.text.should.eql('Error: stubbed getting error');
              }
              catch (e) {
                return done(e);
              }

              done();
            });
        });
      });

      describe('when `#get` calls back with a status and object', function () {
        it('responds with that status and object as a json', function (done) {
          var transaction = {
            id: transactionId,
            requisite: '996700650835',
            amount: 12.45,
            status: 'processing',
            internal: { id: 10004 }
          };

          getStub.yieldsAsync(null, 200, transaction);

          requestTransaction()
            .expect(200)
            .expect('Content-Type', /json/)
            .expect(transaction, done);
        });

        it('converts transaction timestamp to ISO string', function (done) {
          var transaction = {
            id: transactionId,
            requisite: '996700650835',
            amount: 12.45,
            status: 'success',
            timestamp: new Date('2015-11-15T16:15:31.390Z'),
            internal: { id: 10004 }
          };

          getStub.yieldsAsync(null, 200, transaction);

          requestTransaction()
            .expect(200)
            .expect('Content-Type', /json/)
            .expect({
              id: transaction.id,
              requisite: transaction.requisite,
              amount: transaction.amount,
              status: transaction.status,
              timestamp: '2015-11-15T16:15:31.390Z',
              internal: transaction.internal
            }, done);
        });
      });
    });

    describe('DELETE "/api/transactions/:id" (cancel)', function () {
      var transactionId;

      // setup transaction id
      beforeEach(function () {
        transactionId = '5648dc5077ba42ee6b13ff6f';
      });

      function requestCancellation() {
        return agent.delete('/api/transactions/' + transactionId);
      }

      it('calls `#cancel` implementation', function (done) {
        cancelStub.yieldsAsync(null, 200);
        getStub.yieldsAsync(null, 200);

        requestCancellation()
          .end(function (err) {
            if (err) {
              return done(err);
            }

            if (!cancelStub.called) {
              return done(new Error('expected `#cancel` stub to have been called'));
            }

            if (!cancelStub.calledOnce) {
              return done(new Error('expected `#cancel` stub to have been called once'));
            }

            var args = cancelStub.firstCall.args;
            if (!args.length) {
              return done(new Error('expected `#cancel` to have been called with arguments'));
            }

            try {
              args[0].should.eql(transactionId);
            }
            catch (e) {
              return done(e);
            }

            done();
          });
      });

      describe('if `#cancel` calls back with an error', function () {
        // stub cancellation error
        beforeEach(function () {
          cancelStub.yieldsAsync(new Error('stubbed cancellation error'));
        });

        it('responds [500 "Internal Server Error"]', function (done) {
          getStub.yieldsAsync(new Error('expected `#get` stub to have not been called'));

          requestCancellation()
            .expect(500)
            .end(function (err, res) {
              if (err) {
                return done(err);
              }

              try {
                should.exist(res.text, 'expected response body to have an error message');
                res.text.should.eql('Error: stubbed cancellation error');
              }
              catch (e) {
                return done(e);
              }

              done();
            });
        });
      });

      describe('when `#cancel` calls back with non success status and message',
        function () {
          // stub cancellation status & message
          beforeEach(function () {
            cancelStub.yieldsAsync(null, 405, 'Insufficient funds');
          });

          it('responds with that status and message', function (done) {
            getStub.yieldsAsync(new Error('expected `#get` stub to have not been called'));

            requestCancellation()
              .expect(405)
              .end(function (err, res) {
                if (err) {
                  return done(err);
                }

                try {
                  res.text.should.eql('Insufficient funds');
                }
                catch (e) {
                  return done(e);
                }

                done();
              });
          });
        });

      describe('when `#cancel` calls back with status [200 "OK"]', function () {
        // stub successful processing
        beforeEach(function () {
          cancelStub.yieldsAsync(null, 200);
        });

        it('calls `#get` implementation', function (done) {
          getStub.yieldsAsync(null, 200);

          requestCancellation()
            .end(function (err) {
              if (err) {
                return done(err);
              }

              if (!getStub.called) {
                return done(new Error('expected `#get` stub to have been called'));
              }

              if (!getStub.calledOnce) {
                return done(new Error('expected `#get` stub to have been called once'));
              }

              var args = getStub.firstCall.args;
              if (!args.length) {
                return done(new Error('expected `#get` to have been called with arguments'));
              }

              try {
                args[0].should.eql(transactionId);
              }
              catch (e) {
                return done(e);
              }

              done();
            });
        });

        describe('if `#get` calls back with an error', function () {
          // stub getting error
          beforeEach(function () {
            getStub.yieldsAsync(new Error('stubbed getting error'));
          });

          it('responds [500 "Internal Server Error"]', function (done) {
            requestCancellation()
              .expect(500)
              .end(function (err, res) {
                if (err) {
                  return done(err);
                }

                try {
                  should.exist(res.text, 'expected response body to have an error message');
                  res.text.should.eql('Error: stubbed getting error');
                }
                catch (e) {
                  return done(e);
                }

                done();
              });
          });
        });

        describe('when `#get` calls back with a status and object', function () {
          var transaction;

          // setup transaction object
          beforeEach(function () {
            transaction = {
              id: transactionId,
              requisite: '996700650835',
              amount: 12.45,
              status: 'cancelled',
              internal: { id: 10004 }
            };
          });

          it('responds with that status and object as a json', function (done) {
            getStub.yieldsAsync(null, 200, transaction);

            requestCancellation()
              .expect(200)
              .expect('Content-Type', /json/)
              .expect(transaction, done);
          });
        });
      });

      describe('when `#cancel` calls back with status [202 "Accepted"]', function () {
        // stub accepted cancellation
        beforeEach(function () {
          cancelStub.yieldsAsync(null, 202);
        });

        it('responds [202 "Accepted"] immediately', function (done) {
          getStub.yieldsAsync(new Error('expected `#get` stub to have not been called'));
          requestCancellation().expect(202, done);
        });
      });
    });

    describe('GET "/api/transactions" (list)', function () {
      var query;

      // setup default query
      beforeEach(function () {
        query = {
          begin: '2015-10-31T18:00:00.000Z',
          end:   '2015-11-30T18:00:00.000Z'
        };
      });

      function requestListing() {
        return agent.get('/api/transactions').query(query);
      }

      it('responds [400 "Bad Request"] if `begin` is missing', function (done) {
        delete query.begin;

        listStub.yieldsAsync(new Error('expected `#list` stub to have not been called'));

        requestListing()
          .expect(400)
          .expect('missing query parameter `begin`', done);
      });

      it('responds [422 "Unprocessable Entity"] if `begin` is not a valid ISO datetime',
        function (done) {
          query.begin = 'abc';

          listStub.yieldsAsync(new Error('expected `#list` stub to have not been called'));

          requestListing()
            .expect(422)
            .expect('query parameter `begin` is not a valid ISO datetime', done);
        });

      it('responds [422 "Unprocessable Entity"] if `end` is not a valid ISO datetime',
        function (done) {
          query.end = 'abc';

          listStub.yieldsAsync(new Error('expected `#list` stub to have not been called'));

          requestListing()
            .expect(422)
            .expect('query parameter `end` is not a valid ISO datetime', done);
        });

      it('calls `#list` implementation', function (done) {
        listStub.yieldsAsync(null, 200);

        requestListing()
          .end(function (err) {
            if (err) {
              return done(err);
            }

            if (!listStub.called) {
              return done(new Error('expected `#list` stub to have been called'));
            }

            if (!listStub.calledOnce) {
              return done(new Error('expected `#list` stub to have been called once'));
            }

            var args = listStub.firstCall.args;
            if (!args.length) {
              return done(new Error('expected `#list` to have been called with arguments'));
            }

            try {
              args[0].should.have.property('begin')
                .with.instanceOf(Date)
                .and.eql(new Date('2015-10-31T18:00:00.000Z'));

              args[0].should.have.property('end')
                .with.instanceOf(Date)
                .and.eql(new Date('2015-11-30T18:00:00.000Z'));
            }
            catch (e) {
              return done(e);
            }

            done();
          });
      });

      describe('if `#list` calls back with an error', function () {
        // stub listing error
        beforeEach(function () {
          listStub.yieldsAsync(new Error('stubbed listing error'));
        });

        it('responds [500 "Internal Server Error"]', function (done) {
          requestListing()
            .expect(500)
            .end(function (err, res) {
              if (err) {
                return done(err);
              }

              try {
                should.exist(res.text, 'expected response body to have an error message');
                res.text.should.eql('Error: stubbed listing error');
              }
              catch (e) {
                return done(e);
              }

              done();
            });
        });
      });

      describe('when `#list` calls back with a status and array', function () {
        // stub transaction listing
        beforeEach(function () {
          listStub.yieldsAsync(null, 200, [{
            id: '5648dc5077ba42ee6b13ff6f',
            requisite: '996700650835',
            amount: 12.45,
            status: 'success',
            timestamp: new Date('2015-11-15T16:15:31.390Z'),
            internal: { id: 10004 }
          }, {
            id: '564a4fe577ba42ee6b1407c8',
            requisite: '996700650835',
            amount: 37.8,
            status: 'failure',
            message: 'Stubbed Transaction Error',
            timestamp: new Date('2015-11-15T16:16:44.834Z'),
            internal: { id: 10005 }
          }, {
            id: '564a50cb77ba42ee6b1407ca',
            requisite: '996555362358',
            amount: 25.6,
            status: 'processing',
            internal: { id: 10006 }
          }]);
        });

        it('responds with that status and list as a json', function (done) {
          requestListing()
            .expect(200)
            .expect('Content-Type', /json/)
            .end(function (err, res) {
              if (err) {
                return done(err);
              }

              try {
                should.exist(res.body);
                res.body.should.have.lengthOf(3);
              }
              catch (e) {
                return done(e);
              }

              done();
            });
        });

        it('converts transaction timestamps to ISO strings', function (done) {
          requestListing()
            .expect(200)
            .expect('Content-Type', /json/)
            .end(function (err, res) {
              if (err) {
                return done(err);
              }

              try {
                should.exist(res.body);
                res.body.should.have.lengthOf(3);

                res.body[0]
                  .should.have.property('timestamp', '2015-11-15T16:15:31.390Z');

                res.body[1]
                  .should.have.property('timestamp', '2015-11-15T16:16:44.834Z');

                res.body[2]
                  .should.not.have.property('timestamp');
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
});
