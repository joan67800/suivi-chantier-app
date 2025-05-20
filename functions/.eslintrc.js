module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  parserOptions: {
    ecmaVersion: 2020,
  },
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "quotes": ["error", "double"],
    // Désactive la règle de longueur de ligne maximale
    "max-len": ["off"],
    // Désactive la règle d'indentation (si elle cause des problèmes)
    "indent": ["off"],
    // Désactive la règle sur les virgules de fin
    "comma-dangle": ["off"],
    // Désactive la règle sur l'espacement des accolades d'objets
    "object-curly-spacing": ["off"],
    // Désactive la règle de fin de fichier par une nouvelle ligne
    "eol-last": ["off"]
  },
};