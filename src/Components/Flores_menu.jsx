import './Flores_menu.css'

const assetModules = import.meta.glob('../assets/*/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default'
})

const shelfProducts = Object.entries(assetModules).reduce((acc, [path, src]) => {
  const normalized = path.replace('\\', '/')
  const match = normalized.match(/\.\.\/assets\/([^/]+)\/([^/]+)$/)

  if (!match) {
    return acc
  }

  const folder = match[1]
  const file = match[2]

  if (!acc[folder]) {
    acc[folder] = []
  }

  acc[folder].push({ src, file })

  return acc
}, {})

const products = Object.entries(shelfProducts)
  .map(([name, images]) => {
    const sortedImages = images.sort((a, b) => a.file.localeCompare(b.file))
    const principalImage = sortedImages.find((image) => /^flor1\./i.test(image.file)) || sortedImages[0]

    return {
      id: name,
      name: name.replace(/_/g, ' '),
      image: principalImage?.src
    }
  })
  .filter((item) => Boolean(item.image))
  .sort((a, b) => a.name.localeCompare(b.name))

function FloresMenu() {
  return (
    <section className="flores-menu" aria-label="Catalogo de flores y plantas">
      <div className="flores-menu__tabs-box">
        <h2 className="flores-menu__tabs-title">Flores y Plantas</h2>
        <div className="flores-menu__tabs" role="tablist" aria-label="Categorias de flores">
          <button type="button" className="flores-menu__tab">Ver todo</button>
          <button type="button" className="flores-menu__tab">Todas las flores</button>
          <button type="button" className="flores-menu__tab flores-menu__tab--active">Rosas</button>
          <button type="button" className="flores-menu__tab">Gerberas</button>
          <button type="button" className="flores-menu__tab">Tulipanes</button>
          <button type="button" className="flores-menu__tab">Orquideas</button>
          <button type="button" className="flores-menu__tab">Combinados</button>
          <button type="button" className="flores-menu__tab">Premium</button>
        </div>
      </div>

      <h3 className="flores-menu__headline">Rosas a domicilio en Guadalajara con entrega rapida para expresar amor</h3>

      <div className="flores-menu__actions">
        <button type="button" className="flores-menu__filter">Filtrar y ordenar</button>
        <span className="flores-menu__count">{products.length} productos</span>
      </div>

      <div className="flores-menu__shelf" aria-label="Estante de productos">
        {products.map((product) => (
          <article className="flores-menu__card" key={product.id}>
            <div className="flores-menu__image-wrap">
              <img className="flores-menu__image" src={product.image} alt={product.name} loading="lazy" />
            </div>
            <p className="flores-menu__name">{product.name}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export default FloresMenu
