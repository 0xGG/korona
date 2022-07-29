(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('peerjs')) :
    typeof define === 'function' && define.amd ? define(['exports', 'peerjs'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Korona = {}, global.Peer));
})(this, (function (exports, Peer) { 'use strict';

    function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

    var Peer__default = /*#__PURE__*/_interopDefaultLegacy(Peer);

    /******************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    function __spreadArray(to, from, pack) {
        if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
            if (ar || !(i in from)) {
                if (!ar) ar = Array.prototype.slice.call(from, 0, i);
                ar[i] = from[i];
            }
        }
        return to.concat(ar || Array.prototype.slice.call(from));
    }

    var Version = /** @class */ (function () {
        function Version(peerId, counter) {
            if (counter === void 0) { counter = 0; }
            this.peerId = peerId;
            this.counter = counter;
            this.exceptions = [];
        }
        Version.prototype.update = function (version) {
            var incomingCounter = version.counter;
            if (incomingCounter <= this.counter) {
                var index = this.exceptions.indexOf(incomingCounter);
                if (index >= 0) {
                    this.exceptions.splice(index, 1);
                }
            }
            else if (incomingCounter === this.counter + 1) {
                this.counter = this.counter + 1;
            }
            else {
                for (var i = this.counter + 1; i < incomingCounter; i++) {
                    this.exceptions.push(i);
                }
                this.counter = incomingCounter;
            }
        };
        return Version;
    }());

    var VersionVector = /** @class */ (function () {
        function VersionVector(peerId) {
            this.localVersion = new Version(peerId);
            this.versions = [this.localVersion];
        }
        VersionVector.prototype.increment = function () {
            this.localVersion.counter++;
        };
        // Update vector with new version received from another site
        VersionVector.prototype.update = function (incomingVersion) {
            var existingVersion = this.getVersionFromVectors(incomingVersion);
            if (!existingVersion) {
                var newVersion = new Version(incomingVersion.peerId);
                newVersion.update(incomingVersion);
                this.versions.push(newVersion);
            }
            else {
                existingVersion.update(incomingVersion);
            }
        };
        // Check if the incoming remote operation has already been applied to our crdt
        VersionVector.prototype.hasBeenApplied = function (incomingVersion) {
            var localIncomingVersion = this.getVersionFromVectors(incomingVersion);
            if (!localIncomingVersion) {
                return false;
            }
            var isIncomingLower = incomingVersion.counter <= localIncomingVersion.counter;
            var isInExceptions = localIncomingVersion.exceptions.indexOf(incomingVersion.counter) >= 0;
            return isIncomingLower && !isInExceptions;
        };
        VersionVector.prototype.getVersionFromVectors = function (version) {
            var localVersion = null;
            for (var i = 0; i < this.versions.length; i++) {
                if (this.versions[i].peerId === version.peerId) {
                    localVersion = this.versions[i];
                    break;
                }
            }
            return localVersion;
        };
        VersionVector.prototype.getLocalVersion = function () {
            var localVersion = new Version(this.localVersion.peerId);
            localVersion.counter = this.localVersion.counter;
            return localVersion;
        };
        return VersionVector;
    }());

    function randomID() {
        return Math.random().toString(36).substr(2, 9);
    }
    exports.RequestType = void 0;
    (function (RequestType) {
        RequestType["ConnectionRequest"] = "cr";
        RequestType["RemoveFromNetwork"] = "rfn";
        RequestType["AddToNetwork"] = "adn";
        RequestType["SyncResponse"] = "sr";
        RequestType["SyncCompleted"] = "sc";
    })(exports.RequestType || (exports.RequestType = {}));
    var Korona = /** @class */ (function () {
        function Korona(options) {
            this._options = options;
            this.outConns = [];
            this.inConns = [];
            this.network = [];
            this.maxPeers = options.maxPeers || 5;
            if (this.maxPeers < 2) {
                this.maxPeers = 2;
            }
            // Bind callbacks
            this._onOpen = options.onOpen;
            this._onDisconnected = options.onDisconnected;
            this._onData = options.onData;
            this._onPeerJoined = options.onPeerJoined;
            this._onPeerLeft = options.onPeerLeft;
            this._createDataForInitialSync = options.createDataForInitialSync;
            if (!this._createDataForInitialSync) {
                this._createDataForInitialSync = function () {
                    return {};
                };
            }
            var peerId = options.peerId || randomID();
            if (options.roomId) {
                // pubsub
                this.tryToBecomeTheRoomHost();
            }
            else {
                this.peer = new Peer__default["default"](peerId, options.peerJSOptions);
                this.onOpen();
            }
        }
        Korona.prototype.tryToBecomeTheRoomHost = function () {
            var _this = this;
            var _a;
            console.log("Trying to become the room host");
            if (!((_a = this._options) === null || _a === void 0 ? void 0 : _a.roomId)) {
                return;
            }
            var oldPeer = this.peer;
            this._onOpen = function () {
                var _a;
                if (oldPeer) {
                    oldPeer.destroy();
                }
                if ((_a = _this._options) === null || _a === void 0 ? void 0 : _a.onOpen) {
                    _this._options.onOpen();
                }
            };
            this.peer = new Peer__default["default"](this._options.roomId, this._options.peerJSOptions);
            this.onOpen();
            this.peer.on("error", function (err) {
                var _a, _b, _c, _d;
                if (err.type === "unavailable-id") {
                    console.log("Room already exists  - joining");
                    if (!oldPeer) {
                        // Initialize peer
                        var peerId = ((_a = _this._options) === null || _a === void 0 ? void 0 : _a.peerId) || randomID();
                        _this.peer = new Peer__default["default"](peerId, (_b = _this._options) === null || _b === void 0 ? void 0 : _b.peerJSOptions);
                        _this._onOpen = function () {
                            var _a, _b, _c;
                            if ((_a = _this._options) === null || _a === void 0 ? void 0 : _a.roomId) {
                                _this.requestConnection((_b = _this._options) === null || _b === void 0 ? void 0 : _b.roomId);
                            }
                            if ((_c = _this._options) === null || _c === void 0 ? void 0 : _c.onOpen) {
                                _this._options.onOpen();
                            }
                        };
                        _this.onOpen();
                    }
                    else {
                        // Reconnect to room
                        _this.peer = oldPeer;
                        if ((_c = _this._options) === null || _c === void 0 ? void 0 : _c.roomId) {
                            _this.requestConnection((_d = _this._options) === null || _d === void 0 ? void 0 : _d.roomId);
                        }
                    }
                }
            });
        };
        Korona.prototype.send = function (operation, from) {
            var _a;
            var operationJSON;
            var fromPeerID;
            if (!((_a = this.peer) === null || _a === void 0 ? void 0 : _a.id) || !this.versionVector) {
                return;
            }
            if ("_v" in operation) {
                fromPeerID = operation["_v"]["p"];
                // Already has Version information
                operationJSON = JSON.stringify(operation);
            }
            else {
                fromPeerID = this.peer.id;
                this.versionVector.increment();
                operationJSON = JSON.stringify(Object.assign(operation, {
                    _v: {
                        // Version
                        p: fromPeerID,
                        c: this.versionVector.localVersion.counter,
                    },
                }));
            }
            this.outConns.forEach(function (conn) {
                if (fromPeerID !== conn.peer &&
                    (!from || (from.peer !== conn.peer && from.label !== conn.label))) {
                    console.log("send to: ", conn, "data: ", operationJSON);
                    conn.send(operationJSON);
                }
            });
        };
        Korona.prototype.onOpen = function () {
            var _this = this;
            var _a;
            (_a = this.peer) === null || _a === void 0 ? void 0 : _a.on("open", function (id) {
                if (_this._onOpen) {
                    _this._onOpen(id);
                }
                _this.versionVector = new VersionVector(id);
                _this.outConns = [];
                _this.inConns = [];
                _this.network = [];
                _this.onPeerConnection();
                _this.onError();
                _this.onDisconnect();
                _this.addToNetwork(id);
            });
        };
        Korona.prototype.onPeerConnection = function () {
            var _this = this;
            var _a;
            (_a = this.peer) === null || _a === void 0 ? void 0 : _a.on("connection", function (connection) {
                connection.on("open", function () {
                    _this.onConnection(connection);
                    _this.onData(connection);
                    _this.onConnClose(connection);
                    _this.onConnError(connection);
                });
            });
        };
        Korona.prototype.onConnection = function (connection) {
            var _a;
            if (connection.peer !== ((_a = this.peer) === null || _a === void 0 ? void 0 : _a.id)) {
                console.log("* connection established: ", connection.peer);
                this.addToInConns(connection);
            }
        };
        Korona.prototype.onError = function () {
            var _this = this;
            var _a;
            (_a = this.peer) === null || _a === void 0 ? void 0 : _a.on("error", function (err) {
                var _a;
                console.log("* error: ", err);
                var pid = String(err).replace("Error: Could not connect to peer ", "");
                _this.removeFromConnections(pid);
                if (!((_a = _this.peer) === null || _a === void 0 ? void 0 : _a.disconnected)) {
                    _this.findNewTarget();
                }
            });
        };
        Korona.prototype.onDisconnect = function () {
            var _this = this;
            var _a;
            (_a = this.peer) === null || _a === void 0 ? void 0 : _a.on("disconnected", function () {
                // Disconnected
                if (_this._onDisconnected) {
                    _this._onDisconnected();
                }
            });
        };
        Korona.prototype.onData = function (connection) {
            var _this = this;
            connection.on("data", function (data) {
                var dataObj = {};
                try {
                    dataObj = JSON.parse(data);
                }
                catch (error) {
                    dataObj = {};
                }
                switch (dataObj.type) {
                    case exports.RequestType.ConnectionRequest:
                        _this.evaluateRequest(dataObj.peerId);
                        break;
                    case exports.RequestType.AddToNetwork:
                        _this.addToNetwork(dataObj.newPeer);
                        break;
                    case exports.RequestType.RemoveFromNetwork:
                        _this.removeFromNetwork(dataObj.oldPeer);
                        break;
                    case exports.RequestType.SyncResponse:
                        _this.handleSyncResponse(dataObj);
                        break;
                    case exports.RequestType.SyncCompleted:
                        _this.handleSyncCompleted(dataObj);
                        break;
                    default:
                        _this.handleRemoteOperation(dataObj, connection);
                }
            });
        };
        Korona.prototype.onConnClose = function (connection) {
            var _this = this;
            connection.on("close", function () {
                console.log("* connection closed: ", connection.peer);
                _this.removeFromConnections(connection.peer);
                if (!_this.hasReachMax()) {
                    _this.findNewTarget();
                }
            });
        };
        Korona.prototype.onConnError = function (connection) {
            connection.on("error", function (error) {
                console.error("* connection error: ".concat(error));
            });
        };
        Korona.prototype.evaluateRequest = function (peerId) {
            if (this.hasReachMax()) {
                this.forwardConnRequest(peerId);
            }
            else {
                this.acceptConnRequest(peerId);
            }
        };
        Korona.prototype.forwardConnRequest = function (peerId) {
            var connected = this.outConns.filter(function (conn) { return conn.peer !== peerId; });
            var randomIdx = Math.floor(Math.random() * connected.length);
            connected[randomIdx].send(JSON.stringify({
                type: exports.RequestType.ConnectionRequest,
                peerId: peerId,
            }));
        };
        Korona.prototype.acceptConnRequest = function (peerId) {
            var _a, _b;
            var connBack = (_a = this.peer) === null || _a === void 0 ? void 0 : _a.connect(peerId);
            if (connBack) {
                this.addToOutConns(connBack);
                this.addToNetwork(peerId);
                var initialData_1 = JSON.stringify({
                    type: exports.RequestType.SyncResponse,
                    peerId: (_b = this.peer) === null || _b === void 0 ? void 0 : _b.id,
                    network: this.network,
                });
                if (connBack.open) {
                    connBack.send(initialData_1);
                }
                else {
                    connBack.on("open", function () {
                        connBack.send(initialData_1);
                    });
                }
            }
        };
        Korona.prototype.addToNetwork = function (peerId) {
            if (!this.network.find(function (p) { return p === peerId; })) {
                this.network.push(peerId);
                if (this._onPeerJoined) {
                    this._onPeerJoined(peerId);
                }
                this.send({
                    type: exports.RequestType.AddToNetwork,
                    newPeer: peerId,
                });
            }
        };
        Korona.prototype.removeFromConnections = function (peerId) {
            this.inConns = this.inConns.filter(function (conn) { return conn.peer !== peerId; });
            this.outConns = this.outConns.filter(function (conn) { return conn.peer !== peerId; });
            console.log("removeFromNetwork 1", peerId);
            this.removeFromNetwork(peerId);
        };
        Korona.prototype.removeFromNetwork = function (peerId) {
            var _a, _b, _c, _d;
            var idx = this.network.indexOf(peerId);
            console.log("removeFromNetwork 2: ", __spreadArray([], this.network, true), peerId, idx);
            if (idx >= 0) {
                this.network.splice(idx, 1);
                if (this._onPeerLeft) {
                    this._onPeerLeft(peerId);
                }
                this.send({
                    type: exports.RequestType.RemoveFromNetwork,
                    oldPeer: peerId,
                });
                if (((_a = this._options) === null || _a === void 0 ? void 0 : _a.roomId) &&
                    ((_b = this.peer) === null || _b === void 0 ? void 0 : _b.id) !== ((_c = this._options) === null || _c === void 0 ? void 0 : _c.roomId) &&
                    peerId === ((_d = this._options) === null || _d === void 0 ? void 0 : _d.roomId)) {
                    console.log(this.network.length);
                    this.tryToBecomeTheRoomHost();
                }
            }
        };
        Korona.prototype.hasReachMax = function () {
            var halfTheNetwork = Math.ceil(this.network.length / 2);
            var tooManyInConns = this.inConns.length > Math.max(halfTheNetwork, this.maxPeers);
            var tooManyOutConns = this.outConns.length > Math.max(halfTheNetwork, this.maxPeers);
            return tooManyInConns || tooManyOutConns;
        };
        Korona.prototype.findNewTarget = function () {
            var _this = this;
            var _a;
            var connected = this.outConns.map(function (conn) { return conn.peer; });
            var unconnected = this.network.filter(function (peerId) { return connected.indexOf(peerId) === -1; });
            var possibleTargets = unconnected.filter(function (peerId) { var _a; return peerId !== ((_a = _this.peer) === null || _a === void 0 ? void 0 : _a.id); });
            if (possibleTargets.length === 0) ;
            else {
                var randomIdx = Math.floor(Math.random() * possibleTargets.length);
                var newTarget = possibleTargets[randomIdx];
                this.requestConnection(newTarget, (_a = this.peer) === null || _a === void 0 ? void 0 : _a.id);
            }
        };
        Korona.prototype.requestConnection = function (targetPeerID, peerId) {
            var _a, _b;
            if (!peerId) {
                peerId = (_a = this.peer) === null || _a === void 0 ? void 0 : _a.id;
            }
            var conn = (_b = this.peer) === null || _b === void 0 ? void 0 : _b.connect(targetPeerID);
            if (conn) {
                this.addToOutConns(conn);
                var dataToSend_1 = JSON.stringify({
                    type: exports.RequestType.ConnectionRequest,
                    peerId: peerId,
                });
                if (conn.open) {
                    conn.send(dataToSend_1);
                }
                else {
                    conn.on("open", function () {
                        conn.send(dataToSend_1);
                    });
                }
            }
        };
        Korona.prototype.addToInConns = function (connection) {
            if (!!connection && !this.isAlreadyConnectedIn(connection)) {
                this.inConns.push(connection);
            }
        };
        Korona.prototype.addToOutConns = function (connection) {
            if (!!connection && !this.isAlreadyConnectedOut(connection)) {
                this.outConns.push(connection);
            }
        };
        Korona.prototype.isAlreadyConnectedOut = function (connection) {
            return !!this.outConns.find(function (conn) { return conn.peer === connection.peer && conn.label === connection.label; });
        };
        Korona.prototype.isAlreadyConnectedIn = function (connection) {
            return !!this.inConns.find(function (conn) { return conn.peer === connection.peer && conn.label === connection.label; });
        };
        Korona.prototype.handleRemoteOperation = function (operation, connection) {
            var _a;
            var v = operation._v;
            if (v &&
                "p" in v &&
                "c" in v &&
                v.p !== ((_a = this.peer) === null || _a === void 0 ? void 0 : _a.id) && // Can't send message back to the sender
                this.versionVector &&
                !this.versionVector.hasBeenApplied(new Version(v.p, v.c))) {
                this.versionVector.update(new Version(v.p, v.c));
                this.send(operation, connection);
                if (this._onData) {
                    this._onData(operation, connection);
                }
            }
        };
        Korona.prototype.handleSyncResponse = function (operation) {
            var _this = this;
            var _a, _b;
            var fromPeerID = operation.peerId;
            var network = operation.network || [];
            network.forEach(function (peerId) { return _this.addToNetwork(peerId); });
            // Sync complete
            var completedMessage = JSON.stringify({
                type: exports.RequestType.SyncCompleted,
                peerId: (_a = this.peer) === null || _a === void 0 ? void 0 : _a.id,
            });
            var connection = this.outConns.find(function (conn) { return conn.peer === fromPeerID; });
            if (connection) {
                connection.send(completedMessage);
            }
            else {
                connection = (_b = this.peer) === null || _b === void 0 ? void 0 : _b.connect(fromPeerID);
                if (connection) {
                    this.addToOutConns(connection);
                    if (connection.open) {
                        connection.send(completedMessage);
                    }
                    else {
                        connection.on("open", function () {
                            connection === null || connection === void 0 ? void 0 : connection.send(completedMessage);
                        });
                    }
                }
            }
        };
        Korona.prototype.handleSyncCompleted = function (operation) {
            var _a, _b, _c, _d;
            var fromPeerID = operation.peerId;
            (_a = this.versionVector) === null || _a === void 0 ? void 0 : _a.increment();
            var connection = this.outConns.find(function (conn) { return conn.peer === fromPeerID; });
            var dataToSend = JSON.stringify(Object.assign(this._createDataForInitialSync ? this._createDataForInitialSync() : {}, {
                _v: {
                    p: (_b = this.peer) === null || _b === void 0 ? void 0 : _b.id,
                    c: (_c = this.versionVector) === null || _c === void 0 ? void 0 : _c.localVersion.counter,
                },
            }));
            if (connection) {
                connection.send(dataToSend);
            }
            else {
                connection = (_d = this.peer) === null || _d === void 0 ? void 0 : _d.connect(fromPeerID);
                if (connection) {
                    this.addToOutConns(connection);
                    if (connection.open) {
                        connection.send(dataToSend);
                    }
                    else {
                        connection.on("open", function () {
                            connection === null || connection === void 0 ? void 0 : connection.send(dataToSend);
                        });
                    }
                }
            }
        };
        return Korona;
    }());

    exports.Korona = Korona;
    exports.randomID = randomID;

    Object.defineProperty(exports, '__esModule', { value: true });

}));
