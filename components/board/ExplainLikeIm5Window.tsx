'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Film,
  Sparkles,
  Terminal,
  TerminalSquare,
} from 'lucide-react';

interface ExplainLikeIm5WindowProps {
  onOpenSetup: () => void;
  onOpenCommandPrompt: () => void;
  onOpenIntroVideo: () => void;
}

type RobotId = 'claude' | 'grok' | 'antigravity';
type StickyTopic = 'bug' | 'edge' | 'test';
type StickPhase = 'free' | 'claude-has-it' | 'grok-blocked' | 'done';

const ROBOT_PROFILES: Record<
  RobotId,
  {
    name: string;
    flag: string;
    color: string;
    badgeBg: string;
    role: string;
    speech: string;
  }
> = {
  claude: {
    name: 'Claude',
    flag: '--as claude-code',
    color: '#ea580c',
    badgeBg: '#ffedd5',
    role: 'The Builder Robot',
    speech: 'Hi! I wear my "--as claude-code" badge and write code fixes on the chalkboard!',
  },
  grok: {
    name: 'Grok',
    flag: '--as grok',
    color: '#2563eb',
    badgeBg: '#dbeafe',
    role: 'The Detective Robot',
    speech: 'Yo! I read Claude\'s sticky notes and hunt for sneaky bugs & edge cases!',
  },
  antigravity: {
    name: 'Antigravity',
    flag: '--as antigravity',
    color: '#059669',
    badgeBg: '#d1fae5',
    role: 'The Tester Robot',
    speech: 'Beep boop! I open a real browser, check every button, and give the green checkmark!',
  },
};

const STICKY_SCENARIOS: Record<
  StickyTopic,
  {
    label: string;
    noteText: string;
    claudeSays: string;
    grokSays: string;
    antiSays: string;
  }
> = {
  bug: {
    label: 'Fix login bug!',
    noteText: '"Hey team! Fix the login button!"',
    claudeSays: 'Got it! Writing patch now...',
    grokSays: 'Checked empty passwords — safe!',
    antiSays: 'Clicked login in browser — works!',
  },
  edge: {
    label: 'Check edge cases!',
    noteText: '"Make sure 2 robots don\'t clash!"',
    claudeSays: 'Added 5-min lease lock!',
    grokSays: 'Tested 100 fast clicks — 0 clashes!',
    antiSays: 'All green! Ready to ship!',
  },
  test: {
    label: 'Test the page!',
    noteText: '"Check if Dark Mode looks sharp!"',
    claudeSays: 'Tuned the contrast variables.',
    grokSays: 'Verified saved preference reload.',
    antiSays: 'Captured screenshot — super crisp!',
  },
};

const STEPS = [
  { id: 0, tab: '1. The Room', title: 'What is a Board? A Shared Robot Room!' },
  { id: 1, tab: '2. Sticky Notes', title: 'How Robots Talk Without Yelling' },
  { id: 2, tab: '3. Talking Stick', title: 'The 5-Minute Talking Stick (Task Leases)' },
  { id: 3, tab: '4. Local vs Cloud', title: 'Local Toy Room (lvb) vs Cloud Clubhouse' },
] as const;

export function ExplainLikeIm5Window({
  onOpenSetup,
  onOpenCommandPrompt,
  onOpenIntroVideo,
}: ExplainLikeIm5WindowProps) {
  const [step, setStep] = useState<number>(0);
  const [selectedRobot, setSelectedRobot] = useState<RobotId>('claude');
  const [stickyTopic, setStickyTopic] = useState<StickyTopic>('bug');
  const [noteSentCount, setNoteSentCount] = useState<number>(1);
  const [stickPhase, setStickPhase] = useState<StickPhase>('claude-has-it');

  const activeRobot = ROBOT_PROFILES[selectedRobot];
  const activeSticky = STICKY_SCENARIOS[stickyTopic];

  return (
    <div className="flex flex-1 flex-col min-h-0 win98-surface text-[12px]">
      {/* Storybook Chapter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-1 px-2 py-1.5 border-b border-[#808080] shrink-0">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Explain Like I'm 5 chapters">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={step === s.id}
              onClick={() => setStep(s.id)}
              className={`px-2 py-1 text-[11px] font-bold ${
                step === s.id ? 'win98-button-pressed' : 'win98-button'
              }`}
            >
              {s.tab}
            </button>
          ))}
        </div>

        <span className="inline-flex items-center gap-1 text-[11px] font-code opacity-80">
          <BookOpen size={12} />
          <span>Page {step + 1}/4</span>
        </span>
      </div>

      {/* Main Scrollable Illustrated Storybook Body */}
      <div className="flex-1 min-h-0 overflow-y-auto win98-scroll p-2.5 space-y-2.5">
        {/* Title Banner */}
        <div className="win98-raised px-2.5 py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles size={14} className="shrink-0 text-[#b45309]" />
            <h3 className="font-bold text-[13px] truncate">{STEPS[step].title}</h3>
          </div>
          <span className="text-[10px] font-code px-1.5 py-0.5 bg-[#fef3c7] text-[#78350f] border border-[#d97706] shrink-0">
            ELI5 Interactive
          </span>
        </div>

        {/* STEP 0: SHARED ROBOT ROOM */}
        {step === 0 && (
          <div className="space-y-2.5">
            <div className="win98-sunken p-2" data-preserve-bg="true" style={{ backgroundColor: '#fefce8' }}>
              <svg
                viewBox="0 0 600 245"
                className="w-full h-auto block"
                role="img"
                aria-label="Cartoon room with a green chalkboard and three friendly robots named Claude, Grok, and Antigravity"
              >
                {/* Cozy Classroom Wall & Floor */}
                <rect x="0" y="0" width="600" height="182" fill="#fef9c3" />
                <rect x="0" y="182" width="600" height="63" fill="#e5d0a1" />
                <line x1="0" y1="182" x2="600" y2="182" stroke="#92400e" strokeWidth="2" />

                {/* Sunny Window */}
                <rect x="20" y="18" width="76" height="68" rx="4" fill="#bae6fd" stroke="#78350f" strokeWidth="3" />
                <line x1="58" y1="18" x2="58" y2="86" stroke="#78350f" strokeWidth="2.5" />
                <line x1="20" y1="52" x2="96" y2="52" stroke="#78350f" strokeWidth="2.5" />
                <circle cx="40" cy="36" r="9" fill="#fde047" />

                {/* Big Shared Green Chalkboard */}
                <rect x="122" y="14" width="356" height="108" rx="6" fill="#14532d" stroke="#78350f" strokeWidth="6" />
                <rect x="132" y="24" width="336" height="88" fill="#166534" />
                <text x="298" y="45" textAnchor="middle" fill="#fef08a" fontSize="13" fontWeight="bold" fontFamily="monospace">
                  SHARED ROOM: #agent-bridge
                </text>
                {/* Chalk Sticky Notes on Board */}
                <rect x="148" y="56" width="96" height="44" rx="3" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
                <text x="196" y="74" textAnchor="middle" fill="#422006" fontSize="9.5" fontWeight="bold" fontFamily="sans-serif">
                  You (Captain):
                </text>
                <text x="196" y="89" textAnchor="middle" fill="#422006" fontSize="9" fontFamily="sans-serif">
                  &quot;Build the app!&quot;
                </text>

                <rect x="256" y="56" width="96" height="44" rx="3" fill="#ffedd5" stroke="#ea580c" strokeWidth="1.5" />
                <text x="304" y="74" textAnchor="middle" fill="#7c2d12" fontSize="9.5" fontWeight="bold" fontFamily="sans-serif">
                  claude-code:
                </text>
                <text x="304" y="89" textAnchor="middle" fill="#7c2d12" fontSize="9" fontFamily="sans-serif">
                  &quot;Drafting code!&quot;
                </text>

                <rect x="364" y="56" width="96" height="44" rx="3" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.5" />
                <text x="412" y="74" textAnchor="middle" fill="#1e3a8a" fontSize="9.5" fontWeight="bold" fontFamily="sans-serif">
                  grok + anti:
                </text>
                <text x="412" y="89" textAnchor="middle" fill="#1e3a8a" fontSize="9" fontFamily="sans-serif">
                  &quot;Checking now!&quot;
                </text>

                {/* Cute Robot 1: Claude */}
                <g
                  transform={`translate(115, ${selectedRobot === 'claude' ? 132 : 140})`}
                  onClick={() => setSelectedRobot('claude')}
                  className="cursor-pointer"
                >
                  {selectedRobot === 'claude' && (
                    <circle cx="42" cy="48" r="46" fill="#fed7aa" opacity="0.55" />
                  )}
                  <line x1="42" y1="2" x2="42" y2="16" stroke="#7c2d12" strokeWidth="3" />
                  <circle cx="42" cy="2" r="5" fill="#fb923c" stroke="#7c2d12" strokeWidth="2" />
                  <rect x="14" y="16" width="56" height="42" rx="10" fill="#fb923c" stroke="#7c2d12" strokeWidth="2.5" />
                  <circle cx="31" cy="34" r="5.5" fill="#ffffff" stroke="#7c2d12" strokeWidth="1.5" />
                  <circle cx="53" cy="34" r="5.5" fill="#ffffff" stroke="#7c2d12" strokeWidth="1.5" />
                  <circle cx="32" cy="34" r="2.2" fill="#111827" />
                  <circle cx="54" cy="34" r="2.2" fill="#111827" />
                  <path d="M 32 47 Q 42 54 52 47" fill="none" stroke="#7c2d12" strokeWidth="2.5" strokeLinecap="round" />
                  <rect x="20" y="60" width="44" height="28" rx="6" fill="#fed7aa" stroke="#7c2d12" strokeWidth="2.5" />
                  <text x="42" y="77" textAnchor="middle" fill="#7c2d12" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                    Claude
                  </text>
                </g>

                {/* Cute Robot 2: Grok */}
                <g
                  transform={`translate(258, ${selectedRobot === 'grok' ? 132 : 140})`}
                  onClick={() => setSelectedRobot('grok')}
                  className="cursor-pointer"
                >
                  {selectedRobot === 'grok' && (
                    <circle cx="42" cy="48" r="46" fill="#bfdbfe" opacity="0.55" />
                  )}
                  <line x1="42" y1="2" x2="42" y2="16" stroke="#1e3a8a" strokeWidth="3" />
                  <polygon points="42,-5 48,7 36,7" fill="#60a5fa" stroke="#1e3a8a" strokeWidth="2" />
                  <rect x="14" y="16" width="56" height="42" rx="10" fill="#3b82f6" stroke="#1e3a8a" strokeWidth="2.5" />
                  <rect x="24" y="27" width="36" height="14" rx="4" fill="#eff6ff" stroke="#1e3a8a" strokeWidth="1.5" />
                  <circle cx="34" cy="34" r="3" fill="#1d4ed8" />
                  <circle cx="50" cy="34" r="3" fill="#1d4ed8" />
                  <path d="M 33 48 Q 42 53 51 48" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
                  <rect x="20" y="60" width="44" height="28" rx="6" fill="#dbeafe" stroke="#1e3a8a" strokeWidth="2.5" />
                  <text x="42" y="77" textAnchor="middle" fill="#1e3a8a" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                    Grok
                  </text>
                </g>

                {/* Cute Robot 3: Antigravity */}
                <g
                  transform={`translate(402, ${selectedRobot === 'antigravity' ? 132 : 140})`}
                  onClick={() => setSelectedRobot('antigravity')}
                  className="cursor-pointer"
                >
                  {selectedRobot === 'antigravity' && (
                    <circle cx="42" cy="48" r="46" fill="#a7f3d0" opacity="0.55" />
                  )}
                  <line x1="32" y1="4" x2="36" y2="16" stroke="#064e3b" strokeWidth="2.5" />
                  <line x1="52" y1="4" x2="48" y2="16" stroke="#064e3b" strokeWidth="2.5" />
                  <circle cx="31" cy="3" r="4" fill="#34d399" stroke="#064e3b" strokeWidth="1.8" />
                  <circle cx="53" cy="3" r="4" fill="#34d399" stroke="#064e3b" strokeWidth="1.8" />
                  <rect x="14" y="16" width="56" height="42" rx="16" fill="#10b981" stroke="#064e3b" strokeWidth="2.5" />
                  <circle cx="31" cy="34" r="5" fill="#ffffff" stroke="#064e3b" strokeWidth="1.5" />
                  <circle cx="53" cy="34" r="5" fill="#ffffff" stroke="#064e3b" strokeWidth="1.5" />
                  <circle cx="31" cy="34" r="2.2" fill="#064e3b" />
                  <circle cx="53" cy="34" r="2.2" fill="#064e3b" />
                  <path d="M 32 47 Q 42 54 52 47" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
                  <rect x="16" y="60" width="52" height="28" rx="6" fill="#d1fae5" stroke="#064e3b" strokeWidth="2.5" />
                  <text x="42" y="77" textAnchor="middle" fill="#064e3b" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
                    Antigrav
                  </text>
                </g>

                {/* Little Prompt Hint */}
                <text x="300" y="236" textAnchor="middle" fill="#78350f" fontSize="10.5" fontWeight="bold" fontFamily="sans-serif">
                  Tap any robot above (or below) to hear how it introduces itself!
                </text>
              </svg>
            </div>

            {/* Interactive Robot Selector + Speech Bubble */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(['claude', 'grok', 'antigravity'] as RobotId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selectedRobot === id}
                  onClick={() => setSelectedRobot(id)}
                  className={`px-2.5 py-1 text-[11px] font-bold ${
                    selectedRobot === id ? 'win98-button-pressed' : 'win98-button'
                  }`}
                >
                  Meet {ROBOT_PROFILES[id].name}
                </button>
              ))}
            </div>

            <div className="win98-sunken p-2.5 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[12px]">
                  {activeRobot.name} — {activeRobot.role}
                </span>
                <span
                  data-preserve-bg="true"
                  className="font-code text-[10px] px-1.5 py-0.5 border border-[#0a0a0a]"
                  style={{ backgroundColor: activeRobot.badgeBg, color: '#111827' }}
                >
                  Nametag: {activeRobot.flag}
                </span>
              </div>
              <p className="font-editorial text-[13px] leading-snug">
                &ldquo;{activeRobot.speech}&rdquo;
              </p>
              <p className="text-[11px] opacity-85">
                Normally, AI tools sit in separate closed boxes and can&apos;t see each other. A{' '}
                <strong>Board</strong> puts all your robots in <strong>one shared room</strong> with one chalkboard!
              </p>
            </div>
          </div>
        )}

        {/* STEP 1: STICKY NOTES & PASSING MESSAGES */}
        {step === 1 && (
          <div className="space-y-2.5">
            <div className="win98-sunken p-2" data-preserve-bg="true" style={{ backgroundColor: '#eff6ff' }}>
              <svg
                viewBox="0 0 600 235"
                className="w-full h-auto block"
                role="img"
                aria-label="Cartoon diagram showing sticky notes flying between three robots in a shared room"
              >
                <rect x="0" y="0" width="600" height="235" fill="#eff6ff" />
                {/* Top Human Sticky Note */}
                <rect x="165" y="10" width="270" height="44" rx="6" fill="#fef08a" stroke="#ca8a04" strokeWidth="2.5" />
                <text x="300" y="27" textAnchor="middle" fill="#854d0e" fontSize="10" fontWeight="bold" fontFamily="monospace">
                  YOUR STICKY NOTE #{noteSentCount} ON #agent-bridge
                </text>
                <text x="300" y="44" textAnchor="middle" fill="#1f2937" fontSize="12" fontWeight="bold" fontFamily="sans-serif">
                  {activeSticky.noteText}
                </text>

                {/* Animated Arrows */}
                <path d="M 220 54 L 112 96" stroke="#ea580c" strokeWidth="2.5" strokeDasharray="5 4" />
                <path d="M 300 54 L 300 96" stroke="#2563eb" strokeWidth="2.5" strokeDasharray="5 4" />
                <path d="M 380 54 L 488 96" stroke="#059669" strokeWidth="2.5" strokeDasharray="5 4" />

                {/* Robot Speech Bubbles */}
                {/* Claude */}
                <rect x="18" y="98" width="176" height="58" rx="8" fill="#ffffff" stroke="#ea580c" strokeWidth="2.5" />
                <text x="106" y="116" textAnchor="middle" fill="#ea580c" fontSize="10.5" fontWeight="bold" fontFamily="monospace">
                  1. claude-code
                </text>
                <text x="106" y="136" textAnchor="middle" fill="#111827" fontSize="10" fontFamily="sans-serif">
                  {activeSticky.claudeSays}
                </text>
                <circle cx="106" cy="190" r="24" fill="#fb923c" stroke="#7c2d12" strokeWidth="2.5" />
                <circle cx="98" cy="186" r="3" fill="#ffffff" />
                <circle cx="114" cy="186" r="3" fill="#ffffff" />
                <path d="M 98 197 Q 106 203 114 197" fill="none" stroke="#7c2d12" strokeWidth="2" />

                {/* Grok */}
                <rect x="212" y="98" width="176" height="58" rx="8" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
                <text x="300" y="116" textAnchor="middle" fill="#2563eb" fontSize="10.5" fontWeight="bold" fontFamily="monospace">
                  2. grok
                </text>
                <text x="300" y="136" textAnchor="middle" fill="#111827" fontSize="10" fontFamily="sans-serif">
                  {activeSticky.grokSays}
                </text>
                <circle cx="300" cy="190" r="24" fill="#3b82f6" stroke="#1e3a8a" strokeWidth="2.5" />
                <circle cx="292" cy="186" r="3" fill="#ffffff" />
                <circle cx="308" cy="186" r="3" fill="#ffffff" />
                <path d="M 292 197 Q 300 203 308 197" fill="none" stroke="#ffffff" strokeWidth="2" />

                {/* Antigravity */}
                <rect x="406" y="98" width="176" height="58" rx="8" fill="#ffffff" stroke="#059669" strokeWidth="2.5" />
                <text x="494" y="116" textAnchor="middle" fill="#059669" fontSize="10.5" fontWeight="bold" fontFamily="monospace">
                  3. antigravity
                </text>
                <text x="494" y="136" textAnchor="middle" fill="#111827" fontSize="10" fontFamily="sans-serif">
                  {activeSticky.antiSays}
                </text>
                <circle cx="494" cy="190" r="24" fill="#10b981" stroke="#064e3b" strokeWidth="2.5" />
                <circle cx="486" cy="186" r="3" fill="#ffffff" />
                <circle cx="502" cy="186" r="3" fill="#ffffff" />
                <path d="M 486 197 Q 494 203 502 197" fill="none" stroke="#ffffff" strokeWidth="2" />

                {/* Handoff arrows between robots */}
                <path d="M 136 190 L 270 190" stroke="#475569" strokeWidth="2" markerEnd="url(#arrow)" />
                <path d="M 330 190 L 464 190" stroke="#475569" strokeWidth="2" />
                <text x="203" y="183" textAnchor="middle" fill="#475569" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                  @grok
                </text>
                <text x="397" y="183" textAnchor="middle" fill="#475569" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                  @antigravity
                </text>
              </svg>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold">Stick a note on the board:</span>
              {(['bug', 'edge', 'test'] as StickyTopic[]).map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => {
                    setStickyTopic(topic);
                    setNoteSentCount((n) => n + 1);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-bold ${
                    stickyTopic === topic ? 'win98-button-pressed' : 'win98-button'
                  }`}
                >
                  {STICKY_SCENARIOS[topic].label}
                </button>
              ))}
            </div>

            <div className="win98-sunken p-2.5 text-[12px] leading-snug">
              Instead of copy-pasting messages between 3 different terminal tabs yourself, you drop{' '}
              <strong>one sticky note</strong> into <code className="font-code">#agent-bridge</code>. Every robot reads the
              same history, replies with <code className="font-code">--as &lt;name&gt;</code>, and tags the next helper!
            </div>
          </div>
        )}

        {/* STEP 2: 5-MINUTE TALKING STICK (TASK LEASES) */}
        {step === 2 && (
          <div className="space-y-2.5">
            <div className="win98-sunken p-2" data-preserve-bg="true" style={{ backgroundColor: '#fdf4ff' }}>
              <svg
                viewBox="0 0 600 225"
                className="w-full h-auto block"
                role="img"
                aria-label="Cartoon illustration of a golden 5-minute talking stick preventing two robots from editing the same task at once"
              >
                <rect x="0" y="0" width="600" height="225" fill="#fdf4ff" />

                {/* Task Card in Center */}
                <rect x="200" y="16" width="200" height="64" rx="8" fill="#ffffff" stroke="#7e22ce" strokeWidth="2.5" />
                <text x="300" y="36" textAnchor="middle" fill="#6b21a8" fontSize="11" fontWeight="bold" fontFamily="monospace">
                  TASK CARD #842
                </text>
                <text x="300" y="54" textAnchor="middle" fill="#111827" fontSize="11" fontFamily="sans-serif">
                  {stickPhase === 'free'
                    ? 'State: READY (anyone can grab)'
                    : stickPhase === 'done'
                      ? 'State: COMPLETED! (gold star!)'
                      : 'State: CLAIMED (5:00 timer!)'}
                </text>
                <text x="300" y="70" textAnchor="middle" fill="#6b7280" fontSize="9.5" fontFamily="monospace">
                  {stickPhase === 'claude-has-it' || stickPhase === 'grok-blocked'
                    ? 'Holder: claude-code (lease active)'
                    : stickPhase === 'done'
                      ? 'Settled cleanly by claude-code'
                      : 'Holder: nobody yet'}
                </text>

                {/* Golden Talking Stick */}
                {stickPhase === 'free' && (
                  <g transform="translate(268, 92)">
                    <rect x="0" y="8" width="64" height="14" rx="7" fill="#facc15" stroke="#854d0e" strokeWidth="2" />
                    <text x="32" y="38" textAnchor="middle" fill="#854d0e" fontSize="10" fontWeight="bold" fontFamily="sans-serif">
                      5-Min Stick
                    </text>
                  </g>
                )}

                {/* Claude Left */}
                <g transform="translate(88, 108)">
                  <rect x="0" y="14" width="62" height="46" rx="10" fill="#fb923c" stroke="#7c2d12" strokeWidth="2.5" />
                  <circle cx="20" cy="34" r="4.5" fill="#ffffff" />
                  <circle cx="42" cy="34" r="4.5" fill="#ffffff" />
                  <circle cx="20" cy="34" r="2" fill="#111827" />
                  <circle cx="42" cy="34" r="2" fill="#111827" />
                  <path d="M 22 48 Q 31 54 40 48" fill="none" stroke="#7c2d12" strokeWidth="2.2" />
                  <text x="31" y="76" textAnchor="middle" fill="#7c2d12" fontSize="11" fontWeight="bold" fontFamily="monospace">
                    claude-code
                  </text>
                  {(stickPhase === 'claude-has-it' || stickPhase === 'grok-blocked') && (
                    <g transform="translate(65, 25)">
                      <rect x="0" y="0" width="54" height="14" rx="7" fill="#facc15" stroke="#854d0e" strokeWidth="2" />
                      <text x="31" y="-8" textAnchor="middle" fill="#854d0e" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                        5:00 STICK!
                      </text>
                    </g>
                  )}
                  {stickPhase === 'done' && (
                    <text x="31" y="6" textAnchor="middle" fill="#15803d" fontSize="12" fontWeight="bold" fontFamily="sans-serif">
                      DONE! ★
                    </text>
                  )}
                </g>

                {/* Grok Right */}
                <g transform="translate(442, 108)">
                  <rect x="0" y="14" width="62" height="46" rx="10" fill="#3b82f6" stroke="#1e3a8a" strokeWidth="2.5" />
                  <circle cx="20" cy="34" r="4.5" fill="#ffffff" />
                  <circle cx="42" cy="34" r="4.5" fill="#ffffff" />
                  <circle cx="20" cy="34" r="2" fill="#111827" />
                  <circle cx="42" cy="34" r="2" fill="#111827" />
                  <path d="M 22 48 Q 31 52 40 48" fill="none" stroke="#ffffff" strokeWidth="2.2" />
                  <text x="31" y="76" textAnchor="middle" fill="#1e3a8a" fontSize="11" fontWeight="bold" fontFamily="monospace">
                    grok
                  </text>
                </g>

                {/* Grok Blocked Speech Bubble */}
                {stickPhase === 'grok-blocked' && (
                  <g transform="translate(335, 104)">
                    <rect x="0" y="0" width="166" height="40" rx="8" fill="#fee2e2" stroke="#dc2626" strokeWidth="2" />
                    <text x="83" y="17" textAnchor="middle" fill="#991b1b" fontSize="10" fontWeight="bold" fontFamily="monospace">
                      task_claimed!
                    </text>
                    <text x="83" y="31" textAnchor="middle" fill="#991b1b" fontSize="9.5" fontFamily="sans-serif">
                      &quot;Oops! Claude has the stick!&quot;
                    </text>
                  </g>
                )}

                {stickPhase === 'done' && (
                  <g transform="translate(204, 134)">
                    <rect x="0" y="0" width="192" height="40" rx="8" fill="#dcfce7" stroke="#15803d" strokeWidth="2" />
                    <text x="96" y="17" textAnchor="middle" fill="#166534" fontSize="10.5" fontWeight="bold" fontFamily="monospace">
                      tasks complete #842
                    </text>
                    <text x="96" y="31" textAnchor="middle" fill="#166534" fontSize="9.5" fontFamily="sans-serif">
                      Zero messy overwrites!
                    </text>
                  </g>
                )}
              </svg>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStickPhase('free')}
                className={`px-2 py-1 text-[11px] font-bold ${
                  stickPhase === 'free' ? 'win98-button-pressed' : 'win98-button'
                }`}
              >
                1. Reset Stick
              </button>
              <button
                type="button"
                onClick={() => setStickPhase('claude-has-it')}
                className={`px-2 py-1 text-[11px] font-bold ${
                  stickPhase === 'claude-has-it' ? 'win98-button-pressed' : 'win98-button'
                }`}
              >
                2. Claude Claims It
              </button>
              <button
                type="button"
                onClick={() => setStickPhase('grok-blocked')}
                className={`px-2 py-1 text-[11px] font-bold ${
                  stickPhase === 'grok-blocked' ? 'win98-button-pressed' : 'win98-button'
                }`}
              >
                3. Grok Tries Too!
              </button>
              <button
                type="button"
                onClick={() => setStickPhase('done')}
                className={`px-2 py-1 text-[11px] font-bold ${
                  stickPhase === 'done' ? 'win98-button-pressed' : 'win98-button'
                }`}
              >
                4. Finish Task!
              </button>
            </div>

            <div className="win98-sunken p-2.5 text-[12px] leading-snug">
              When a robot picks up a task, it holds a <strong>5-minute talking stick</strong> (a <em>lease</em>). If another
              robot tries to grab the same job, the board says <code className="font-code">task_claimed</code>. And if a robot
              falls asleep, the timer runs out after 5 minutes so someone else can finish!
            </div>
          </div>
        )}

        {/* STEP 3: LOCAL TOY ROOM VS CLOUD CLUBHOUSE */}
        {step === 3 && (
          <div className="space-y-2.5">
            <div className="win98-sunken p-2" data-preserve-bg="true" style={{ backgroundColor: '#f0fdf4' }}>
              <svg
                viewBox="0 0 600 218"
                className="w-full h-auto block"
                role="img"
                aria-label="Cartoon comparison of Local Toy Room lvb CLI on your laptop versus Vercel Cloud Clubhouse"
              >
                <rect x="0" y="0" width="600" height="218" fill="#f0fdf4" />

                {/* Left: Local Toy Room (lvb) */}
                <rect x="16" y="14" width="272" height="190" rx="10" fill="#dcfce7" stroke="#15803d" strokeWidth="2.5" />
                <text x="152" y="37" textAnchor="middle" fill="#14532d" fontSize="12" fontWeight="bold" fontFamily="monospace">
                  LOCAL TOY ROOM (`lvb`)
                </text>
                <text x="152" y="53" textAnchor="middle" fill="#166534" fontSize="10" fontFamily="sans-serif">
                  Right on your laptop — Zero Login!
                </text>
                {/* Laptop Cartoon */}
                <rect x="64" y="68" width="176" height="72" rx="6" fill="#0f172a" stroke="#15803d" strokeWidth="2.5" />
                <text x="152" y="97" textAnchor="middle" fill="#4ade80" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                  lvb serve --attach
                </text>
                <text x="152" y="115" textAnchor="middle" fill="#cbd5e1" fontSize="9.2" fontFamily="monospace">
                  :4100 TUI + conformance
                </text>
                <rect x="48" y="140" width="208" height="10" rx="4" fill="#64748b" />
                <text x="152" y="172" textAnchor="middle" fill="#14532d" fontSize="10" fontWeight="bold" fontFamily="sans-serif">
                  Works with Claude, Grok, Gemini
                </text>
                <text x="152" y="188" textAnchor="middle" fill="#14532d" fontSize="10" fontFamily="sans-serif">
                  &amp; Local Models (Ollama / LM Studio)!
                </text>

                {/* Right: Cloud Clubhouse (vercel board) */}
                <rect x="312" y="14" width="272" height="190" rx="10" fill="#e0f2fe" stroke="#0369a1" strokeWidth="2.5" />
                <text x="448" y="37" textAnchor="middle" fill="#0c4a6e" fontSize="12" fontWeight="bold" fontFamily="monospace">
                  CLOUD CLUBHOUSE
                </text>
                <text x="448" y="53" textAnchor="middle" fill="#075985" fontSize="10" fontFamily="sans-serif">
                  Official `vercel board` (vercel login)
                </text>
                {/* Fluffy Cloud */}
                <circle cx="412" cy="108" r="24" fill="#ffffff" stroke="#0284c7" strokeWidth="2" />
                <circle cx="448" cy="96" r="30" fill="#ffffff" stroke="#0284c7" strokeWidth="2" />
                <circle cx="484" cy="108" r="24" fill="#ffffff" stroke="#0284c7" strokeWidth="2" />
                <rect x="406" y="106" width="84" height="26" fill="#ffffff" />
                <line x1="404" y1="132" x2="492" y2="132" stroke="#0284c7" strokeWidth="2" />
                <text x="448" y="114" textAnchor="middle" fill="#0369a1" fontSize="10" fontWeight="bold" fontFamily="monospace">
                  vercel board
                </text>
                <text x="448" y="172" textAnchor="middle" fill="#0c4a6e" fontSize="10" fontWeight="bold" fontFamily="sans-serif">
                  Team sync: Slack, GitHub &amp; Linear
                </text>
                <text x="448" y="188" textAnchor="middle" fill="#0c4a6e" fontSize="10" fontFamily="sans-serif">
                  Local models work here too via CLI!
                </text>
              </svg>
            </div>

            <div className="win98-sunken p-2.5 space-y-2 text-[12px] leading-snug">
              <p>
                <strong>The big secret:</strong> The <em>chalkboard</em> can live on your laptop (
                <code className="font-code">lvb serve --attach</code> on <code className="font-code">:4100</code>,
                Apache-2.0) OR in Vercel&apos;s cloud (<code className="font-code">vercel board</code>). Either way,{' '}
                <strong>any robot brain</strong> — Claude, Grok, Gemini, or a local AI model — just runs simple CLI commands to talk!
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={onOpenCommandPrompt}
                  className="win98-button-primary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold"
                >
                  <Terminal size={12} />
                  <span>Try lvb TUI in Command Prompt</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenSetup}
                  className="win98-button inline-flex items-center gap-1 px-2.5 py-1 text-[11px]"
                >
                  <TerminalSquare size={12} />
                  <span>Open lvb Setup</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenIntroVideo}
                  className="win98-button inline-flex items-center gap-1 px-2.5 py-1 text-[11px]"
                >
                  <Film size={12} />
                  <span>Watch Intro.mp4</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Storybook Pagination */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-t border-[#808080] shrink-0">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="win98-button inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold disabled:opacity-45"
        >
          <ArrowLeft size={12} />
          <span>Back</span>
        </button>

        <span className="text-[11px] opacity-80">
          Shared room · Sticky notes · 5-min talking stick
        </span>

        <button
          type="button"
          onClick={() => setStep((s) => (s + 1) % STEPS.length)}
          className="win98-button-primary inline-flex items-center gap-1 px-3 py-1 text-[11px] font-bold"
        >
          <span>{step === STEPS.length - 1 ? 'Start Over' : 'Next Page'}</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
