module.exports = {
    removeNewlines (str) {
        return str.replace(/\r?\n/g, ' ');
    },
};
