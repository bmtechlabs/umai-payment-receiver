BEGIN;

CREATE TYPE transaction_status
  AS ENUM ('initialized', 'pending', 'processing', 'success', 'failure', 'cancelled');

CREATE TABLE "transactions" (
  "id"                bigserial           PRIMARY KEY,
  "external_id"       varchar(24)         NOT NULL,
  "account_id"        integer             NOT NULL      REFERENCES "accounts" ("id"),
  "requisite"         varchar(32)         NOT NULL,
  "amount"            numeric(8,2)        NOT NULL      CHECK ("amount" > 0.00),
  "status"            transaction_status  NOT NULL      DEFAULT 'initialized',
  "message"           varchar(255),
  "initialized"       timestamp           NOT NULL      DEFAULT NOW(),
  "completed"         timestamp,
  "cancelled"         timestamp
);

CREATE UNIQUE INDEX "transactions_external_id_idx"
  ON "transactions" ("external_id");

CREATE INDEX "transactions_completed_idx"
  ON "transactions" ("completed");

COMMIT;
