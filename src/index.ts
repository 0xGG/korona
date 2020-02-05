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
  ConnectionRequest = "cr"
}

export default class Korona {
  private peer: Peer;
  private dataConnections: Peer.DataConnection[];
  private maxPeers: number;
  private onlinePeers: string[];
  private _onOpen: () => void;
  private _onDataCallback: (connection: Peer.DataConnection, data: any) => void;
  private _onConnection: (connection: Peer.DataConnection) => void;
  private _onDisconnected: () => void;

  private opened = false;

  constructor(options: KoronaOptions) {
    this.dataConnections = [];
    this.maxPeers = options.maxPeers || 4;
    if (this.maxPeers < 2) {
      this.maxPeers = 2;
    }
    this.onlinePeers = [];
    this._onOpen = options.onOpen;
    this._onConnection = options.onConnection;
    this._onDataCallback = options.onData;
    this._onDisconnected = options.onDisconnected;
    this.peer = new Peer(options.peerID, options.peerJSOptions);
    this._initializePeer();
  }

  private _initializePeer() {
    this.peer.on("open", id => {
      this.opened = true;
      this.onPeerConnection();
      this.onError();
      this.onDisconnect();
      if (this._onOpen) {
        this._onOpen();
      }
      this.requestNewConnectionIfNecessary();
    });
  }

  private onPeerConnection() {
    this.peer.on("connection", connection => {
      this.addToConnections(connection);
      this._onData(connection);
      this.onClose(connection);
    });
  }

  private onError() {
    this.peer.on("error", err => {
      const pid = String(err).replace("Error: Could not connect to peer ", "");
      this.removeFromConnections(pid);
      console.error(err);
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

  private addToConnections(connection: Peer.DataConnection) {
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
    // this.addToConnections(conn); // <= Don't add here
    conn.on("open", () => {
      this._onData(conn);
      this.onClose(conn);
      conn.send(
        JSON.stringify({
          type: RequestType.ConnectionRequest,
          peerID: this.peer.id
        })
      );
    });
  }

  private requestNewConnectionIfNecessary() {
    if (!this.peer || this.onlinePeers.length <= 0 || !this.opened) return;
    if (this.dataConnections.length === 0) {
      const randomIdx = Math.floor(Math.random() * this.onlinePeers.length);
      this.requestConnection(this.onlinePeers[randomIdx]);
    }
  }

  private forwardConnectionRequest(fromPeerID: string, targetPeerID: string) {
    const connected = this.dataConnections.filter(
      conn => conn.peer !== targetPeerID && conn.peer !== fromPeerID
    );
    const randomIdx = Math.floor(Math.random() * connected.length);
    connected[randomIdx].send(
      JSON.stringify({
        type: RequestType.ConnectionRequest,
        peerID: targetPeerID
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
      this.forwardConnectionRequest(connection.peer, targetPeerID);
    } else {
      this.acceptConnectionRequest(targetPeerID);
    }
  }

  private hasReachedMax() {
    return this.dataConnections.length >= this.maxPeers;
  }

  private acceptConnectionRequest(peerID: string) {
    const conn = this.peer.connect(peerID);
    this.addToConnections(conn);
    conn.on("open", () => {
      this._onData(conn);
      this.onClose(conn);
      if (this._onConnection) {
        this._onConnection(conn);
      }
    });
  }

  private _onData(connection: Peer.DataConnection) {
    connection.on("data", data => {
      let dataObj: any = {};
      try {
        dataObj = JSON.parse(data) || {};
      } catch (error) {
        dataObj = {};
      }

      switch (dataObj.type) {
        case RequestType.ConnectionRequest:
          this.evaluateRequest(connection, dataObj.peerID);
          break;
        default:
          if (this._onDataCallback) {
            this._onDataCallback(connection, data);
          }

          const connections = this.dataConnections.filter(
            conn => conn.peer !== connection.peer && conn !== connection
          );
          connections.forEach(conn => {
            conn.send(data);
          });

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

  public destroy() {
    this.peer.destroy();
  }

  public info() {
    return {
      self: this.peer.id,
      peers: this.dataConnections.map(conn => conn.peer)
    };
  }
}
