# South View — Historic Cemetery Navigation & History

## Setup

1. **Mapbox token**  
   - Get a token at [account.mapbox.com](https://account.mapbox.com/).  
   - Copy `config.example.js` to `config.js` and set your token in `config.js`.

3. **Run locally**  
   - Serve over HTTP (Mapbox needs it; `file://` will not load tiles):
     cd /path/to/southview
     ```bash
     python3 -m http.server 3000
     ```
   - Open **http://localhost:3000**.

   - **If you see a failed-to-load dataset error:**  
     - Run **`python python/buried_subset.py`** to create `buried-data.csv`, `data/graves.json`, and `data/coordinates.json`.  
     - Open **http://localhost:3000** (not `file://`) and serve from the project root.

## Features

- **Map**: Clustered markers for burials with coordinates; click cluster to zoom, click point to open detail.
- **Filters**: filter by life story.
- **List view**: Toggle “List view” to see burials; click a row to fly to map and open popup.
- **Detail popup**: Picture, name, birth/death, description
- **Guided tour**: Path through filtered burials; Prev/Next and Exit.

