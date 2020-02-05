import Peer from "peerjs";

interface KoronaOptions {
  peerID: string;
  peerJSOptions: Peer.PeerJSOption;
  maxPeers?: number;
  onOpen?: () => void;
  onConnection?: (connection: Peer.DataConnection) => void;
  onData?: (connection: Peer.DataConnection, data: any) => void;
  onDisconnected?: () => void;
}

enum RequestType {
  ConnectionRequest = "cr",
  SyncResponse = "sr"
}

export class Korona {
  private peer: Peer;
  private dataConnections: Peer.DataConnection[];
  private maxPeers: number;
  private onlinePeers: string[];
  private _onOpen: () => void;
  private _onDataCallback: (connection: Peer.DataConnection, data: any) => void;
  private _onConnection: (connection: Peer.DataConnection) => void;
  private _onDisconnected: () => void;

  constructor(options: KoronaOptions) {
    this.peer = new Peer(options.peerID, options.peerJSOptions);
    this.dataConnections = [];
    this.maxPeers = options.maxPeers || 4;
    this.onlinePeers = [];
    this._onOpen = options.onOpen;
    this._onConnection = options.onConnection;
    this._onDataCallback = options.onData;
    this._onDisconnected = options.onDisconnected;
    this.initializePeer();
  }

  private initializePeer() {
    this.peer.on("open", id => {
      this.onPeerConnection();
      this.onError();
      this.onDisconnect();
      if (this._onOpen) {
        this._onOpen();
      }
    });
  }

  private onPeerConnection() {
    this.peer.on("connection", connection => {
      this.onConnection(connection);
      this._onData(connection);
      this.onClose(connection);
    });
  }

  private onConnection(connection: Peer.DataConnection) {
    this.addToConnections(connection);
  }

  private onError() {
    this.peer.on("error", err => {
      const pid = String(err).replace("Error: Could not connect to peer ", "");
      this.removeFromConnections(pid);
      console.log(err);
    });
  }

  private onDisconnect() {
    this.peer.on("disconnected", () => {
      if (this._onDisconnected) {
        this._onDisconnected();
      }
    });
  }

  private onClose(connection: Peer.DataConnection) {
    connection.on("close", () => {
      this.removeFromConnections(connection.peer);
    });
  }

  addToConnections(connection: Peer.DataConnection) {
    if (
      this.dataConnections.findIndex(conn => conn.peer === connection.peer) < 0
    ) {
      this.dataConnections.push(connection);
    }
  }

  private removeFromConnections(peerID: string) {
    this.dataConnections = this.dataConnections.filter(
      conn => conn.peer !== peerID
    );
    this.requestNewConnectionIfNecessary();
  }

  private requestConnection(targetPeerID: string) {
    if (!targetPeerID) return;
    const conn = this.peer.connect(targetPeerID);
    this.addToConnections(conn);
    conn.on("open", () => {
      conn.send(
        JSON.stringify({
          type: RequestType.ConnectionRequest,
          peerID: this.peer.id
        })
      );
    });
  }

  private requestNewConnectionIfNecessary() {
    if (!this.peer || !this.onlinePeers.length) return;
    if (this.dataConnections.length === 0) {
      const randomIdx = Math.floor(Math.random() * this.onlinePeers.length);
      this.requestConnection(this.onlinePeers[randomIdx]);
    }
  }

  private forwardConnectionRequest(peerID: string) {
    const connected = this.dataConnections.filter(conn => conn.peer !== peerID);
    const randomIdx = Math.floor(Math.random() * connected.length);
    connected[randomIdx].send(
      JSON.stringify({
        type: RequestType.ConnectionRequest,
        peerID: peerID
      })
    );
  }

  public broadcast(data: any) {
    this.dataConnections.forEach(connection => {
      connection.send(data);
    });
  }

  public evaluateRequest(
    connection: Peer.DataConnection,
    targetPeerID: string
  ) {
    if (this.hasReachedMax()) {
      connection.close();
      this.forwardConnectionRequest(targetPeerID);
    } else {
      this.acceptConnectionRequest(targetPeerID);
    }
  }

  private hasReachedMax() {
    return this.dataConnections.length > this.maxPeers;
  }

  private acceptConnectionRequest(peerID: string) {
    const connBack = this.peer.connect(peerID);
    this.addToConnections(connBack);

    if (this._onConnection) {
      this._onConnection(connBack);
    }
  }

  private _onData(connection: Peer.DataConnection) {
    connection.on("data", data => {
      const dataObj = JSON.parse(data) || {};
      switch (dataObj.type) {
        case RequestType.ConnectionRequest:
          this.evaluateRequest(connection, dataObj.peerID);
          break;
        default:
          if (this._onDataCallback) {
            this._onDataCallback(connection, dataObj);
          }
          break;
      }
    });
  }

  public addPeerToNetwork(peerID: string) {
    if (peerID === this.peer.id) return;
    if (this.onlinePeers.indexOf(peerID) < 0) {
      this.onlinePeers.push(peerID);
    }
    this.requestNewConnectionIfNecessary();
  }

  public removePeerToNetwork(peerID: string) {
    const idx = this.onlinePeers.indexOf(peerID);
    if (idx >= 0) {
      this.onlinePeers.splice(idx, 1);
    }
    this.removeFromConnections(peerID);
  }
}
