import { expect, test } from "@playwright/test";

test("public landing page loads", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Create albums. Share a link. Done." }),
  ).toBeVisible();
});

test("sign-in and sign-up routes load without an authenticated session", async ({
  page,
}) => {
  for (const path of ["/sign-in", "/sign-up"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("main")).toBeVisible();
  }
});

test("dashboard redirects unauthenticated visitors to sign-in", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
});
