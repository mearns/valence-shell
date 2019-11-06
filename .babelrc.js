const packageData = require("./package.json");
const proccess = require("process");

const NODE_ENV = process.env.NODE_ENV;

function stripVersion(stringVersion) {
    return stringVersion.replace(/^[^0-9]+/, "");
}

module.exports = {
    plugins: ["@babel/transform-react-jsx"],
    presets: [
        [
            "@babel/preset-env",
            {
                targets: {
                    node: stripVersion(packageData.engines.node),
                    electron: stripVersion(packageData.dependencies.electron)
                }
            }
        ]
    ]
};
