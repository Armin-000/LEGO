# LEGO ETERNITY v20.10

A small 3D LEGO sandbox built with Three.js and vanilla JavaScript.  
You can place, rotate and remove LEGO-style bricks on a grid, switch between part categories, change colors, and save or restore your scene from local storage.

---

## Run Locally

You can run the project using any static server.

### Option 1 — VS Code Live Server (recommended)

1. Open the project folder in VS Code  
2. Install the extension **“Live Server”** (by Ritwick Dey)  
3. Right-click `index.html`  
4. Click **“Open with Live Server”**

The project will automatically open in your browser.

---

### Option 2 — Node static server

```bash
npx http-server .
````

Then open the printed `http://localhost:...` URL in your browser.

---

## Features

* 3D grid with OrbitControls camera
* Part categories: bricks, plates, slopes, special parts, nature prefabs
* Color palette with instant preview ghost piece
* Snap-to-grid placement and rotation
* Remove pieces with Shift + click
* Undo history (Ctrl + Z)
* Save and load scene using local storage
* Minimal UI sidebar and status bar overlay

---

## Technologies

* HTML5
* CSS3
* JavaScript (ES modules)
* Three.js (via CDN import map)

No build tools or backend are required.

---

## Project Structure

```text
.
├─ index.html        # Main HTML entry, imports Three.js and app.js
├─ css/
│  └─ style.css      # Layout, sidebar, status bar and loader styles
├─ js/
│  └─ app.js         # Three.js scene, UI logic, part catalog, undo/save
├─ LICENSE
└─ README.md
```
