import { DurableObject } from 'cloudflare:workers';

// --- Helpers ---

const ID_RE = /^[a-z0-9]{6,12}$/;

function randomId(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// --- Types ---
// Customize these for your game's protocol.

type PlayerRole = 'player1' | 'player2' | 'spectator';

interface Player {
  ws: WebSocket;
  role: PlayerRole;
}

interface GameState {
  turn: 'player1' | 'player2';
  board: unknown; // Replace with your game's board type
  gameOver: { reason: string; winner: string | null } | null;
}

// --- Durable Object ---

export class GameDO extends DurableObject {
  players: Player[] = [];
  state: GameState = {
    turn: 'player1',
    board: null, // Initialize your game board here
    gameOver: null,
  };

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = pair;
    server.accept();

    // Assign role: first player, second player, then spectators
    const taken = new Set(this.players.map((p) => p.role));
    const role: PlayerRole =
      !taken.has('player1') ? 'player1' :
      !taken.has('player2') ? 'player2' :
      'spectator';

    if (role !== 'spectator') {
      this.players.push({ ws: server, role });
      this.broadcast({ type: 'opponent_joined' }, server);
    }

    // Send current state to the new connection
    this.send(server, {
      type: 'state',
      ...this.state,
      yourRole: role,
      opponentConnected: this.players.length === 2,
    });

    server.addEventListener('message', (e) => this.onMessage(server, e.data as string));
    server.addEventListener('close', () => this.onClose(server));
    server.addEventListener('error', () => this.onClose(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  onMessage(ws: WebSocket, data: string): void {
    let msg: { type: string; [k: string]: unknown };
    try {
      msg = JSON.parse(data);
    } catch {
      this.send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    const player = this.players.find((p) => p.ws === ws);
    if (!player) {
      this.send(ws, { type: 'error', message: 'Spectators cannot act' });
      return;
    }

    if (msg.type === 'move') {
      // TODO: Validate the move is legal for your game
      if (this.state.gameOver) {
        this.send(ws, { type: 'error', message: 'Game is over' });
        return;
      }
      if (this.state.turn !== player.role) {
        this.send(ws, { type: 'error', message: 'Not your turn' });
        return;
      }

      // TODO: Apply the move to this.state.board
      // Example: this.state.board = applyMove(this.state.board, msg.move);

      // Switch turns
      this.state.turn = this.state.turn === 'player1' ? 'player2' : 'player1';

      // TODO: Check for game over conditions
      // Example: this.state.gameOver = checkGameOver(this.state.board);

      this.broadcast({
        type: 'move',
        move: msg.move,
        board: this.state.board,
        turn: this.state.turn,
        gameOver: this.state.gameOver,
      });
      return;
    }

    if (msg.type === 'new_game') {
      this.state = { turn: 'player1', board: null, gameOver: null };
      this.broadcast({ type: 'new_game' });
      for (const p of this.players) {
        this.send(p.ws, {
          type: 'state',
          ...this.state,
          yourRole: p.role,
          opponentConnected: this.players.length === 2,
        });
      }
      return;
    }
  }

  onClose(ws: WebSocket): void {
    this.players = this.players.filter((p) => p.ws !== ws);
    this.broadcast({ type: 'opponent_left' });
  }

  send(ws: WebSocket, msg: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch { /* socket already closed */ }
  }

  broadcast(msg: Record<string, unknown>, except?: WebSocket): void {
    for (const p of this.players) {
      if (p.ws !== except) this.send(p.ws, msg);
    }
  }
}

// --- Worker ---

interface Env {
  GAME: DurableObjectNamespace;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // POST /api/rooms/new — create a room
    if (url.pathname === '/api/rooms/new') {
      if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      return Response.json({ roomId: randomId() });
    }

    // GET /api/rooms/{id}/ws — WebSocket upgrade
    const wsMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/ws$/);
    if (wsMatch) {
      const id = wsMatch[1];
      if (!ID_RE.test(id)) return new Response('Invalid room id', { status: 400 });
      const doId = env.GAME.idFromName(id);
      const obj = env.GAME.get(doId);
      return obj.fetch(req);
    }

    // SPA routes
    if (url.pathname.startsWith('/g/')) {
      url.pathname = '/';
      return env.ASSETS.fetch(new Request(url.toString(), req));
    }

    return env.ASSETS.fetch(req);
  },
};
