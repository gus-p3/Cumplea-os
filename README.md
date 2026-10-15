# 🎂 Kahoot Cumpleaños Doble - Trivia en Tiempo Real 🎉

Una aplicación web interactiva en tiempo real inspirada en **Kahoot!**, diseñada especialmente para fiestas de cumpleaños compartidas por 2 personas. Permite saber quién de los invitados conoce mejor a cada cumpleañero y quién es el gran campeón de la fiesta.

---

## ✨ Características Principales

1. **Doble Cumpleañero**:
   - Cada pregunta se puede clasificar para el **Cumpleañero/a 1**, **Cumpleañero/a 2** o **Ambos**.
   - Al final se premia al ganador absoluto, al **Máster de Cumpleañero 1** y al **Máster de Cumpleañero 2**.

2. **Experiencia Idéntica a Kahoot!**:
   - **Lobby con PIN**: Los invitados entran desde su celular a la web con un PIN (o enlace directo de WhatsApp).
   - **4 botones de colores y figuras**: Triángulo Rojo, Rombo Azul, Círculo Amarillo, Cuadrado Verde.
   - **Puntaje por velocidad y rachas**: Entre 500 y 1000 puntos según qué tan rápido respondan, más bonos por respuestas correctas consecutivas (🔥 *streak*).
   - **Sonidos y fanfarrias**: Efectos de audio sintetizados con la Web Audio API (funcionan sin conexión a internet ni archivos externos).
   - **Efectos de confeti en el podio**: Animación fluida de partículas en canvas.

3. **Panel de Administrador & Host**:
   - **Control de tiempos**: Salto de preguntas, inicio sincronizado y visualización de cuántos jugadores ya contestaron en vivo.
   - **Editor en vivo de preguntas**: Agrega, modifica, elimina preguntas, cambia el tiempo (15s, 20s, 30s) y la opción correcta directamente desde la pantalla del Host con contraseña de seguridad.
   - **Tabla completa de puntajes**: Visualiza el desglose exacto de cada invitado y descarga los resultados en **CSV** para abrir en Excel o Google Sheets.

---

## 🚀 Cómo Ejecutar en Local

1. Abre una terminal en esta carpeta:
   ```bash
   npm install
   npm start
   ```

2. Abre en tu navegador:
   - **Pantalla del Proyector / TV (Host)**: [http://localhost:3000/host.html](http://localhost:3000/host.html)
   - **Pantalla de los Invitados (Móvil)**: [http://localhost:3000/](http://localhost:3000/)

---

## ☁️ Cómo Desplegar en Railway

El proyecto ya incluye la configuración optimizada para **Railway** (`Procfile`, `railway.json`, `package.json` con `start: "node server.js"` y puerto dinámico `process.env.PORT`):

### Opción 1: Con GitHub (Recomendada)
1. Sube esta carpeta a un repositorio de GitHub (público o privado).
2. Entra a [Railway.app](https://railway.app/) e inicia sesión.
3. Haz clic en **+ New Project** -> **Deploy from GitHub repo**.
4. Selecciona tu repositorio. Railway detectará Node.js automáticamente y desplegará la app.
5. En la pestaña **Settings** del servicio en Railway, ve a **Networking** y haz clic en **Generate Domain** (te dará una URL como `https://cumple-production.up.railway.app`).
6. ¡Listo! Abre esa URL con `/host.html` en la laptop conectada a la pantalla/TV y comparte la URL principal con tus invitados.

### Opción 2: Con Railway CLI
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

---

## ⚙️ Configuración y Preguntas

Puedes cambiar los nombres de los cumpleañeros, el PIN de acceso y las preguntas de dos formas:
1. **Desde la Web**: En la pantalla de Host, haz clic en **"⚙️ Preguntas & Config"** (contraseña por defecto: `admin`).
2. **Editando el archivo**: Modifica el archivo [questions.json](questions.json) antes de iniciar la partida.
