# MP4 → GIF

Sitio estático para convertir videos a GIF en el navegador, usando FFmpeg WebAssembly. Los videos se procesan localmente y no se cargan a un servidor.

## Publicar desde el móvil en GitHub Pages

1. Descargá y descomprimí el ZIP.
2. En GitHub, creá un repositorio nuevo (por ejemplo `mp4-gif-converter`).
3. Dentro del repositorio, tocá **Add file → Upload files** y subí `index.html`, `style.css`, `app.js` y `README.md` (los archivos, no la carpeta contenedora).
4. Entrá a **Settings → Pages**.
5. En **Build and deployment**, elegí **Deploy from a branch**.
6. Seleccioná la rama `main` y la carpeta `/ (root)`, y guardá.
7. Esperá a que GitHub Pages publique el sitio. La URL suele ser `https://TU-USUARIO.github.io/mp4-gif-converter/`.

## Notas importantes

- Requiere conexión a Internet para cargar FFmpeg desde un CDN.
- Está pensado para uso en navegador moderno; videos grandes pueden agotar la memoria de un teléfono.
- La conversión prueba combinaciones de ancho, FPS y colores para alcanzar el peso máximo. Si no lo consigue, muestra el GIF más liviano de los intentos y avisa que supera el límite.
- No hay servidor backend ni costos de alojamiento propios.
