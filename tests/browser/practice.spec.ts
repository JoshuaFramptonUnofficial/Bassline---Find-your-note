import { expect, test } from '@playwright/test';

test('shows a bass-clef card, switches notes, and supports a narrow viewport', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your note.' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Bass clef, C3, whole note' })).toBeVisible();
  await page.getByRole('button', { name: 'Practise G2', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Bass clef, G2, whole note' })).toBeVisible();
  await page.getByRole('button', { name: 'Next note', exact: true }).click();
  await expect(page.locator('#target-name')).not.toHaveText('G2');
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.getByRole('button', { name: 'Start microphone', exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test('full range includes E2 and C4 and persists settings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice settings', exact: true }).click();
  await page.getByLabel('Lowest note', { exact: true }).selectOption('40');
  await page.getByLabel('Highest note', { exact: true }).selectOption('60');
  await page.getByRole('button', { name: 'Save settings' }).click();
  for (const note of ['E2', 'C4']) {
    await page.getByRole('button', { name: `Practise ${note}`, exact: true }).click();
    await expect(page.getByRole('img', { name: `Bass clef, ${note}, whole note` })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Practise C4', exact: true })).toBeVisible();
});

test('reference playback is cancellable when the target changes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play reference' }).click();
  await expect(page.getByRole('button', { name: 'Stop reference' })).toBeVisible();
  await page.getByRole('button', { name: 'Next note', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play reference' })).toBeVisible();
  await expect(page.locator('#hold-progress')).toHaveAttribute('value', '0');
  await expect(page.locator('#matched-count')).toHaveText('0');
});

test('permission denial offers recovery and keeps reference practice available', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start microphone', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Microphone access was blocked' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start microphone', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Play reference' }).click();
  await expect(page.getByRole('button', { name: 'Stop reference' })).toBeVisible();
});

test('cancelling a pending microphone request stops a late stream', async ({ page }) => {
  await page.addInitScript(() => {
    const testing = window as unknown as { resolveMicrophone: () => void; lateTrackStopped: boolean };
    testing.lateTrackStopped = false;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => new Promise(resolve => {
        testing.resolveMicrophone = () => resolve({
          getTracks: () => [{ stop: () => { testing.lateTrackStopped = true; } }],
        });
      }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start microphone', exact: true }).click();
  await page.waitForFunction(() => typeof (window as unknown as { resolveMicrophone: unknown }).resolveMicrophone === 'function');
  await page.getByRole('button', { name: 'Cancel microphone request', exact: true }).click();
  await page.evaluate(() => (window as unknown as { resolveMicrophone: () => void }).resolveMicrophone());
  await expect.poll(() => page.evaluate(() => (window as unknown as { lateTrackStopped: boolean }).lateTrackStopped)).toBe(true);
  await expect(page.locator('#mic-badge')).toContainText('MIC OFF');
});
