const express = require('express');
const morgan = require('morgan');
const mustache_express = require('mustache-express');
const path = require('path');
const fs = require('fs');
const filesize = require('filesize');
const { exec } = require('child_process');

const port = process.env.PORT;
const static_files_path = process.env.STATIC_FILES;
const ps4_ip = process.env.PS4IP;
const local_ip = process.env.LOCALIP;

const app = express();

app.use(morgan('combined'));
app.use(express.urlencoded({ extended: true }));

app.engine('html', mustache_express());
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

// ------------------------------------------------------------
// PAGE PRINCIPALE
// ------------------------------------------------------------
app.get('/', (req, res) => {
  res.render('index', { pkgs: get_pkgs() });
});

// ------------------------------------------------------------
// INSTALLATION PKG
// ------------------------------------------------------------
app.post('/install', (req, res) => {
  const filepath = req.body.filepath;
  const dirname = path.dirname(filepath);
  app.use(express.static(dirname));
  const filename = path.basename(filepath);
  ps4_install(filename, res);
});

// ------------------------------------------------------------
// SERVEUR DE FICHIERS COMPATIBLE PS4 (Range + streaming)
// ------------------------------------------------------------
app.get('/:filename', (req, res) => {
  const filePath = path.join(static_files_path, req.params.filename);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      return res.status(404).end();
    }

    const range = req.headers.range;

    // --- Pas de Range → envoi normal ---
    if (!range) {
      res.writeHead(200, {
        'Content-Length': stats.size,
        'Content-Type': 'application/octet-stream',
        'Accept-Ranges': 'bytes'
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    // --- Avec Range → streaming partiel ---
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : stats.size - 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stats.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': 'application/octet-stream'
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);
  });
});

// ------------------------------------------------------------
// LANCEMENT SERVEUR
// ------------------------------------------------------------
app.listen(port, () => {
  console.log(`PS4 PKG sender listening on port ${port} serving files from ${static_files_path}`);
});

// ------------------------------------------------------------
// LISTE DES PKG
// ------------------------------------------------------------
function get_pkgs() {
  const walkSync = function (dir, filelist) {
    const files = fs.readdirSync(dir);
    files.forEach(function (file) {
      const filepath = dir + '/' + file;
      const stat = fs.statSync(filepath);
      if (stat.isDirectory()) {
        filelist = walkSync(filepath, filelist);
      } else if (path.extname(file).toLowerCase() === '.pkg') {
        let dirname = path.dirname(filepath).replace(static_files_path + '/', '')
        let root = dirname.split("/", 1)[0];
        console.log("dirname: " + dirname);
        console.log("root: " + root);
        console.log("filepath: " + filepath);
        filelist.push({
          filepath: filepath,
          dir: dirname.replace(root + '/', ''),
          name: path.basename(filepath),
          size: filesize(stat.size)
        });
      }
    });
    return filelist;
  };
  return walkSync(static_files_path, []);
}

// ------------------------------------------------------------
// INSTALLATION PS4
// ------------------------------------------------------------
function ps4_install(filename, res) {
  const pkg_uri = `http://${local_ip}:${port}/${encodeURI(filename)}`;
  const ps4_api_uri = `http://${ps4_ip}:12800/api/install`;
  const curl_command = `curl -v "${ps4_api_uri}" --data '{"type":"direct","packages":["${pkg_uri}"]}'`;

  res.write(curl_command + "\n");
  console.log(curl_command);

  exec(curl_command, (err, stdout, stderr) => {
    if (err) {
      res.write("ERROR: " + err.message + "\n");
      console.error(err);
      return res.end();
    }

    res.write("stdout:\n" + stdout + "\n");
    res.write("stderr:\n" + stderr + "\n");

    console.log(`stdout: ${stdout}`);
    console.log(`stderr: ${stderr}`);

    res.end();
  });
}
