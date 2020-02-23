(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('peerjs')) :
  typeof define === 'function' && define.amd ? define(['exports', 'peerjs'], factory) :
  (global = global || self, factory(global.Korona = {}, global.Peer));
}(this, (function (exports, Peer) { 'use strict';

  Peer = Peer && Peer.hasOwnProperty('default') ? Peer['default'] : Peer;

  var Version = /** @class */ (function () {
      function Version(peerID, counter) {
          if (counter === void 0) { counter = 0; }
          this.peerID = peerID;
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
      function VersionVector(peerID) {
          this.localVersion = new Version(peerID);
          this.versions = [this.localVersion];
      }
      VersionVector.prototype.increment = function () {
          this.localVersion.counter++;
      };
      // Update vector with new version received from another site
      VersionVector.prototype.update = function (incomingVersion) {
          var existingVersion = this.getVersionFromVectors(incomingVersion);
          if (!existingVersion) {
              var newVersion = new Version(incomingVersion.peerID);
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
              if (this.versions[i].peerID === version.peerID) {
                  localVersion = this.versions[i];
                  break;
              }
          }
          return localVersion;
      };
      VersionVector.prototype.getLocalVersion = function () {
          var localVersion = new Version(this.localVersion.peerID);
          localVersion.counter = this.localVersion.counter;
          return localVersion;
      };
      return VersionVector;
  }());

  function randomID() {
      return Math.random()
          .toString(36)
          .substr(2, 9);
  }
  (function (RequestType) {
      RequestType["ConnectionRequest"] = "cr";
      RequestType["RemoveFromNetwork"] = "rfn";
      RequestType["AddToNetwork"] = "adn";
      RequestType["SyncResponse"] = "sr";
      RequestType["SyncCompleted"] = "sc";
  })(exports.RequestType || (exports.RequestType = {}));
  var Korona = /** @class */ (function () {
      function Korona(options) {
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
          var peerID = options.peerID || randomID();
          this.peer = new Peer(peerID, options.peerJSOptions);
          this.onOpen();
      }
      Korona.prototype.send = function (operation) {
          var operationJSON;
          var fromPeerID;
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
                      c: this.versionVector.localVersion.counter
                  }
              }));
          }
          this.outConns.forEach(function (conn) {
              if (fromPeerID !== conn.peer) {
                  conn.send(operationJSON);
              }
          });
      };
      Korona.prototype.onOpen = function () {
          var _this = this;
          this.peer.on("open", function (id) {
              _this.versionVector = new VersionVector(id);
              _this.onPeerConnection();
              _this.onError();
              _this.onDisconnect();
              _this.addToNetwork(id);
              if (_this._onOpen) {
                  _this._onOpen();
              }
          });
      };
      Korona.prototype.onPeerConnection = function () {
          var _this = this;
          this.peer.on("connection", function (connection) {
              _this.onConnection(connection);
              _this.onData(connection);
              _this.onConnClose(connection);
          });
      };
      Korona.prototype.onConnection = function (connection) {
          this.addToInConns(connection);
      };
      Korona.prototype.onError = function () {
          var _this = this;
          this.peer.on("error", function (err) {
              var pid = String(err).replace("Error: Could not connect to peer ", "");
              _this.removeFromConnections(pid);
              if (!_this.peer.disconnected) {
                  _this.findNewTarget();
              }
          });
      };
      Korona.prototype.onDisconnect = function () {
          var _this = this;
          this.peer.on("disconnected", function () {
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
                      _this.evaluateRequest(dataObj.peerID);
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
              _this.removeFromConnections(connection.peer);
              if (!_this.hasReachMax()) {
                  _this.findNewTarget();
              }
          });
      };
      Korona.prototype.evaluateRequest = function (peerID) {
          if (this.hasReachMax()) {
              this.forwardConnRequest(peerID);
          }
          else {
              this.acceptConnRequest(peerID);
          }
      };
      Korona.prototype.forwardConnRequest = function (peerID) {
          var connected = this.outConns.filter(function (conn) { return conn.peer !== peerID; });
          var randomIdx = Math.floor(Math.random() * connected.length);
          connected[randomIdx].send(JSON.stringify({
              type: exports.RequestType.ConnectionRequest,
              peerID: peerID
          }));
      };
      Korona.prototype.acceptConnRequest = function (peerID) {
          var connBack = this.peer.connect(peerID);
          this.addToOutConns(connBack);
          this.addToNetwork(peerID);
          var initialData = JSON.stringify({
              type: exports.RequestType.SyncResponse,
              peerID: this.peer.id,
              network: this.network
          });
          if (connBack.open) {
              connBack.send(initialData);
          }
          else {
              connBack.on("open", function () {
                  connBack.send(initialData);
              });
          }
      };
      Korona.prototype.addToNetwork = function (peerID) {
          if (!this.network.find(function (p) { return p === peerID; })) {
              this.network.push(peerID);
              if (this._onPeerJoined) {
                  this._onPeerJoined(peerID);
              }
              this.send({
                  type: exports.RequestType.AddToNetwork,
                  newPeer: peerID
              });
          }
      };
      Korona.prototype.removeFromConnections = function (peerID) {
          this.inConns = this.inConns.filter(function (conn) { return conn.peer !== peerID; });
          this.outConns = this.outConns.filter(function (conn) { return conn.peer !== peerID; });
          this.removeFromNetwork(peerID);
      };
      Korona.prototype.removeFromNetwork = function (peerID) {
          var idx = this.network.indexOf(peerID);
          if (idx >= 0) {
              this.network.splice(idx, 1);
              if (this._onPeerLeft) {
                  this._onPeerLeft(peerID);
              }
              this.send({
                  type: exports.RequestType.RemoveFromNetwork,
                  oldPeer: peerID
              });
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
          var connected = this.outConns.map(function (conn) { return conn.peer; });
          var unconnected = this.network.filter(function (peerID) { return connected.indexOf(peerID) === -1; });
          var possibleTargets = unconnected.filter(function (peerID) { return peerID !== _this.peer.id; });
          if (possibleTargets.length === 0) ;
          else {
              var randomIdx = Math.floor(Math.random() * possibleTargets.length);
              var newTarget = possibleTargets[randomIdx];
              this.requestConnection(newTarget, this.peer.id);
          }
      };
      Korona.prototype.requestConnection = function (targetPeerID, peerID) {
          if (peerID === void 0) { peerID = ""; }
          if (!peerID) {
              peerID = this.peer.id;
          }
          var conn = this.peer.connect(targetPeerID);
          this.addToOutConns(conn);
          var dataToSend = JSON.stringify({
              type: exports.RequestType.ConnectionRequest,
              peerID: peerID
          });
          if (conn.open) {
              conn.send(dataToSend);
          }
          else {
              conn.on("open", function () {
                  conn.send(dataToSend);
              });
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
          return !!this.outConns.find(function (conn) { return conn.peer === connection.peer; });
      };
      Korona.prototype.isAlreadyConnectedIn = function (connection) {
          return !!this.inConns.find(function (conn) { return conn.peer === connection.peer; });
      };
      Korona.prototype.handleRemoteOperation = function (operation, connection) {
          var v = operation._v;
          if (v &&
              "p" in v &&
              "c" in v &&
              v.p !== this.peer.id && // Can't send message back to the sender
              !this.versionVector.hasBeenApplied(new Version(v.p, v.c))) {
              this.versionVector.update(new Version(v.p, v.c));
              this.send(operation);
              if (this._onData) {
                  this._onData(operation, connection);
              }
          }
      };
      Korona.prototype.handleSyncResponse = function (operation) {
          var _this = this;
          var fromPeerID = operation.peerID;
          var network = operation.network || [];
          network.forEach(function (peerID) { return _this.addToNetwork(peerID); });
          // Sync complete
          var completedMessage = JSON.stringify({
              type: exports.RequestType.SyncCompleted,
              peerID: this.peer.id
          });
          var connection = this.outConns.find(function (conn) { return conn.peer === fromPeerID; });
          if (connection) {
              connection.send(completedMessage);
          }
          else {
              connection = this.peer.connect(fromPeerID);
              this.addToOutConns(connection);
              if (connection.open) {
                  connection.send(completedMessage);
              }
              else {
                  connection.on("open", function () {
                      connection.send(completedMessage);
                  });
              }
          }
      };
      Korona.prototype.handleSyncCompleted = function (operation) {
          var fromPeerID = operation.peerID;
          this.versionVector.increment();
          var connection = this.outConns.find(function (conn) { return conn.peer === fromPeerID; });
          var dataToSend = JSON.stringify(Object.assign(this._createDataForInitialSync(), {
              _v: {
                  p: this.peer.id,
                  c: this.versionVector.localVersion.counter
              }
          }));
          if (connection) {
              connection.send(dataToSend);
          }
          else {
              connection = this.peer.connect(fromPeerID);
              this.addToOutConns(connection);
              if (connection.open) {
                  connection.send(dataToSend);
              }
              else {
                  connection.on("open", function () {
                      connection.send(dataToSend);
                  });
              }
          }
      };
      return Korona;
  }());

  exports.Korona = Korona;
  exports.randomID = randomID;

  Object.defineProperty(exports, '__esModule', { value: true });

})));
