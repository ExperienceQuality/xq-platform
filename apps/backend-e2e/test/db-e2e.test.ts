import { expect, test } from "@experiencequality/test/vitest";

type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "success";

type TestDatabase = {
  payments: {
    id: string;
    order_id: string;
    amount: string;
    currency: string;
    status: PaymentStatus;
    created_at: Date;
    updated_at: Date;
  };
};

test("Given a valid payment, when it is created, then the response is persisted exactly", async ({ kit }) => {
  const payments = kit.db.get<TestDatabase>("payments");
  const orderId = `e2e-${kit.run.id}`;

  const response = await kit.rest
    .post("/payments")
    .withJson({
      order_id: orderId,
      amount: 4999,
      currency: "VND",
      status: "captured",
    })
    .expectStatus(201)
    .toss();

  expect(response.body).toMatchObject({
    id: expect.any(String),
    order_id: orderId,
    amount: "4999",
    currency: "VND",
    status: "captured",
  });
  expect(response.body.created_at).toBeTruthy();
  expect(response.body.updated_at).toBeTruthy();

  const persisted = await payments
    .selectFrom("payments")
    .selectAll()
    .where("order_id", "=", orderId)
    .executeTakeFirstOrThrow();

  expect(persisted).toEqual({
    id: response.body.id,
    order_id: response.body.order_id,
    amount: response.body.amount,
    currency: response.body.currency,
    status: response.body.status,
    created_at: expect.any(Date),
    updated_at: expect.any(Date),
  });
  expect(persisted.updated_at.getTime()).toBeGreaterThanOrEqual(persisted.created_at.getTime());
});

test("Given invalid payment input, when it is submitted, then it is rejected without persistence", async ({ kit }) => {
  const payments = kit.db.get<TestDatabase>("payments");
  const cases = [
    {
      body: { order_id: `invalid-negative-${kit.run.id}`, amount: -1, currency: "VND" },
      orderId: `invalid-negative-${kit.run.id}`,
    },
    {
      body: { order_id: `invalid-currency-${kit.run.id}`, amount: 100, currency: "vnd" },
      orderId: `invalid-currency-${kit.run.id}`,
    },
    {
      body: { amount: 100, currency: "VND" },
      orderId: `invalid-order-${kit.run.id}`,
    },
  ];

  for (const input of cases) {
    const response = await kit.rest
      .post("/payments")
      .withJson(input.body)
      .expectStatus(400)
      .toss();

    expect(response.body).toEqual({ error: "invalid_payment" });
  }

  const rejectedRows = await payments
    .selectFrom("payments")
    .select(["order_id"])
    .where("order_id", "in", cases.map(({ orderId }) => orderId))
    .execute();

  expect(rejectedRows).toEqual([]);
});
