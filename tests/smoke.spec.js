import { expect, test } from '@playwright/test'

test.describe('storefront smoke flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear()
    })
  })

  test('loads catalog, adds product, and reaches payment provider step', async ({ page }) => {
    const pageErrors = []

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Flores y Plantas' })).toBeVisible()
    await expect(page.getByText(/productos/i)).toBeVisible()

    await page.getByRole('button', { name: 'Agregar al carrito' }).first().click()
    await page.getByRole('button', { name: /Carrito con 1 producto/i }).click()

    await expect(page.getByRole('dialog', { name: 'Carrito de compras' })).toBeVisible()
    await expect(page.getByText(/Total:/i)).toBeVisible()

    await page.getByRole('button', { name: 'Pasar a pago' }).click()

    await expect(page.getByRole('heading', { name: 'Pago' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled()

    await page.locator('input[name="fullName"]').fill('Prueba Usuario')
    await page.locator('input[name="phone"]').fill('3312345678')
    await page.locator('input[name="streetAddress"]').fill('Av. Mexico 1234')
    await page.locator('input[name="neighborhood"]').fill('Americana')
    await page.locator('input[name="postalCode"]').fill('44100')

    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled()
    await page.getByRole('button', { name: 'Siguiente' }).click()

    await expect(page.getByRole('heading', { name: 'Pagar con tarjeta' })).toBeVisible()
    await expect(page.getByText(/Mercado Pago o Stripe/i)).toBeVisible()

    expect(pageErrors).toEqual([])
  })
})
