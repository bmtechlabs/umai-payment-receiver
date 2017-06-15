/**
 * UMAI Payment Receiver API.
 */

'use strict';

var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits;

var _ = require('lodash');

var express = require('express');
var bodyParser = require('body-parser');

var STATUS = require('./status-map');

/**
 * Send response status code and body if given.
 * @param {Object} res – express' response object
 * @param {number} status – response status
 * @param {(String|Object)} [body] – response body
 */
function respond(res, status, body) {
  if (!body) {
    return res.sendStatus(status);
  }

  res.status(status).send(body);
}

/**
 * UMAI Payment Receiver base class to extend.
 * @constructor
 * @param {Object.<string, function>} [implementation] – instance implementation methods
 */
function PaymentReceiver(implementation) {
  if (typeof this === 'undefined') {
    return new PaymentReceiver(implementation);
  }

  for (var key in implementation) {
    if (implementation.hasOwnProperty(key)) {
      this[key] = implementation[key];
    }
  }

  // initialize the express.js app
  var server = (this.server = express());

  // parse application/json request bodies
  server.use(bodyParser.json());

  server.get('/api/about', function (req, res) {
    res.json({ version: require('./../package.json').version });
  });

  var self = this;

  server.use('/', function (req, res, next) {
    var remoteAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    self.checkIp(remoteAddress, function(err, status) {
      if (err) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR)
          .send(err.toString());
      }

      if (status === STATUS.FORBIDDEN) {
        return res.status(STATUS.FORBIDDEN)
          .send('request denied for "' + remoteAddress + '", invalid IP');
      }

      next();
    })
  });

  // -- #validate -- //
  server.post('/api/validate', function (req, res) {
    var params = _.merge({}, req.body);

    if (!params.requisite) {
      return res.status(STATUS.BAD_REQUEST)
        .send('missing parameter `requisite`');
    }

    self.validate(req.body, function (err, status, body) {
      if (err) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR)
          .send(err.toString());
      }

      respond(res, status, body);
    });
  });

  // -- #process -- //
  server.post('/api/transactions/:id', function (req, res) {
    var params = _.merge({}, req.body, req.params);

    if (!params.amount) {
      return res.status(STATUS.BAD_REQUEST)
        .send('missing parameter `amount`');
    }

    if (!params.timestamp) {
      return res.status(STATUS.BAD_REQUEST)
        .send('missing parameter `timestamp`');
    }

    params.timestamp = new Date(params.timestamp);

    if (isNaN(params.timestamp.getTime())) {
      return res.status(STATUS.UNPROCESSABLE_ENTITY)
        .send('parameter `timestamp` is not a valid ISO datetime');
    }

    // Passing through the validation again, to give
    //   guaranteed params validity and values normalization.
    self.validate(params, function (err, status, body) {
      if (err) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR)
          .send(err.toString());
      }

      if (status !== STATUS.OK) { // validation failed
        return respond(res, status, body);
      }

      self.process(params, function (err, status, body) {
        if (err) {
          return res.status(STATUS.INTERNAL_SERVER_ERROR)
            .send(err.toString());
        }

        if (status === STATUS.OK) {
          self.get(params.id, function (err, status, body) {
            if (err) {
              return res.status(STATUS.INTERNAL_SERVER_ERROR)
                .send(err.toString());
            }

            respond(res, status, body);
          });
        }
        else {
          respond(res, status, body);
        }
      });
    });
  });

  // -- #get -- //
  server.get('/api/transactions/:id', function (req, res) {
    self.get(req.params.id, function (err, status, transaction) {
      if (err) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR)
          .send(err.toString());
      }

      res.status(status).send(transaction);
    });
  });

  // -- #cancel -- //
  server.delete('/api/transactions/:id', function (req, res) {
    var id = req.params.id;

    self.cancel(id, function (err, status, body) {
      if (err) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR)
          .send(err.toString());
      }

      if (status === STATUS.OK) {
        self.get(id, function (err, status, body) {
          if (err) {
            return res.status(STATUS.INTERNAL_SERVER_ERROR)
              .send(err.toString());
          }

          res.status(status).send(body);
        });
      }
      else {
        respond(res, status, body);
      }
    });
  });

  // -- #list -- //
  server.get('/api/transactions', function (req, res) {
    var query = _.merge({}, req.query);

    if (!query.begin) {
      return res.status(STATUS.BAD_REQUEST)
        .send('missing query parameter `begin`');
    }

    query.begin = new Date(query.begin);

    if (isNaN(query.begin.getTime())) {
      return res.status(STATUS.UNPROCESSABLE_ENTITY)
        .send('query parameter `begin` is not a valid ISO datetime');
    }

    if (query.end) {
      query.end = new Date(query.end);

      if (isNaN(query.end.getTime())) {
        return res.status(STATUS.UNPROCESSABLE_ENTITY)
          .send('query parameter `end` is not a valid ISO datetime');
      }
    }

    self.list(query, function (err, status, list) {
      if (err) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR)
          .send(err.toString());
      }

      res.status(status).send(list);
    });
  });
}

inherits(PaymentReceiver, EventEmitter);

/** @const {Object.<string, number>} */
PaymentReceiver.STATUS = STATUS;

/**
 * Validate payment requisites (identify account by a given requisite).
 * @abstract
 * @param {Object} params – parameters that are sent by UMAI's server
 * @param {string} params.requisite – user entered requisite (phone number/account id/email/etc.)
 * @param {string} [params.service] – service identifier (for processing or complex systems)
 * @param {function(err:Error, status:number?, message:string?)} callback
 */
PaymentReceiver.prototype.checkIp = function (remoteAddress, callback) {
  callback(null, STATUS.NOT_IMPLEMENTED);
};

/**
 * Validate payment requisites (identify account by a given requisite).
 * @abstract
 * @param {Object} params – parameters that are sent by UMAI's server
 * @param {string} params.requisite – user entered requisite (phone number/account id/email/etc.)
 * @param {string} [params.service] – service identifier (for processing or complex systems)
 * @param {function(err:Error, status:number?, message:string?)} callback
 */
PaymentReceiver.prototype.validate = function (params, callback) {
  callback(null, STATUS.NOT_IMPLEMENTED);
};

/**
 * Process the payment transaction.
 * @abstract
 * @param {Object} params – transaction parameters that are sent by UMAI's server
 * @param {string} params.id – transaction unique identifier
 * @param {string} params.requisite – user entered requisite (phone number/account id/email/etc.)
 * @param {number} params.amount – transaction amount,
 *                              the floating point number in the format of `0.00`
 * @param {Date} params.timestamp – transaction initialization datetime
 * @param {string} [params.service] – service identifier (for processing or complex systems)
 * @param {function(err:Error, status:number?, message:string?)} callback
 */
PaymentReceiver.prototype.process = function (params, callback) {
  callback(null, STATUS.NOT_IMPLEMENTED);
};

/**
 * Get transaction by a given id.
 * @abstract
 * @param {string} id – transaction unique identifier
 * @param {function(err:Error, status:number?, result:Object?)} callback
 */
PaymentReceiver.prototype.get = function (id, callback) {
  callback(null, STATUS.NOT_IMPLEMENTED);
};

/**
 * Cancel a previously processed payment transaction.
 * @abstract
 * @param {string} id – transaction unique identifier
 * @param {function(err:Error, status:number?)} callback
 */
PaymentReceiver.prototype.cancel = function (id, callback) {
  callback(null, STATUS.NOT_IMPLEMENTED);
};

/**
 * List transactions for a given datetime range.
 * @abstract
 * @param {Object} params – parameters that are sent by UMAI's server
 * @param {Date} params.begin – datetime to start search from
 * @param {Date} params.end – datetime to search till
 * @param {function(err:Error, status:number?, result:Object[]?)} callback
 */
PaymentReceiver.prototype.list = function (params, callback) {
  callback(null, STATUS.NOT_IMPLEMENTED);
};

/**
 * Delegate of `express.listen()`.
 */
PaymentReceiver.prototype.listen = function () {
  this.server.listen.apply(this.server, arguments);
};

module.exports = PaymentReceiver;
