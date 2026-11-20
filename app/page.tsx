import { BoardDesktop } from '@/components/board/BoardDesktop';
import { getBoardState } from '@/lib/board-store';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const initialState = getBoardState();
  return <BoardDesktop initialState={initialState} />;
}
