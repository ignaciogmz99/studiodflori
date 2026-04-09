-- Catálogo Día de las Madres — Studio dei Fiori
-- Pega esto en el SQL Editor de Supabase

INSERT INTO productos (id, precio, activo, stock, tipo_flor, descripcion)
VALUES
  ('DM_Tulipanes',         1350, true, 10, 'dia_de_madres', '10 tulipanes del color a elegir. Arreglo doble vista con base de cerámica. 30 cm de alto x 15 cm de ancho.'),
  ('DM_Ramo_Lisianthus',   1150, true, 10, 'dia_de_madres', 'Ramo con lisianthus, claveles, limonium y follaje. Ramo floral con papel coreano. 55 cm de alto x 40 cm de ancho.'),
  ('DM_Lisianthus_Vidrio', 1300, true, 10, 'dia_de_madres', 'Lisianthus de 2 tonalidades y follaje. Arreglo doble vista en base de vidrio. 60 cm de alto x 50 cm de ancho.'),
  ('DM_Ramo_Anturios',     1200, true, 10, 'dia_de_madres', 'Lisianthus, anturios, rosas blancas, claveles y follaje. Ramo de flores con papel coreano. 55 cm de alto x 40 cm de ancho.'),
  ('DM_Lisianthus_Blanco', 1250, true, 10, 'dia_de_madres', 'Lisianthus blanco, perrito y follaje. Arreglo floral doble vista con base de vidrio. 50 cm de alto x 50 cm de ancho.'),
  ('DM_Canasta_Amarilla',  1300, true, 10, 'dia_de_madres', 'Rosa amarilla, lili amarilla, margarita y follaje. Arreglo floral doble vista estilo canasta. 40 cm de alto x 40 cm de ancho.'),
  ('DM_Canasta_Roja',      1400, true, 10, 'dia_de_madres', 'Rosa roja, lisianthus rosa, follaje y craspedia. Arreglo floral una vista estilo canasta. 60 cm de alto x 50 cm de ancho.'),
  ('DM_Canasta_Lisianthus',1255, true, 10, 'dia_de_madres', 'Lisianthus y follaje. Arreglo floral una vista estilo canasta. 50 cm de alto x 50 cm de ancho.'),
  ('DM_Ceramica_Amarilla', 1350, true, 10, 'dia_de_madres', 'Rosas amarillas, clavellina rosa y perritos rosas. Arreglo floral una vista con base de cerámica. 50 cm de alto x 30 cm de ancho.'),
  ('DM_Ceramica_Salmon',   1200, true, 10, 'dia_de_madres', 'Rosa amarilla, rosa salmón, perrito y clavel blanco. Arreglo floral una vista con base de cerámica. 50 cm de alto x 50 cm de ancho.'),
  ('DM_Ramo_Girasoles',     975, true, 10, 'dia_de_madres', 'Girasoles, mini gerberas, perrito blanco y follaje. Ramo de flores con papel coreano. 55 cm de alto x 20 cm de ancho.'),
  ('DM_Rosas_Inglesas',    1275, true, 10, 'dia_de_madres', 'Rosas inglesas con follaje. Ramo de flores con papel coreano. 55 cm de alto x 40 cm de ancho.')
ON CONFLICT (id) DO UPDATE SET
  precio      = EXCLUDED.precio,
  activo      = EXCLUDED.activo,
  stock       = EXCLUDED.stock,
  tipo_flor   = EXCLUDED.tipo_flor,
  descripcion = EXCLUDED.descripcion;
