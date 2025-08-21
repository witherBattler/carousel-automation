const fs = require("fs")
const dotenv = require("dotenv")
dotenv.config()
const path = require("path")



const projectRoot = path.resolve();
const configPath = path.join(projectRoot, 'n4n.config.json');



function getPort() {
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.port
}

function getBaseUrl() {
  return process.env.URL_BASE
}

module.exports = {getPort, getBaseUrl}