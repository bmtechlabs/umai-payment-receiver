# UMAI Payment Receiver API for Node.js

[![Build Status](https://travis-ci.org/bmtechlabs/umai-payment-receiver.svg?branch=master)](https://travis-ci.org/bmtechlabs/umai-payment-receiver)

Provides the basic behaviour of a module that can receive guaranteed payment transaction notifications as specified by the [UMAI RESTful API Specification](https://github.com/bmtechlabs/umai-payment-receiver/wiki/RESTful-API-Specification).

You can use this library to implement your own [&laquo;UMAI&raquo; Payment System](https://www.umai.kg/) integration module on Node.js.

This library supports Node.js versions beginning from `v0.10` till latest stable (including io.js versions).
Please refer [TravisCI builds](https://travis-ci.org/bmtechlabs/umai-payment-receiver) for more details.


## Install

```sh
$ npm install umai-payment-receiver --save
```


## API

To implement your payment receiver module, inherit the `PaymentReceiver` class defining the following methods:


### `.validate(params, callback)`

Validate payment requisites (identify account by a given requisite).

#### `params`

##### `params.requisite`

Type: `string`

User entered payment requisite (phone number/account id/email/etc.). 

##### `params.amount` (optional)

Type: `number`

User entered transaction amount, the floating point number in the format of `0.00`.

#### `callback`

Type: `function (err, status, message)`

The callback function which you need to call asynchronously providing the status code and message if needed.


### `.process(params, callback)`

Process the transaction with a given params.

> If transaction processing in your implementation needs more time to be processed,
you can call back with `STATUS.ACCEPTED` (that will causes API to respond `[202 "Accepted"]`)
setting the transaction status to `initialized` or `processing`.
In such case UMAI's server will re-request the transaction through
the `GET "/api/transactions/:id"` again and again until it will
be completed with one of the completion status (`success|failure|cancelled`).

#### `params`

##### `params.id`

Type: `string`

Transaction unique identifier.

> Make sure that your module doesn't allow to process transactions with the same id twice!

##### `params.requisite`

Type: `string`

User entered payment requisite (phone number/account id/email/etc.). 

##### `params.amount` (optional)

Type: `number`

User entered transaction amount, the floating point number in the format of `0.00`.

##### `params.timestamp`

Type: `Date`

UMAI server-side transaction initialization timestamp.
This field have only informational purpose, so you are not required to use it in your module.

#### `callback`

Type: `function (err, status)`

The callback function which you need to call asynchronously providing the status code.


### `.get(id, callback)`

Get transaction by id.

#### `id`

Type: `string`

Transaction unique identifier that is sent by the UMAI Payment System. 

#### `callback`

Type: `function (err, status, transaction)`

The callback function which you need to call asynchronously providing the status code and resulting transaction object.


### `.cancel(id, callback)`

Cancel a previously processed payment transaction.

> If transaction cancellation process in your implementation
needs more time to be processed, you can call back with `STATUS.ACCEPTED`
(that will causes API to respond `[202 "Accepted"]`)
setting the transaction status to `processing`.
As with the `#process` method, UMAI's server will re-request the transaction
through the `GET "/api/transactions/:id"` again and again until it will
be completed with one of the cancellation status (`cancelled|failure`).

#### `id`

Type: `string`

Transaction unique identifier.

> Make sure that your module doesn't allow to cancel the same transaction twice!

#### `callback`

Type: `function (err, status)`

The callback function which you need to call asynchronously providing the status code.


### `.list(query, callback)`

List transactions for a given datetime range.

#### `query`

##### `query.begin`

Type: `Date`

Datetime to start search from.

##### `query.end`

Type: `Date`

Datetime to search till.
May be omitted, which meant that transactions should be queried till latest.

#### `callback`

Type: `function (err, status, list)`

The callback function which you need to call asynchronously providing the status code and resulting transactions list.


## Example

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


## Quick start

You can use the [/example](https://github.com/bmtechlabs/umai-payment-receiver/tree/master/example) project from this repo as a template project to implement your own payment receiver module.
It also contains the basic integration specs which you can run to ensure that your module meets the basic requirements of the [RESTful-API-Specification](https://github.com/bmtechlabs/umai-payment-receiver/wiki/RESTful-API-Specification).


## Contributing

__Your contributions are very welcome!__

When contributing, follow the simple rules:

* Don't violate [DRY](http://programmer.97things.oreilly.com/wiki/index.php/Don%27t_Repeat_Yourself) principles.
* [Boy Scout Rule](http://programmer.97things.oreilly.com/wiki/index.php/The_Boy_Scout_Rule) needs to have been applied.
* Your code should look like all the other code – this project should look like it was written by one man, always.
* If you want to propose something – just create an issue and describe your question with as much description as you can.
* If you think you have some general improvement, consider creating a pull request with it.
* If you add new code, it should be covered by tests. No tests - no code.
* If you find a bug (or at least you think it is a bug), create an issue with the library version and test case that we can run and see what are you talking about, or at least full steps by which we can reproduce it.


## License

Licensed under [MIT](https://github.com/bmtechlabs/umai-payment-receiver/blob/master/LICENSE) &copy; 2015 &laquo;BM Technologies&raquo; LLC
