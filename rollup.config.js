import typescript from "@rollup/plugin-typescript";
import nodePolyfills from "rollup-plugin-polyfill-node";

module.exports = {
  input: "src/index.ts",
  output: {
    file: "build/bundle.js",
    format: "umd",
    name: "Korona",
    globals: {
      peerjs: "Peer",
    },
  },
  plugins: [typescript(), nodePolyfills(/* options */)],
};
