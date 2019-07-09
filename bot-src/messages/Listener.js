const EventEmitter = require('events');

class Listener extends EventEmitter {
    /**
     * @param {int} timeout 
     */

    constructor(timeout = 2000) {
        super();
        this.timeout = timeout;
        console.log('objeto criado');
    }

    fetch(sessio) {
        setTimeout(() => this.emit('fetch'), this.timeout);
    }

    clear() {
        clearTimeout(this);
    }

    onFech(e) {
        this.on('fetch', e);
    }
}

module.exports = Listener;