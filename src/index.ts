import Peer, { PeerJSOption, DataConnection } from "peerjs";
import VersionVector from "./versionVector";
import Version from "./version";

export function randomID() {
  return Math.random().toString(36).substr(2, 9);
}

export interface KoronaOptions {
  peerId: string;
  peerJSOptions: PeerJSOption;
  maxPeers?: number;
  onOpen?: () => void;
  // onConnection?: (connection: Peer.DataConnection) => void;
  onData?: (data: any, connection: DataConnection) => void;
  onDisconnected?: () => void;
  onPeerJoined?: (peerId: string) => void;
  onPeerLeft?: (peerId: string) => void;
  createDataForInitialSync?: () => object;
}

export enum RequestType {
  ConnectionRequest = "cr",
  RemoveFromNetwork = "rfn",
  AddToNetwork = "adn",
  SyncResponse = "sr",
  SyncCompleted = "sc",
}

export class Korona {
  private peer: Peer;
  private outConns: DataConnection[];
  private inConns: DataConnection[];
  private maxPeers: number;
  private versionVector: VersionVector;
  private _onOpen?: () => void;
  private _onDisconnected: () => void;
  private _onData: (data: any, connection: DataConnection) => void;
  private _onPeerJoined: (peerId: string) => void;
  private _onPeerLeft: (peerId: string) => void;
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

    const peerId = options.peerId || randomID();
    this.peer = new Peer(peerId, options.peerJSOptions);
    this.onOpen();
  }

  send(operation: object) {
    let operationJSON: any;
    let fromPeerID: string;
    if ("_v" in operation) {
      fromPeerID = (operation as any)["_v"]["p"];
      // Already has Version information
      operationJSON = JSON.stringify(operation);
    } else {
      fromPeerID = this.peer.id;
      this.versionVector.increment();
      operationJSON = JSON.stringify(
        Object.assign(operation, {
          _v: {
            // Version
            p: fromPeerID,
            c: this.versionVector.localVersion.counter,
          },
        })
      );
    }

    this.outConns.forEach((conn) => {
      if (fromPeerID !== conn.peer) {
        conn.send(operationJSON);
      }
    });
  }

  onOpen() {
    this.peer.on("open", (id) => {
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
    this.peer.on("connection", (connection) => {
      this.onConnection(connection);
      this.onData(connection);
      this.onConnClose(connection);
    });
  }
  onConnection(connection: DataConnection) {
    this.addToInConns(connection);
  }
  onError() {
    this.peer.on("error", (err) => {
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
  onData(connection: DataConnection) {
    connection.on("data", (data: any) => {
      let dataObj: any = {};

      try {
        dataObj = JSON.parse(data);
      } catch (error) {
        dataObj = {};
      }

      switch (dataObj.type) {
        case RequestType.ConnectionRequest:
          this.evaluateRequest(dataObj.peerId);
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
  onConnClose(connection: DataConnection) {
    connection.on("close", () => {
      this.removeFromConnections(connection.peer);
      if (!this.hasReachMax()) {
        this.findNewTarget();
      }
    });
  }

  evaluateRequest(peerId: string) {
    if (this.hasReachMax()) {
      this.forwardConnRequest(peerId);
    } else {
      this.acceptConnRequest(peerId);
    }
  }

  forwardConnRequest(peerId: string) {
    const connected = this.outConns.filter((conn) => conn.peer !== peerId);
    const randomIdx = Math.floor(Math.random() * connected.length);
    connected[randomIdx].send(
      JSON.stringify({
        type: RequestType.ConnectionRequest,
        peerId: peerId,
      })
    );
  }

  acceptConnRequest(peerId: string) {
    const connBack = this.peer.connect(peerId);
    this.addToOutConns(connBack);
    this.addToNetwork(peerId);

    const initialData: any = JSON.stringify({
      type: RequestType.SyncResponse,
      peerId: this.peer.id,
      network: this.network,
    });

    if (connBack.open) {
      connBack.send(initialData);
    } else {
      connBack.on("open", () => {
        connBack.send(initialData);
      });
    }
  }

  addToNetwork(peerId: string) {
    if (!this.network.find((p) => p === peerId)) {
      this.network.push(peerId);
      if (this._onPeerJoined) {
        this._onPeerJoined(peerId);
      }

      this.send({
        type: RequestType.AddToNetwork,
        newPeer: peerId,
      });
    }
  }

  removeFromConnections(peerId: string) {
    this.inConns = this.inConns.filter((conn) => conn.peer !== peerId);
    this.outConns = this.outConns.filter((conn) => conn.peer !== peerId);
    this.removeFromNetwork(peerId);
  }

  removeFromNetwork(peerId: string) {
    const idx = this.network.indexOf(peerId);
    if (idx >= 0) {
      this.network.splice(idx, 1);
      if (this._onPeerLeft) {
        this._onPeerLeft(peerId);
      }

      this.send({
        type: RequestType.RemoveFromNetwork,
        oldPeer: peerId,
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
    const connected = this.outConns.map((conn) => conn.peer);
    const unconnected = this.network.filter(
      (peerId) => connected.indexOf(peerId) === -1
    );
    const possibleTargets = unconnected.filter(
      (peerId) => peerId !== this.peer.id
    );

    if (possibleTargets.length === 0) {
      // NOTE: no targets found
    } else {
      const randomIdx = Math.floor(Math.random() * possibleTargets.length);
      const newTarget = possibleTargets[randomIdx];
      this.requestConnection(newTarget, this.peer.id);
    }
  }

  requestConnection(targetPeerID: string, peerId: string = "") {
    if (!peerId) {
      peerId = this.peer.id;
    }

    const conn = this.peer.connect(targetPeerID);
    this.addToOutConns(conn);

    const dataToSend = JSON.stringify({
      type: RequestType.ConnectionRequest,
      peerId: peerId,
    });
    if (conn.open) {
      conn.send(dataToSend);
    } else {
      conn.on("open", () => {
        conn.send(dataToSend);
      });
    }
  }

  addToInConns(connection: DataConnection) {
    if (!!connection && !this.isAlreadyConnectedIn(connection)) {
      this.inConns.push(connection);
    }
  }

  addToOutConns(connection: DataConnection) {
    if (!!connection && !this.isAlreadyConnectedOut(connection)) {
      this.outConns.push(connection);
    }
  }

  isAlreadyConnectedOut(connection: DataConnection) {
    return !!this.outConns.find((conn) => conn.peer === connection.peer);
  }

  isAlreadyConnectedIn(connection: DataConnection) {
    return !!this.inConns.find((conn) => conn.peer === connection.peer);
  }

  handleRemoteOperation(operation: any, connection: DataConnection) {
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
    const fromPeerID = operation.peerId;
    const network: string[] = operation.network || [];
    network.forEach((peerId) => this.addToNetwork(peerId));

    // Sync complete
    const completedMessage = JSON.stringify({
      type: RequestType.SyncCompleted,
      peerId: this.peer.id,
    });

    let connection = this.outConns.find((conn) => conn.peer === fromPeerID);
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
    const fromPeerID = operation.peerId;
    this.versionVector.increment();
    let connection = this.outConns.find((conn) => conn.peer === fromPeerID);
    const dataToSend = JSON.stringify(
      Object.assign(this._createDataForInitialSync(), {
        _v: {
          p: this.peer.id,
          c: this.versionVector.localVersion.counter,
        },
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
