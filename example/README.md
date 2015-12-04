# UMAI payment receiver module example implementation

You can use this module as an example template to implement your own module that receives payment transactions from the UMAI Payment system.

In order to run this example you'll need to install Node.js and PostgreSQL if you haven't already.

## Node modules installation

In bash, `cd` into the example project directory and install the module dependencies: 

```sh
$ cd path/to/umai-payment-receiver/example
$ npm install
```

## Database installation

Create the example database:

```sh
$ createdb umai_payment_receiver_dev
```

Then run the database migrations from the `db/migrations` directory:

```sh
$ cd db
$ node ../node_modules/db-migrate/bin/db-migrate up
```

And seed the database with an example data:

```
$ node seed.js
```

## Database connection settings

If you want to change the settings, edit the `db/database.json` file (see [db-migrate configuration](http://umigrate.readthedocs.org/projects/db-migrate/en/v0.9.x/Getting%20Started/configuration/)).

## Integration testing

The `specs/integration/payment-receiver.spec.js` file contains the basic integration test that checks your module
for compatibility with [UMAI RESTful API Specification](https://github.com/bmtechlabs/umai-payment-receiver/wiki/RESTful-API-Specification).

In order to run the integration tests,

Create the test database:

```sh
$ createdb umai_payment_receiver_test
```

Run the database migrations in "test" environment:

```sh
$ cd db
$ node ../node_modules/db-migrate/bin/db-migrate up --env=test
```

And run the integration tests:

```sh
$ npm run integration-test
```
