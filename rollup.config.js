import typescript from "@rollup/plugin-typescript";

module.exports = {
  input: "src/index.ts",
  output: {
    file: "build/bundle.js",
    format: "umd",
    name: "Korona",
    globals: {
      peerjs: "Peer"
    }
  },
  plugins: [typescript()]
};
