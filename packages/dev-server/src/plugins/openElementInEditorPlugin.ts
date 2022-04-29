import fs from 'fs';
import path from 'path';
import { Context } from 'koa';
import { Plugin, WebSocketData } from '@web/dev-server-core';
import { appendToDocument, isHtmlFragment } from '@web/parse5-utils';

export const ELEMENT_OPENER_PATH = '/__web-dev-server__open-element.js';
const ELEMENT_OPENER_QUERY_MESSAGE = '_web-dev-server__query-element';
const ELEMENT_OPENER_FOUND_MESSAGE = '_web-dev-server__found-element';

interface WebSocketResponse {
  webSocket: WebSocket;
  data: WebSocketData;
}

interface FileList {
  localFiles: string[];
  dependencyFiles: string[];
}

export const elementOpenerScript = `
<!-- injected by web-dev-server -->
<script type="module" src="${ELEMENT_OPENER_PATH}"></script>
`;

function findClickedElementFile(payload: WebSocketResponse, rootDir: string) {
  if (payload.data.type !== ELEMENT_OPENER_QUERY_MESSAGE) return;

  const data = payload.data;
  const definitionString = data.definitionString as string; // TODO: bad!

  console.log(definitionString);
  console.log('ROOT', rootDir);
  const allFiles = getAllProjectFiles(rootDir);
  const foundElementFile = findElementFile(definitionString, allFiles);
  if (!foundElementFile) {
    return;
  }
  console.log('Found element file: ', foundElementFile);
  const editorOpenLink = getEditorOpenLink(foundElementFile);
  console.log('Sending message');
  payload.webSocket.send(
    JSON.stringify({
      type: ELEMENT_OPENER_FOUND_MESSAGE,
      editorOpenLink,
    }),
  );
}

function findElementFile(definitionString: string, fileList: FileList) {
  let foundFile;
  for (const file of fileList.localFiles) {
    const fileContent = fs.readFileSync(file);
    if (fileContent.includes(definitionString)) {
      foundFile = file;
      break;
    }
  }
  // TODO: Do we want to check through dependencies?
  return foundFile;
}

function getAllProjectFiles(dirPath: string) {
  const filesList = {
    localFiles: [],
    dependencyFiles: [],
  } as FileList;

  getProjectFiles(dirPath, filesList);
  return filesList;
}

function getProjectFiles(dirPath: string, allFiles: FileList) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = dirPath + '/' + file;
    const isDir = fs.statSync(dirPath + '/' + file).isDirectory();
    if (isDir) {
      allFiles = getProjectFiles(filePath, allFiles);
    }
    if (file.endsWith('.js')) {
      if (filePath.includes('node_modules')) {
        allFiles.dependencyFiles.push(filePath);
      } else {
        allFiles.localFiles.push(filePath);
      }
    }
  });

  return allFiles;
}

function getEditorOpenLink(filePath: string) {
  const editor = 'vscode'; // TODO: Can we do this for other editors?
  return `${editor}://file://${filePath}`;
}

export function openElementInEditorPlugin(rootDir: string): Plugin {
  return {
    name: 'open-element-in-editor',
    injectWebSocket: true,

    serverStart({ webSockets }) {
      if (!webSockets) return;

      // @ts-ignore
      webSockets.on('message', (payload: WebSocketResponse) =>
        findClickedElementFile(payload, rootDir),
      );
    },

    async serve(context: Context) {
      if (context.path === ELEMENT_OPENER_PATH) {
        return `
          window.addEventListener("click", openClickedElementInEditor); 
        window.__WDS_WEB_SOCKET__.webSocket.onmessage = onMessage;

        function onMessage(msg) {
            console.log("MSG", msg);
            const msgJson = parseMessageJSON(msg);
            console.log(msgJson)
            if (msgJson.type !== "${ELEMENT_OPENER_FOUND_MESSAGE}") return;

            const a = document.createElement("a");
            a.hidden = true;
            a.href = msgJson.editorOpenLink;
            document.body.appendChild(a);
            a.click();
            a.remove();
        }

        function parseMessageJSON(msg) {
            try {
                return JSON.parse(msg.data);
            } catch (err) {
                return {};
            }
        }


            function openClickedElementInEditor(event) {
                const target = event.target;
                const clickedCustomElement = getCustomElementFromClickPath(event.path);
                console.log("Custom Element: ", clickedCustomElement);
                if (!clickedCustomElement) {
                    return;
                }
                const elementDefinition = window.customElements.get(clickedCustomElement.localName);
                console.log("ELEMENT", clickedCustomElement);

                const definitionString = elementDefinition.toString();
                sendMessage({
                    type: "${ELEMENT_OPENER_QUERY_MESSAGE}",
                    definitionString
                });
            }

            function sendMessage(data) {
                console.log(data);
                console.log(JSON.stringify(data))
                window.__WDS_WEB_SOCKET__.webSocket.send(JSON.stringify(data));
            }

            function getCustomElementFromClickPath(path) {
                console.log(path);
                while (path.length > 0) {
                    const el = path.shift();
                    const elementIsCustomElement = el.localName?.includes("-") && window.customElements.get(el.localName) !== undefined;
                    if (elementIsCustomElement) {
                        return el;
                    }
                }
                return undefined;
            }
            `;
      }
    },

    async transform(context) {
      if (context.response.is('html')) {
        if (typeof context.body !== 'string') {
          return;
        }
        if (isHtmlFragment(context.body)) {
          return;
        }
        return appendToDocument(context.body, elementOpenerScript);
      }
    },
    resolveImport({ source }) {
      if (source === ELEMENT_OPENER_PATH) {
        return ELEMENT_OPENER_PATH;
      }
    },
  };
}
