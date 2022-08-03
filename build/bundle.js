(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('peerjs'), require('events')) :
    typeof define === 'function' && define.amd ? define(['exports', 'peerjs', 'events'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Korona = {}, global.Peer, global.EventEmitter));
})(this, (function (exports, Peer, EventEmitter) { 'use strict';

    function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

    var Peer__default = /*#__PURE__*/_interopDefaultLegacy(Peer);
    var EventEmitter__default = /*#__PURE__*/_interopDefaultLegacy(EventEmitter);

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
    /* global Reflect, Promise */

    var extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };

    function __extends(d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    function __generator(thisArg, body) {
        var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
        return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
        function verb(n) { return function (v) { return step([n, v]); }; }
        function step(op) {
            if (f) throw new TypeError("Generator is already executing.");
            while (_) try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                if (y = 0, t) op = [op[0] & 2, t.value];
                switch (op[0]) {
                    case 0: case 1: t = op; break;
                    case 4: _.label++; return { value: op[1], done: false };
                    case 5: _.label++; y = op[1]; op = [0]; continue;
                    case 7: op = _.ops.pop(); _.trys.pop(); continue;
                    default:
                        if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                        if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                        if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                        if (t[2]) _.ops.pop();
                        _.trys.pop(); continue;
                }
                op = body.call(thisArg, _);
            } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
            if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
        }
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
            var existingVersion = this.getVersionFromVectors(incomingVersion.peerId);
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
            var localIncomingVersion = this.getVersionFromVectors(incomingVersion.peerId);
            if (!localIncomingVersion) {
                return false;
            }
            var isIncomingLower = incomingVersion.counter <= localIncomingVersion.counter;
            var isInExceptions = localIncomingVersion.exceptions.indexOf(incomingVersion.counter) >= 0;
            return isIncomingLower && !isInExceptions;
        };
        VersionVector.prototype.getVersionFromVectors = function (versionPeerId) {
            var localVersion = null;
            for (var i = 0; i < this.versions.length; i++) {
                if (this.versions[i].peerId === versionPeerId) {
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
        VersionVector.prototype.setLocalVersion = function (localVersion) {
            this.localVersion = localVersion;
        };
        return VersionVector;
    }());

    function randomId() {
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
    var Korona = /** @class */ (function (_super) {
        __extends(Korona, _super);
        function Korona(options) {
            var _this = _super.call(this) || this;
            _this.connections = [];
            _this.outConns = new Set();
            _this.inConns = new Set();
            /**
             * key is the peerId
             * value is the set of peerIds that have forwarded the connection to this peer
             */
            _this.forwardedConnectionPeers = {};
            _this.requestingConnectionToPeers = new Set();
            _this.networkTimestamps = {};
            _this._options = options;
            _this.connections = [];
            _this.outConns = new Set();
            _this.inConns = new Set();
            _this.network = new Set();
            _this.networkTimestamps = {};
            _this.forwardedConnectionPeers = {};
            _this.requestingConnectionToPeers = new Set();
            _this.maxPeers = options.maxPeers || 5;
            if (_this.maxPeers < 2) {
                _this.maxPeers = 2;
            }
            var peerId = options.peerId || randomId();
            if (options.roomId) {
                // pubsub
                _this.tryToBecomeTheRoomHost();
            }
            else {
                _this.peer = new Peer__default["default"](peerId, options.peerJSOptions);
                _this.onOpen();
            }
            return _this;
        }
        Korona.prototype.getOutConnections = function () {
            var _this = this;
            return this.connections.filter(function (connection) {
                return _this.outConns.has(connection.peer);
            });
        };
        Korona.prototype.tryToBecomeTheRoomHost = function () {
            var _a;
            return __awaiter(this, void 0, void 0, function () {
                var oldPeer, extraAction;
                var _this = this;
                return __generator(this, function (_b) {
                    // console.log("* tryToBecomeTheRoomHost");
                    if (!((_a = this._options) === null || _a === void 0 ? void 0 : _a.roomId)) {
                        return [2 /*return*/];
                    }
                    oldPeer = this.peer;
                    extraAction = function (pid) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            // console.log("* room host created", pid);
                            if (oldPeer) {
                                // console.log("* closing old peer: ", oldPeer.id, [...this.network]);
                                this.network.delete(oldPeer.id);
                                oldPeer.destroy();
                            }
                            this.emit("pubsubHostChanged");
                            return [2 /*return*/];
                        });
                    }); };
                    this.peer = new Peer__default["default"](this._options.roomId, this._options.peerJSOptions);
                    this.onOpen(extraAction);
                    this.peer.on("error", function (err) { return __awaiter(_this, void 0, void 0, function () {
                        var peerId, extraAction_1, connection;
                        var _this = this;
                        var _a, _b, _c, _d, _e, _f, _g;
                        return __generator(this, function (_h) {
                            switch (_h.label) {
                                case 0:
                                    if (!(err.type === "unavailable-id")) return [3 /*break*/, 4];
                                    if (!!oldPeer) return [3 /*break*/, 1];
                                    peerId = ((_a = this._options) === null || _a === void 0 ? void 0 : _a.peerId) || randomId();
                                    extraAction_1 = function (pid) { return __awaiter(_this, void 0, void 0, function () {
                                        var _a, _b;
                                        return __generator(this, function (_c) {
                                            switch (_c.label) {
                                                case 0:
                                                    if (!((_a = this._options) === null || _a === void 0 ? void 0 : _a.roomId)) return [3 /*break*/, 2];
                                                    return [4 /*yield*/, this.requestConnection((_b = this._options) === null || _b === void 0 ? void 0 : _b.roomId, pid)];
                                                case 1:
                                                    _c.sent();
                                                    _c.label = 2;
                                                case 2: return [2 /*return*/];
                                            }
                                        });
                                    }); };
                                    this.peer = new Peer__default["default"](peerId, (_b = this._options) === null || _b === void 0 ? void 0 : _b.peerJSOptions);
                                    this.onOpen(extraAction_1);
                                    return [3 /*break*/, 3];
                                case 1:
                                    // Reconnect to room
                                    this.peer = oldPeer;
                                    // this.network = []; // clean up the network
                                    this.network.delete(((_c = this._options) === null || _c === void 0 ? void 0 : _c.roomId) || "");
                                    if (!((_d = this._options) === null || _d === void 0 ? void 0 : _d.roomId)) return [3 /*break*/, 3];
                                    connection = this.connections.find(function (connection) { var _a; return connection.peer === ((_a = _this._options) === null || _a === void 0 ? void 0 : _a.roomId); });
                                    if (connection && connection.open) {
                                        connection.close();
                                        this.connections = this.connections.filter(function (connection) { var _a; return connection.peer !== ((_a = _this._options) === null || _a === void 0 ? void 0 : _a.roomId); });
                                    }
                                    this.inConns.delete((_e = this._options) === null || _e === void 0 ? void 0 : _e.roomId);
                                    this.outConns.delete((_f = this._options) === null || _f === void 0 ? void 0 : _f.roomId);
                                    return [4 /*yield*/, this.connectToPeer((_g = this._options) === null || _g === void 0 ? void 0 : _g.roomId)];
                                case 2:
                                    _h.sent();
                                    _h.label = 3;
                                case 3:
                                    this.emit("pubsubHostChanged");
                                    _h.label = 4;
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); });
                    return [2 /*return*/];
                });
            });
        };
        /**
         * Broadcast data to all peers.
         * @param operation
         * @param from
         * @returns
         */
        Korona.prototype.broadcast = function (operation, from) {
            var _a;
            return __awaiter(this, void 0, void 0, function () {
                var operationJSON, fromPeerId;
                return __generator(this, function (_b) {
                    if (!((_a = this.peer) === null || _a === void 0 ? void 0 : _a.id) || !this.versionVector) {
                        return [2 /*return*/];
                    }
                    if ("_v" in operation) {
                        fromPeerId = operation["_v"]["p"];
                        // Already has Version information
                        operationJSON = JSON.stringify(operation);
                    }
                    else {
                        fromPeerId = this.peer.id;
                        this.versionVector.increment();
                        operationJSON = JSON.stringify(Object.assign(operation, {
                            _v: {
                                // Version
                                p: fromPeerId,
                                c: this.versionVector.localVersion.counter,
                            },
                        }));
                    }
                    this.getOutConnections().forEach(function (conn) {
                        if (fromPeerId !== conn.peer &&
                            (!from || (from.peer !== conn.peer && from.label !== conn.label))) {
                            conn.send(operationJSON);
                        }
                    });
                    return [2 /*return*/];
                });
            });
        };
        /**
         * Send data to a peer.
         */
        Korona.prototype.send = function (peerId, operation) {
            var _a, _b;
            return __awaiter(this, void 0, void 0, function () {
                var operationJSON, fromPeerId, connection;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            if (peerId === ((_a = this.peer) === null || _a === void 0 ? void 0 : _a.id)) {
                                throw new Error("Cannot send to self");
                            }
                            if (!((_b = this.peer) === null || _b === void 0 ? void 0 : _b.id) || !this.versionVector) {
                                return [2 /*return*/];
                            }
                            fromPeerId = this.peer.id;
                            this.versionVector.increment();
                            operationJSON = JSON.stringify(Object.assign(operation, {
                                _v: {
                                    // Version
                                    p: fromPeerId,
                                    c: this.versionVector.localVersion.counter,
                                    s: true,
                                },
                            }));
                            return [4 /*yield*/, this.connectToPeer(peerId)];
                        case 1:
                            connection = _c.sent();
                            if (connection) {
                                connection.send(operationJSON);
                            }
                            return [2 /*return*/];
                    }
                });
            });
        };
        Korona.prototype.onOpen = function (extraAction) {
            var _this = this;
            var _a;
            (_a = this.peer) === null || _a === void 0 ? void 0 : _a.on("open", function (id) { return __awaiter(_this, void 0, void 0, function () {
                var version;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!this.versionVector) {
                                this.versionVector = new VersionVector(id);
                            }
                            else {
                                version = this.versionVector.getVersionFromVectors(id);
                                if (version) {
                                    this.versionVector.setLocalVersion(version);
                                }
                                else {
                                    this.versionVector.setLocalVersion(new Version(id));
                                }
                            }
                            // Code below gives bug
                            this.connections.forEach(function (connection) {
                                // console.log("onOpen close connection", connection.peer);
                                connection.close();
                            });
                            this.connections = [];
                            this.outConns = new Set();
                            this.inConns = new Set();
                            this.forwardedConnectionPeers = {};
                            this.requestingConnectionToPeers = new Set();
                            /*
                            if (this.network.length) {
                              this.network.forEach((peerId) => {
                                if (peerId !== id) {
                                  this.requestConnection(peerId);
                                }
                              });
                            }*/
                            // this.network = [];
                            this.onPeerConnection();
                            this.onError();
                            this.onDisconnected();
                            this.onClose();
                            if (!extraAction) return [3 /*break*/, 2];
                            return [4 /*yield*/, extraAction(id)];
                        case 1:
                            _a.sent();
                            _a.label = 2;
                        case 2:
                            this.emit("open", id);
                            return [4 /*yield*/, this.addToNetwork(id)];
                        case 3:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
        };
        Korona.prototype.connectToPeer = function (peerId) {
            var _this = this;
            return new Promise(function (resolve, reject) {
                var _a, _b;
                // console.log("* connectToPeer", peerId);
                if (((_a = _this.peer) === null || _a === void 0 ? void 0 : _a.id) === peerId) {
                    reject(new Error("Cannot connect to self"));
                }
                var connection = _this.connections.find(function (conn) { return conn.peer === peerId; });
                // console.log("** connection", !!connection);
                if (!connection) {
                    connection = (_b = _this.peer) === null || _b === void 0 ? void 0 : _b.connect(peerId);
                    // console.log("*** create connection: ", !!connection);
                    if (connection) {
                        var helper = function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!connection) return [3 /*break*/, 2];
                                        this.addToOutConns(connection);
                                        return [4 /*yield*/, this.addToNetwork(connection.peer)];
                                    case 1:
                                        _a.sent();
                                        this.registerConnectionEvents(connection);
                                        return [2 /*return*/, resolve(connection)];
                                    case 2: return [2 /*return*/];
                                }
                            });
                        }); };
                        if (connection.open) {
                            helper();
                        }
                        else {
                            connection.on("open", helper);
                        }
                    }
                    else {
                        return reject("connectToPeer failed");
                    }
                }
                else {
                    (function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    this.addToOutConns(connection);
                                    return [4 /*yield*/, this.addToNetwork(peerId)];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/, resolve(connection)];
                            }
                        });
                    }); })();
                }
            });
        };
        Korona.prototype.onPeerConnection = function () {
            var _this = this;
            var _a;
            (_a = this.peer) === null || _a === void 0 ? void 0 : _a.on("connection", function (connection) {
                connection.on("open", function () { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                // console.log("* peer connection opened", connection.peer, this.peer?.id);
                                this.addToInConns(connection);
                                return [4 /*yield*/, this.addToNetwork(connection.peer)];
                            case 1:
                                _a.sent();
                                this.registerConnectionEvents(connection);
                                return [2 /*return*/];
                        }
                    });
                }); });
            });
        };
        Korona.prototype.registerConnectionEvents = function (connection) {
            this.onData(connection);
            this.onConnClose(connection);
            this.onConnError(connection);
            this.onConnIcestateChanged(connection);
        };
        Korona.prototype.onError = function () {
            var _this = this;
            var _a;
            (_a = this.peer) === null || _a === void 0 ? void 0 : _a.on("error", function (err) { return __awaiter(_this, void 0, void 0, function () {
                var pid;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            pid = String(err).replace("Error: Could not connect to peer ", "");
                            return [4 /*yield*/, this.removeFromConnections(pid)];
                        case 1:
                            _b.sent();
                            if (!(!((_a = this.peer) === null || _a === void 0 ? void 0 : _a.disconnected) && !this.hasReachMax())) return [3 /*break*/, 3];
                            return [4 /*yield*/, this.findNewTarget()];
                        case 2:
                            _b.sent();
                            _b.label = 3;
                        case 3:
                            this.emit("error", err);
                            return [2 /*return*/];
                    }
                });
            }); });
        };
        Korona.prototype.onDisconnected = function () {
            var _this = this;
            var _a;
            (_a = this.peer) === null || _a === void 0 ? void 0 : _a.on("disconnected", function () {
                // Disconnected
                _this.emit("disconnected");
            });
        };
        Korona.prototype.onClose = function () {
            var _this = this;
            var _a;
            (_a = this.peer) === null || _a === void 0 ? void 0 : _a.on("close", function () {
                // Close
                _this.emit("close");
            });
        };
        Korona.prototype.onData = function (connection) {
            var _this = this;
            connection.on("data", function (data) { return __awaiter(_this, void 0, void 0, function () {
                var dataObj, fromPeerId, _a;
                var _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            dataObj = {};
                            try {
                                dataObj = JSON.parse(data);
                            }
                            catch (error) {
                                dataObj = {};
                            }
                            fromPeerId = (_b = dataObj["_v"]) === null || _b === void 0 ? void 0 : _b.p;
                            if (!fromPeerId) return [3 /*break*/, 2];
                            return [4 /*yield*/, this.addToNetwork(fromPeerId)];
                        case 1:
                            _c.sent();
                            _c.label = 2;
                        case 2:
                            _a = dataObj.type;
                            switch (_a) {
                                case exports.RequestType.ConnectionRequest: return [3 /*break*/, 3];
                                case exports.RequestType.AddToNetwork: return [3 /*break*/, 5];
                                case exports.RequestType.RemoveFromNetwork: return [3 /*break*/, 7];
                                case exports.RequestType.SyncResponse: return [3 /*break*/, 11];
                                case exports.RequestType.SyncCompleted: return [3 /*break*/, 13];
                            }
                            return [3 /*break*/, 15];
                        case 3: return [4 /*yield*/, this.evaluateConnectionRequest(dataObj.peerId)];
                        case 4:
                            _c.sent();
                            return [3 /*break*/, 17];
                        case 5: return [4 /*yield*/, this.addToNetwork(dataObj.peerId)];
                        case 6:
                            _c.sent();
                            return [3 /*break*/, 17];
                        case 7:
                            if (!(dataObj.peerId !== fromPeerId)) return [3 /*break*/, 9];
                            return [4 /*yield*/, this.removeFromNetwork(dataObj.peerId)];
                        case 8:
                            _c.sent();
                            return [3 /*break*/, 10];
                        case 9: 
                        // Needs to add this, otherwise will cause infinite loop
                        throw new Error("Cannot remove self from network");
                        case 10: return [3 /*break*/, 17];
                        case 11: return [4 /*yield*/, this.handleSyncResponse(dataObj)];
                        case 12:
                            _c.sent();
                            return [3 /*break*/, 17];
                        case 13: return [4 /*yield*/, this.handleSyncCompleted(dataObj)];
                        case 14:
                            _c.sent();
                            return [3 /*break*/, 17];
                        case 15: return [4 /*yield*/, this.handleRemoteOperation(dataObj, connection)];
                        case 16:
                            _c.sent();
                            _c.label = 17;
                        case 17: return [2 /*return*/];
                    }
                });
            }); });
        };
        Korona.prototype._closeConnection = function (connection) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: 
                        // console.log("* closing connection", connection.peer);
                        return [4 /*yield*/, this.removeFromConnections(connection.peer)];
                        case 1:
                            // console.log("* closing connection", connection.peer);
                            _a.sent();
                            if (!!this.hasReachMax()) return [3 /*break*/, 3];
                            return [4 /*yield*/, this.findNewTarget()];
                        case 2:
                            _a.sent();
                            _a.label = 3;
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        Korona.prototype.onConnClose = function (connection) {
            var _this = this;
            connection.on("close", function () { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: 
                        // console.log("* connection closed", connection.peer);
                        return [4 /*yield*/, this._closeConnection(connection)];
                        case 1:
                            // console.log("* connection closed", connection.peer);
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
        };
        Korona.prototype.onConnError = function (connection) {
            connection.on("error", function (error) {
                console.error("* connection error: ", connection, error);
            });
        };
        Korona.prototype.onConnIcestateChanged = function (connection) {
            var _this = this;
            connection.on("iceStateChanged", function (state) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!(state === "closed" ||
                                state === "failed" ||
                                state === "disconnected")) return [3 /*break*/, 2];
                            return [4 /*yield*/, this._closeConnection(connection)];
                        case 1:
                            _a.sent();
                            _a.label = 2;
                        case 2: return [2 /*return*/];
                    }
                });
            }); });
        };
        Korona.prototype.evaluateConnectionRequest = function (peerId) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!this.hasReachMax()) return [3 /*break*/, 2];
                            return [4 /*yield*/, this.forwardConnRequest(peerId)];
                        case 1:
                            _a.sent();
                            return [3 /*break*/, 4];
                        case 2: return [4 /*yield*/, this.acceptConnRequest(peerId)];
                        case 3:
                            _a.sent();
                            _a.label = 4;
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        Korona.prototype.forwardConnRequest = function (peerId) {
            return __awaiter(this, void 0, void 0, function () {
                var connected, randomIdx;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            connected = this.getOutConnections().filter(function (conn) {
                                return conn.peer !== peerId &&
                                    (!_this.forwardedConnectionPeers[peerId] ||
                                        !_this.forwardedConnectionPeers[peerId].has(conn.peer));
                            });
                            if (!(connected.length > 0)) return [3 /*break*/, 2];
                            randomIdx = Math.floor(Math.random() * connected.length);
                            /* console.log(
                              "** can forward: ",
                              connected[randomIdx].peer,
                              connected.length
                            );*/
                            connected[randomIdx].send(JSON.stringify({
                                type: exports.RequestType.ConnectionRequest,
                                peerId: peerId,
                            }));
                            return [4 /*yield*/, this.addToNetwork(peerId)];
                        case 1:
                            _a.sent();
                            if (this.forwardedConnectionPeers[peerId]) {
                                this.forwardedConnectionPeers[peerId].add(connected[randomIdx].peer);
                            }
                            else {
                                this.forwardedConnectionPeers[peerId] = new Set([
                                    connected[randomIdx].peer,
                                ]);
                            }
                            return [3 /*break*/, 4];
                        case 2: 
                        // console.log("** can't forward");
                        return [4 /*yield*/, this.acceptConnRequest(peerId)];
                        case 3:
                            // console.log("** can't forward");
                            _a.sent();
                            _a.label = 4;
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        Korona.prototype.acceptConnRequest = function (peerId) {
            var _a, _b;
            return __awaiter(this, void 0, void 0, function () {
                var connection, initialData;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            if (!(peerId !== ((_a = this.peer) === null || _a === void 0 ? void 0 : _a.id))) return [3 /*break*/, 2];
                            return [4 /*yield*/, this.connectToPeer(peerId)];
                        case 1:
                            connection = _c.sent();
                            if (connection) {
                                initialData = JSON.stringify({
                                    type: exports.RequestType.SyncResponse,
                                    peerId: (_b = this.peer) === null || _b === void 0 ? void 0 : _b.id,
                                    network: Array.from(this.network),
                                });
                                connection.send(initialData);
                            }
                            _c.label = 2;
                        case 2: return [2 /*return*/];
                    }
                });
            });
        };
        Korona.prototype.addToNetwork = function (peerId, timestamp) {
            var _a;
            if (timestamp === void 0) { timestamp = Date.now(); }
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!!this.network.has(peerId)) return [3 /*break*/, 3];
                            // console.log("* addToNetwork: ", peerId, Array.from(this.network));
                            this.network.add(peerId);
                            this.emit("peerJoined", peerId);
                            return [4 /*yield*/, this.broadcast({
                                    type: exports.RequestType.AddToNetwork,
                                    peerId: peerId,
                                    timestamp: timestamp,
                                })];
                        case 1:
                            _b.sent();
                            this.networkTimestamps[peerId] = timestamp;
                            if (!(!this.hasReachMax() && peerId !== ((_a = this.peer) === null || _a === void 0 ? void 0 : _a.id))) return [3 /*break*/, 3];
                            return [4 /*yield*/, this.findNewTarget()];
                        case 2:
                            _b.sent();
                            _b.label = 3;
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        Korona.prototype.removeFromConnections = function (peerId) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            // console.log("* removeFromConections: ", peerId);
                            this.connections = this.connections.filter(function (conn) { return conn.peer !== peerId; });
                            this.inConns.delete(peerId);
                            this.outConns.delete(peerId);
                            delete this.forwardedConnectionPeers[peerId];
                            return [4 /*yield*/, this.removeFromNetwork(peerId)];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        };
        Korona.prototype.removeFromNetwork = function (peerId, timestamp) {
            var _a, _b, _c, _d;
            if (timestamp === void 0) { timestamp = Date.now(); }
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_e) {
                    switch (_e.label) {
                        case 0:
                            if (!(this.network.has(peerId) &&
                                timestamp > (this.networkTimestamps[peerId] || 0))) return [3 /*break*/, 2];
                            // console.log("* removeFromNetwork: ", peerId, Array.from(this.network));
                            this.network.delete(peerId);
                            this.emit("peerLeft", peerId);
                            return [4 /*yield*/, this.broadcast({
                                    type: exports.RequestType.RemoveFromNetwork,
                                    peerId: peerId,
                                    timestamp: timestamp,
                                })];
                        case 1:
                            _e.sent();
                            _e.label = 2;
                        case 2:
                            if (!(((_a = this._options) === null || _a === void 0 ? void 0 : _a.roomId) &&
                                ((_b = this.peer) === null || _b === void 0 ? void 0 : _b.id) !== ((_c = this._options) === null || _c === void 0 ? void 0 : _c.roomId) &&
                                peerId === ((_d = this._options) === null || _d === void 0 ? void 0 : _d.roomId))) return [3 /*break*/, 4];
                            return [4 /*yield*/, this.tryToBecomeTheRoomHost()];
                        case 3:
                            _e.sent();
                            _e.label = 4;
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        Korona.prototype.hasReachMax = function () {
            return this.connections.length > this.maxPeers;
            /*
            const halfTheNetwork = Math.ceil(this.network.size / 2);
            const tooManyInConns =
              this.inConns.size > Math.max(halfTheNetwork, this.maxPeers);
            const tooManyOutConns =
              this.outConns.size > Math.max(halfTheNetwork, this.maxPeers);
        
            return tooManyInConns || tooManyOutConns;
            */
        };
        Korona.prototype.findNewTarget = function () {
            var _a;
            return __awaiter(this, void 0, void 0, function () {
                var unconnected, possibleTargets, randomIdx, newTarget;
                var _this = this;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            unconnected = Array.from(this.network).filter(function (peerId) { return !_this.outConns.has(peerId); });
                            possibleTargets = unconnected.filter(function (peerId) { var _a; return peerId !== ((_a = _this.peer) === null || _a === void 0 ? void 0 : _a.id); });
                            if (!(possibleTargets.length === 0)) return [3 /*break*/, 1];
                            return [3 /*break*/, 3];
                        case 1:
                            randomIdx = Math.floor(Math.random() * possibleTargets.length);
                            newTarget = possibleTargets[randomIdx];
                            if (!((_a = this.peer) === null || _a === void 0 ? void 0 : _a.id)) return [3 /*break*/, 3];
                            return [4 /*yield*/, this.connectToPeer(newTarget)];
                        case 2:
                            _b.sent();
                            _b.label = 3;
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        Korona.prototype.requestConnection = function (targetPeerId, peerId) {
            var _a;
            return __awaiter(this, void 0, void 0, function () {
                var connection, dataToSend;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!peerId) {
                                peerId = (_a = this.peer) === null || _a === void 0 ? void 0 : _a.id;
                            }
                            if (!peerId) {
                                throw new Error("requestConnection: peerId is required");
                            }
                            if (peerId === targetPeerId) {
                                throw new Error("requestConnection: peerId cannot be the same");
                            }
                            if (this.connections.find(function (conn) { return conn.peer === targetPeerId; })) {
                                // NOTE: already connected
                                return [2 /*return*/];
                            }
                            if (!this.requestingConnectionToPeers.has(targetPeerId)) return [3 /*break*/, 1];
                            // console.log("* requestConnection: already requesting: ", targetPeerId);
                            return [2 /*return*/];
                        case 1:
                            this.requestingConnectionToPeers.add(targetPeerId);
                            return [4 /*yield*/, this.connectToPeer(targetPeerId)];
                        case 2:
                            connection = _b.sent();
                            dataToSend = JSON.stringify({
                                type: exports.RequestType.ConnectionRequest,
                                peerId: peerId,
                            });
                            this.requestingConnectionToPeers.delete(targetPeerId);
                            connection.send(dataToSend);
                            _b.label = 3;
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        Korona.prototype.addToInConns = function (connection) {
            if (!!connection && !this._isAlreadyConnectedIn(connection)) {
                this.inConns.add(connection.peer);
                this._addToConnection(connection);
            }
        };
        Korona.prototype.addToOutConns = function (connection) {
            if (!!connection && !this._isAlreadyConnectedOut(connection)) {
                this.outConns.add(connection.peer);
                this._addToConnection(connection);
            }
        };
        Korona.prototype._addToConnection = function (connection) {
            if (!!connection &&
                !this.connections.find(function (conn) {
                    return conn.label === connection.label && conn.peer === connection.peer;
                })) {
                this.connections.push(connection);
            }
        };
        Korona.prototype._isAlreadyConnectedOut = function (connection) {
            return this.outConns.has(connection.peer);
        };
        Korona.prototype._isAlreadyConnectedIn = function (connection) {
            return this.inConns.has(connection.peer);
        };
        Korona.prototype.handleRemoteOperation = function (operation, connection) {
            var _a;
            return __awaiter(this, void 0, void 0, function () {
                var v;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            v = operation._v;
                            if (!(v &&
                                "p" in v &&
                                "c" in v &&
                                v.p !== ((_a = this.peer) === null || _a === void 0 ? void 0 : _a.id) && // Can't send message back to the sender
                                this.versionVector &&
                                !this.versionVector.hasBeenApplied(new Version(v.p, v.c)))) return [3 /*break*/, 3];
                            this.versionVector.update(new Version(v.p, v.c));
                            if (!!("s" in v)) return [3 /*break*/, 2];
                            return [4 /*yield*/, this.broadcast(operation, connection)];
                        case 1:
                            _b.sent();
                            _b.label = 2;
                        case 2:
                            this.emit("data", operation);
                            _b.label = 3;
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        Korona.prototype.handleSyncResponse = function (operation) {
            var _a, _b;
            return __awaiter(this, void 0, void 0, function () {
                var fromPeerId, network, connection, completedMessage;
                var _this = this;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            fromPeerId = operation.peerId;
                            if (!(fromPeerId !== ((_a = this.peer) === null || _a === void 0 ? void 0 : _a.id))) return [3 /*break*/, 3];
                            network = operation.network || [];
                            return [4 /*yield*/, Promise.all(Array.from(network).map(function (peerId) { return _this.addToNetwork(peerId); }))];
                        case 1:
                            _c.sent();
                            return [4 /*yield*/, this.connectToPeer(fromPeerId)];
                        case 2:
                            connection = _c.sent();
                            completedMessage = JSON.stringify({
                                type: exports.RequestType.SyncCompleted,
                                peerId: (_b = this.peer) === null || _b === void 0 ? void 0 : _b.id,
                            });
                            connection.send(completedMessage);
                            _c.label = 3;
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        Korona.prototype.handleSyncCompleted = function (operation) {
            var _a, _b;
            return __awaiter(this, void 0, void 0, function () {
                var fromPeerId, connection_1;
                var _this = this;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            fromPeerId = operation.peerId;
                            if (!(fromPeerId !== ((_a = this.peer) === null || _a === void 0 ? void 0 : _a.id))) return [3 /*break*/, 2];
                            (_b = this.versionVector) === null || _b === void 0 ? void 0 : _b.increment();
                            return [4 /*yield*/, this.connectToPeer(fromPeerId)];
                        case 1:
                            connection_1 = _c.sent();
                            this.emit("sync", function (data) {
                                var _a, _b;
                                var dataToSend = JSON.stringify(Object.assign(data || {}, {
                                    _v: {
                                        p: (_a = _this.peer) === null || _a === void 0 ? void 0 : _a.id,
                                        c: (_b = _this.versionVector) === null || _b === void 0 ? void 0 : _b.localVersion.counter,
                                    },
                                }));
                                connection_1.send(dataToSend);
                            }, fromPeerId);
                            _c.label = 2;
                        case 2: return [2 /*return*/];
                    }
                });
            });
        };
        Korona.prototype.isPubSubHost = function () {
            var _a, _b, _c;
            return (((_a = this._options) === null || _a === void 0 ? void 0 : _a.roomId) !== undefined &&
                ((_b = this.peer) === null || _b === void 0 ? void 0 : _b.id) === ((_c = this._options) === null || _c === void 0 ? void 0 : _c.roomId));
        };
        Object.defineProperty(Korona.prototype, "id", {
            get: function () {
                var _a;
                return (_a = this.peer) === null || _a === void 0 ? void 0 : _a.id;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(Korona.prototype, "disconnected", {
            /**
             * `false` if there is an active connection to the PeerServer.
             */
            get: function () {
                var _a;
                return !this.peer || ((_a = this.peer) === null || _a === void 0 ? void 0 : _a.disconnected);
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(Korona.prototype, "destroyed", {
            /**
             * `true` if this peer and all of its connections can no longer be used.
             */
            get: function () {
                var _a;
                return !this.peer || ((_a = this.peer) === null || _a === void 0 ? void 0 : _a.destroyed);
            },
            enumerable: false,
            configurable: true
        });
        /**
         * Close the connection to the server, leaving all existing data and media connections intact.
         * `peer.disconnected` will be set to true and the disconnected event will fire.
         *
         * This cannot be undone; the respective peer object will no longer be able to create or receive any connections and its ID will be forfeited on the (cloud) server.
         */
        Korona.prototype.disconnect = function () {
            var _a;
            return (_a = this.peer) === null || _a === void 0 ? void 0 : _a.disconnect();
        };
        /**
         * Attempt to reconnect to the server with the peer's old ID. Only disconnected peers can be reconnected. Destroyed peers cannot be reconnected. If the connection fails (as an example, if the peer's old ID is now taken), the peer's existing connections will not close, but any associated errors events will fire.
         */
        Korona.prototype.reconnect = function () {
            var _a;
            return (_a = this.peer) === null || _a === void 0 ? void 0 : _a.reconnect();
        };
        /**
         * Close the connection to the server and terminate all existing connections. `peer.destroyed` will be set to true.
         */
        Korona.prototype.destroy = function () {
            var _a;
            return (_a = this.peer) === null || _a === void 0 ? void 0 : _a.destroy();
        };
        return Korona;
    }(EventEmitter__default["default"]));

    exports.Korona = Korona;
    exports.randomId = randomId;

    Object.defineProperty(exports, '__esModule', { value: true });

}));
