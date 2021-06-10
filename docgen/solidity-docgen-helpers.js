module.exports = {
    removeNewlines (str) {
        return str.replaceAll(/\r?\n/g, ' ');
    },
};
