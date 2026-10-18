import { expect, test, type BrowserTestKit } from '@experiencequality/test-browser';

function appUrl(kit: BrowserTestKit): string {
  const backendUrl = kit.run.backendUrl;
  if (!backendUrl) throw new Error('node-test-kit: backendUrl is not configured');
  return backendUrl;
}

test('serves the static app shell', async ({ kit, page }) => {
  await page.goto(appUrl(kit));

  await expect(page.getByRole('heading', { name: 'Hello XQ' })).toBeVisible();
  expect(kit.run.testId).toBeTruthy();
  expect(kit.run.mock.baseUrl).toMatch(/^http:\/\//);
});

test('greets through the pactum stub server', async ({ kit, page }) => {
  const interactionId = await kit.stub.addInteraction({
    request: { method: 'GET', path: '/api/hello' },
    response: { status: 200, body: { message: 'Hello XQ' } },
  });

  // The page's fetch('/api/hello') is replayed server-side against the pactum
  // stub with the per-test namespace header, so no CORS preflight is involved.
  await page.route('**/api/hello', async (route) => {
    const response = await route.fetch({
      url: `${kit.stub.baseUrl}/api/hello`,
      headers: {
        ...(await route.request().allHeaders()),
        [kit.run.mock.namespaceHeader]: kit.run.id,
      },
    });
    await route.fulfill({ response });
  });

  await page.goto(appUrl(kit));
  await page.getByRole('button', { name: 'Greet' }).click();
  await expect(page.getByTestId('greeting')).toHaveText('Hello XQ');

  await kit.stub.verifyCalled(interactionId);
});
