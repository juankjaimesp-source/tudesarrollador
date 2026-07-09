// Mini-servidor local para ver la landing de TuDesarrollador.com
// No requiere instalar nada: usa solo Node.js.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const PORT = 4321;

const server = http.createServer((req, res) => {
  // Solo servimos la landing (una sola página)
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(__dirname, decodeURIComponent(filePath.split("?")[0]));

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("No encontrado");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css",
      ".js": "application/javascript",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".xml": "application/xml; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
      ".ico": "image/x-icon",
      ".json": "application/json; charset=utf-8",
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log("\n========================================");
  console.log("  TuDesarrollador.com - servidor local");
  console.log("========================================");
  console.log(`\n  Abre en tu navegador:  ${url}`);
  console.log("\n  (Deja esta ventana abierta mientras la ves)");
  console.log("  Para apagar el servidor: cierra esta ventana.\n");
  // Abre el navegador automaticamente
  exec(`start "" "${url}"`);
});
