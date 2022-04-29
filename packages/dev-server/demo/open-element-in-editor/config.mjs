import { fileURLToPath } from 'url';
import { resolve } from 'path';

export default {
  rootDir: resolve(fileURLToPath(import.meta.url), '..', '..', '..'),
  appIndex: '/demo/open-element-in-editor/index.html',
  nodeResolve: true,
};
