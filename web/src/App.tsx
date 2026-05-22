import { useState } from 'react';
import { GameShell, GameTopbar, GameAuth, GameButton, useRooms } from '@progamestore/games';

// TODO: Define your game's server→client and client→server message types.
type ServerMsg =
  | { type: 'state'; board: unknown; turn: string; yourRole: string; opponentConnected: boolean; gameOver: unknown }
  | { type: 'move'; move: unknown; board: unknown; turn: string; gameOver: unknown }
  | { type: 'opponent_joined' }
  | { type: 'opponent_left' }
  | { type: 'new_game' }
  | { type: 'error'; message: string };

type ClientMsg =
  | { type: 'move'; move: unknown }
  | { type: 'new_game' };

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>('');
  const [opponentConnected, setOpponentConnected] = useState(false);

  const room = useRooms<ServerMsg, ClientMsg>({
    gameId: 'APPNAME',
    roomId,
    onMessage(msg) {
      if (msg.type === 'state') {
        setMyRole(msg.yourRole);
        setOpponentConnected(msg.opponentConnected);
        // TODO: Update your game board from msg.board
      }
      if (msg.type === 'move') {
        // TODO: Apply the move to your board
      }
      if (msg.type === 'opponent_joined') setOpponentConnected(true);
      if (msg.type === 'opponent_left') setOpponentConnected(false);
    },
  });

  async function handleCreate() {
    const id = await room.create();
    setRoomId(id);
  }

  function handleJoin(id: string) {
    setRoomId(id);
  }

  return (
    <GameShell topbar={<GameTopbar title="APPNAME" />}>
      <GameAuth />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', padding: '2rem' }}>
        {!roomId ? (
          <Lobby onCreate={handleCreate} onJoin={handleJoin} />
        ) : (
          <GameBoard
            roomId={roomId}
            myRole={myRole}
            opponentConnected={opponentConnected}
            status={room.status}
            onMove={(move) => room.send({ type: 'move', move })}
          />
        )}
      </div>
    </GameShell>
  );
}

function Lobby({ onCreate, onJoin }: { onCreate: () => void; onJoin: (id: string) => void }) {
  const [joinId, setJoinId] = useState('');

  return (
    <>
      <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>APPNAME</h1>
      <p style={{ color: 'var(--muted)' }}>Multiplayer turn-based game on ProGameStore</p>
      <GameButton variant="primary" size="lg" onClick={onCreate}>Create Room</GameButton>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          value={joinId}
          onChange={(e) => setJoinId(e.target.value)}
          placeholder="Room code"
          style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
        />
        <GameButton variant="secondary" onClick={() => joinId && onJoin(joinId)}>Join</GameButton>
      </div>
    </>
  );
}

function GameBoard({ roomId, myRole, opponentConnected, status, onMove }: {
  roomId: string;
  myRole: string;
  opponentConnected: boolean;
  status: string;
  onMove: (move: unknown) => void;
}) {
  return (
    <>
      <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
        Room: <strong>{roomId}</strong> | You: <strong>{myRole}</strong> | Status: {status}
      </p>
      {!opponentConnected && myRole !== 'spectator' && (
        <p style={{ color: 'var(--accent)' }}>Waiting for opponent... Share the room code!</p>
      )}
      <div style={{ width: '300px', height: '300px', border: '2px solid var(--border)', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--muted)', textAlign: 'center' }}>
          Your game board goes here.<br />
          Edit <code>App.tsx</code> to build it.
        </p>
      </div>
      <GameButton variant="primary" onClick={() => onMove({ action: 'example' })}>
        Make Move (placeholder)
      </GameButton>
    </>
  );
}
