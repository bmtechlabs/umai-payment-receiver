# UMAI Payment Receiver API

[![Build Status](https://travis-ci.org/bmtechlabs/umai-payment-receiver.svg?branch=master)](https://travis-ci.org/bmtechlabs/umai-payment-receiver)

Provides the basic behaviour of the [UMAI RESTful API Specification](https://github.com/bmtechlabs/umai-payment-receiver/wiki/RESTful-API-Specification) for Node.js.

You can use this library to easily implement your own module that can receive payment transactions from the [&laquo;UMAI&raquo; Payment System](https://www.umai.kg/).

## Install

```sh
$ npm install umai-payment-receiver --save
```


## Usage

```js
#!/usr/bin/env node

var PaymentReceiver = require('umai-payment-receiver');
var STATUS = PaymentReceiver.STATUS; // payment receiver status dictionary

var receiver = PaymentReceiver({
  /**
   * Validate payment requisites (identify account by a given requisite).
   * @param {Object} params – parameters that are sent by UMAI's server
   * @param {string} params.requisite – user entered requisite (phone number/account id/email/etc.)
   * @param {number} [params.amount] – transaction amount, the floating point number in the format of `0.00`
   * @param {function(err:Error, status:number?, message:string?)} callback
   */
  validate: function (params, callback) {
    // todo: implement account identification
  },

  /**
   * Process the payment transaction.
   * @param {Object} params – transaction parameters
   * @param {string} params.id – transaction unique identifier
   * @param {string} params.requisite – user entered requisite (phone number/account id/email/etc.)
   * @param {number} params.amount – transaction amount, the floating point number in the format of `0.00`
   * @param {Date} params.timestamp – transaction initialization datetime (not required)
   * @param {function(err:Error, status:number?, message:string?)} callback
   */
  process: function (params, callback) {
    // todo: implement transaction processing
  },

  /**
   * Get transaction by id.
   * @param {string} id – transaction unique identifier
   * @param {function(err:Error, status:number?, result:Object?)} callback
   */
  get: function (id, callback) {
    // todo: implement getting transaction by id
  },

  /**
   * Cancel a previously processed payment transaction.
   * @param {string} id – transaction unique identifier
   * @param {function(err:Error, status:number?)} callback
   */
  cancel: function (id, callback) {
    // todo: implement cancellation process
  },

  /**
   * List transactions for a given datetime range.
   * @param {Object} query – parameters that are sent by UMAI's server
   * @param {Date} query.begin – datetime to start search from
   * @param {Date} query.end – datetime to search till
   * @param {function(err:Error, status:number?, result:Object[]?)} callback
   */
  list: function (query, callback) {
    // todo: implement transaction listing
  }
});

var VPN_INTERFACE_IP = process.env.VPN_INTERFACE_IP || '127.0.0.1';
var PAYMENT_RECEIVER_PORT = process.env.PAYMENT_RECEIVER_PORT || 3000;

receiver.listen(3000, VPN_INTERFACE_IP, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('UMAI payment receiver started and listening on %s:%s', host, port);
});
```


## API

To implement the basic behaviour of the payment receiver module,
you'll need to extend the `PaymentReceiverAPI` implementing the following methods:


### #validate(params, callback)

Validate payment requisites (identify account by a given requisite).

#### params

##### params.requisite

Type: `string`

User entered payment requisite (phone number/account id/email/etc.). 

##### params.amount (optional)

Type: `number`

User entered transaction amount, the floating point number in the format of `0.00`.

#### callback

Type: `function(err, status, message)`

The callback function which you need to call asynchronously providing the status code and message if needed.


### #process(params, callback)

Process the transaction with a given params.

> If transaction processing in your implementation needs more time to be processed,
you can call back with `STATUS.ACCEPTED` (that will causes API to respond [202 "Accepted"])
setting the transaction status to `initialized` or `processing`.
In such case UMAI's server will re-request the transaction through
the `GET "/api/transactions/:id"` again and again until it will
be completed with one of the completion status (success/failure/cancelled).

#### params

##### params.id

Type: `string`

Transaction unique identifier.

> Make sure that you didn't process transactions with the same id twice!

##### params.requisite

Type: `string`

User entered payment requisite (phone number/account id/email/etc.). 

##### params.amount (optional)

Type: `number`

User entered transaction amount, the floating point number in the format of `0.00`.

##### params.timestamp

Type: `Date`

UMAI server-side transaction initialization timestamp.
This field have only informational purpose, so you are not required to use it in your module.

#### callback

Type: `function(err, status)`

The callback function which you need to call asynchronously providing the status code.


### #get(id, callback)

Get transaction by a given id.

#### id

Type: `string`

Transaction unique identifier that is sent by the UMAI Payment System. 

#### callback

Type: `function(err, status, transaction)`

The callback function which you need to call asynchronously providing the status code and transaction object.


### #cancel(id, callback)

Cancel a previously processed payment transaction.

> If transaction cancellation process in your implementation
needs more time to be processed, you can call back with `STATUS.ACCEPTED`
(that will causes API to respond [202 "Accepted"])
setting the transaction status to `processing`.
As with the `#process` method, UMAI's server will re-request the transaction
through the `GET "/api/transactions/:id"` again and again until it will
be completed with one of the cancellation status (cancelled/failure).

#### id

Type: `string`

Transaction unique identifier.

> Make sure that you didn't cancel the same transaction twice!

#### callback

Type: `function(err, status)`

The callback function which you need to call asynchronously providing the status code.


### #list(query, callback)

List transactions for a given datetime range.

#### query

##### query.begin

Type: `Date`

Datetime to start search from.

##### query.end

Type: `Date`

Datetime to search till.
May be omitted, which meant that transactions should be queried till latest.

#### callback

Type: `function(err, status, list)`

The callback function which you need to call asynchronously providing the status code and resulting transactions list.


## Example project

You can use the `/example` project from this repo as a template project to implement your own payment receiver module.
It also contains the basic integration specs which you can run to ensure that your module meets the basic requirements of the [RESTful-API-Specification](https://github.com/bmtechlabs/umai-payment-receiver/wiki/RESTful-API-Specification).
