import Peer from "peerjs";
import VersionVector from "./versionVector";
import Version from "./version";

export function randomID() {
  return Math.random()
    .toString(36)
    .substr(2, 9);
}

export interface KoronaOptions {
  peerID: string;
  peerJSOptions: Peer.PeerJSOption;
  maxPeers?: number;
  onOpen?: () => void;
  // onConnection?: (connection: Peer.DataConnection) => void;
  onData?: (data: any, connection: Peer.DataConnection) => void;
  onDisconnected?: () => void;
  onPeerJoined?: (peerID: string) => void;
  onPeerLeft?: (peerID: string) => void;
  createDataForInitialSync?: () => object;
}

export enum RequestType {
  ConnectionRequest = "cr",
  RemoveFromNetwork = "rfn",
  AddToNetwork = "adn",
  SyncResponse = "sr",
  SyncCompleted = "sc"
}

export class Korona {
  private peer: Peer;
  private outConns: Peer.DataConnection[];
  private inConns: Peer.DataConnection[];
  private maxPeers: number;
  private versionVector: VersionVector;
  private _onOpen?: () => void;
  private _onDisconnected: () => void;
  private _onData: (data: any, connection: Peer.DataConnection) => void;
  private _onPeerJoined: (peerID: string) => void;
  private _onPeerLeft: (peerID: string) => void;
  private _createDataForInitialSync?: () => object;

  /**
   * List of peer IDs
   */
  public network: string[];

  constructor(options: KoronaOptions) {
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
      this._createDataForInitialSync = () => {
        return {};
      };
    }

    const peerID = options.peerID || randomID();
    this.peer = new Peer(peerID, options.peerJSOptions);
    this.onOpen();
  }

  send(operation: object) {
    let operationJSON: any;
    if ("_v" in operation) {
      // Already has Version information
      operationJSON = JSON.stringify(operation);
    } else {
      this.versionVector.increment();
      operationJSON = JSON.stringify(
        Object.assign(operation, {
          _v: {
            // Version
            p: this.peer.id,
            c: this.versionVector.localVersion.counter
          }
        })
      );
    }

    this.outConns.forEach(conn => conn.send(operationJSON));
  }

  onOpen() {
    this.peer.on("open", id => {
      this.versionVector = new VersionVector(id);

      this.onPeerConnection();
      this.onError();
      this.onDisconnect();

      this.addToNetwork(id);
      if (this._onOpen) {
        this._onOpen();
      }
    });
  }

  onPeerConnection() {
    this.peer.on("connection", connection => {
      this.onConnection(connection);
      this.onData(connection);
      this.onConnClose(connection);
    });
  }
  onConnection(connection: Peer.DataConnection) {
    this.addToInConns(connection);
  }
  onError() {
    this.peer.on("error", err => {
      const pid = String(err).replace("Error: Could not connect to peer ", "");
      this.removeFromConnections(pid);
      if (!this.peer.disconnected) {
        this.findNewTarget();
      }
    });
  }
  onDisconnect() {
    this.peer.on("disconnected", () => {
      // Disconnected
      if (this._onDisconnected) {
        this._onDisconnected();
      }
    });
  }
  onData(connection: Peer.DataConnection) {
    connection.on("data", data => {
      let dataObj: any = {};

      try {
        dataObj = JSON.parse(data);
      } catch (error) {
        dataObj = {};
      }

      switch (dataObj.type) {
        case RequestType.ConnectionRequest:
          this.evaluateRequest(dataObj.peerID);
          break;
        case RequestType.AddToNetwork:
          this.addToNetwork(dataObj.newPeer);
          break;
        case RequestType.RemoveFromNetwork:
          this.removeFromNetwork(dataObj.oldPeer);
          break;
        case RequestType.SyncResponse:
          this.handleSyncResponse(dataObj);
          break;
        case RequestType.SyncCompleted:
          this.handleSyncCompleted(dataObj);
          break;
        default:
          this.handleRemoteOperation(dataObj, connection);
      }
    });
  }
  onConnClose(connection: Peer.DataConnection) {
    connection.on("close", () => {
      this.removeFromConnections(connection.peer);
      if (!this.hasReachMax()) {
        this.findNewTarget();
      }
    });
  }

  evaluateRequest(peerID: string) {
    if (this.hasReachMax()) {
      this.forwardConnRequest(peerID);
    } else {
      this.acceptConnRequest(peerID);
    }
  }

  forwardConnRequest(peerID: string) {
    const connected = this.outConns.filter(conn => conn.peer !== peerID);
    const randomIdx = Math.floor(Math.random() * connected.length);
    connected[randomIdx].send(
      JSON.stringify({
        type: RequestType.ConnectionRequest,
        peerID: peerID
      })
    );
  }

  acceptConnRequest(peerID: string) {
    const connBack = this.peer.connect(peerID);
    this.addToOutConns(connBack);
    this.addToNetwork(peerID);

    const initialData: any = JSON.stringify({
      type: RequestType.SyncResponse,
      peerID: this.peer.id,
      network: this.network
    });

    if (connBack.open) {
      connBack.send(initialData);
    } else {
      connBack.on("open", () => {
        connBack.send(initialData);
      });
    }
  }

  addToNetwork(peerID: string) {
    if (!this.network.find(p => p === peerID)) {
      this.network.push(peerID);
      if (this._onPeerJoined) {
        this._onPeerJoined(peerID);
      }

      this.send({
        type: RequestType.AddToNetwork,
        newPeer: peerID
      });
    }
  }

  removeFromConnections(peerID: string) {
    this.inConns = this.inConns.filter(conn => conn.peer !== peerID);
    this.outConns = this.outConns.filter(conn => conn.peer !== peerID);
    this.removeFromNetwork(peerID);
  }

  removeFromNetwork(peerID: string) {
    const idx = this.network.indexOf(peerID);
    if (idx >= 0) {
      this.network.splice(idx, 1);
      if (this._onPeerLeft) {
        this._onPeerLeft(peerID);
      }

      this.send({
        type: RequestType.RemoveFromNetwork,
        oldPeer: peerID
      });
    }
  }

  hasReachMax(): boolean {
    const halfTheNetwork = Math.ceil(this.network.length / 2);
    const tooManyInConns =
      this.inConns.length > Math.max(halfTheNetwork, this.maxPeers);
    const tooManyOutConns =
      this.outConns.length > Math.max(halfTheNetwork, this.maxPeers);

    return tooManyInConns || tooManyOutConns;
  }

  findNewTarget() {
    const connected = this.outConns.map(conn => conn.peer);
    const unconnected = this.network.filter(
      peerID => connected.indexOf(peerID) === -1
    );
    const possibleTargets = unconnected.filter(
      peerID => peerID !== this.peer.id
    );

    if (possibleTargets.length === 0) {
      // NOTE: no targets found
    } else {
      const randomIdx = Math.floor(Math.random() * possibleTargets.length);
      const newTarget = possibleTargets[randomIdx];
      this.requestConnection(newTarget, this.peer.id);
    }
  }

  requestConnection(targetPeerID: string, peerID: string = "") {
    if (!peerID) {
      peerID = this.peer.id;
    }

    const conn = this.peer.connect(targetPeerID);
    this.addToOutConns(conn);

    const dataToSend = JSON.stringify({
      type: RequestType.ConnectionRequest,
      peerID: peerID
    });
    if (conn.open) {
      conn.send(dataToSend);
    } else {
      conn.on("open", () => {
        conn.send(dataToSend);
      });
    }
  }

  addToInConns(connection: Peer.DataConnection) {
    if (!!connection && !this.isAlreadyConnectedIn(connection)) {
      this.inConns.push(connection);
    }
  }

  addToOutConns(connection: Peer.DataConnection) {
    if (!!connection && !this.isAlreadyConnectedOut(connection)) {
      this.outConns.push(connection);
    }
  }

  isAlreadyConnectedOut(connection: Peer.DataConnection) {
    return !!this.outConns.find(conn => conn.peer === connection.peer);
  }

  isAlreadyConnectedIn(connection: Peer.DataConnection) {
    return !!this.inConns.find(conn => conn.peer === connection.peer);
  }

  handleRemoteOperation(operation: any, connection: Peer.DataConnection) {
    const v = operation._v;
    if (
      v &&
      "p" in v &&
      "c" in v &&
      v.p !== this.peer.id && // Can't send message back to the sender
      !this.versionVector.hasBeenApplied(new Version(v.p, v.c))
    ) {
      this.versionVector.update(new Version(v.p, v.c));

      this.send(operation);
      if (this._onData) {
        this._onData(operation, connection);
      }
    }
  }

  handleSyncResponse(operation: any) {
    const fromPeerID = operation.peerID;
    const network: string[] = operation.network || [];
    network.forEach(peerID => this.addToNetwork(peerID));

    // Sync complete
    const completedMessage = JSON.stringify({
      type: RequestType.SyncCompleted,
      peerID: this.peer.id
    });

    let connection = this.outConns.find(conn => conn.peer === fromPeerID);
    if (connection) {
      connection.send(completedMessage);
    } else {
      connection = this.peer.connect(fromPeerID);
      this.addToOutConns(connection);
      if (connection.open) {
        connection.send(completedMessage);
      } else {
        connection.on("open", () => {
          connection.send(completedMessage);
        });
      }
    }
  }

  handleSyncCompleted(operation: any) {
    const fromPeerID = operation.peerID;
    this.versionVector.increment();
    let connection = this.outConns.find(conn => conn.peer === fromPeerID);
    const dataToSend = JSON.stringify(
      Object.assign(this._createDataForInitialSync(), {
        _v: {
          p: this.peer.id,
          c: this.versionVector.localVersion.counter
        }
      })
    );
    if (connection) {
      connection.send(dataToSend);
    } else {
      connection = this.peer.connect(fromPeerID);
      this.addToOutConns(connection);
      if (connection.open) {
        connection.send(dataToSend);
      } else {
        connection.on("open", () => {
          connection.send(dataToSend);
        });
      }
    }
  }
}
