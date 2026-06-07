import fs from "fs";

const yamlPath = "insomnia/dots_nodejs_back.yaml";
const scriptPath = "insomnia/scripts/commitPreRequest.insomnia.js";

function normalize(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

let yaml = normalize(fs.readFileSync(yamlPath, "utf8"));
const script = normalize(fs.readFileSync(scriptPath, "utf8"));

const envStart = yaml.indexOf("\nenvironments:");
if (envStart < 0) {
  throw new Error("environments section not found");
}

const commitMarker = '      - url: "{{ _.base_url }}/dots/rooms/{{ _.room_id }}/actions/commit"';
const commitIdx = yaml.lastIndexOf(commitMarker, envStart);
if (commitIdx < 0) {
  throw new Error("commit request not found");
}

let commitSection = yaml.slice(commitIdx, envStart);
const scriptsIdx = commitSection.indexOf("\n        scripts:");
if (scriptsIdx >= 0) {
  commitSection = commitSection.slice(0, scriptsIdx);
}
commitSection = commitSection.replace(/\s+$/, "");

const scriptBlock = script
  .split("\n")
  .map((line) => `            ${line}`)
  .join("\n");

const commitWithScripts = `${commitSection}
        scripts:
          preRequest: |
${scriptBlock}
`;

yaml = yaml.slice(0, commitIdx) + commitWithScripts + yaml.slice(envStart);
fs.writeFileSync(yamlPath, yaml, "utf8");
console.log("Script reinjected");
