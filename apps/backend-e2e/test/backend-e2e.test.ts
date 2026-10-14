import { expect, test } from "@experiencequality/test/vitest";

test("Given an order, when payment succeeds, then the order response and downstream call agree", async ({
  kit,
}) => {
  const paymentStubId = await kit.stub.addInteraction({
    request: {
      method: "POST",
      path: "/payments",
      body: { productId: "product-1" },
    },
    response: {
      status: 201,
      body: { paymentId: "pay-123", status: "created" },
    },
  });

  const response = await kit.rest
    .post("/orders")
    .withJson({ productId: "product-1" })
    .expectStatus(201)
    .toss();

  expect(response.body).toEqual({
    id: "order-123",
    productId: "product-1",
    paymentId: "pay-123",
    status: "created",
  });

  await kit.stub.verifyRequest(paymentStubId, {
    method: "POST",
    path: "/payments",
    body: { productId: "product-1" },
    headers: {
      "x-node-test-kit-namespace": kit.run.id,
    },
  });
  await kit.stub.verifyCalled(paymentStubId);
  await kit.stub.verifyNoUnexpectedInteractions();
});
