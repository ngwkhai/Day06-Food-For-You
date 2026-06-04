type MessageBubbleProps = {
  children: React.ReactNode;
  tone?: "blue" | "yellow" | "pink";
};

const toneClass = {
  blue: "message-bubble message-bubble-blue",
  yellow: "message-bubble message-bubble-yellow",
  pink: "message-bubble message-bubble-pink"
};

export default function MessageBubble({
  children,
  tone = "blue"
}: MessageBubbleProps) {
  return <div className={toneClass[tone]}>{children}</div>;
}

