import MessageBubble from "./MessageBubble";

export default function ClarificationBox() {
  return (
    <section className="promo-banner" aria-label="Ưu đãi nổi bật">
      <div className="promo-copy">
        <MessageBubble tone="yellow">TEXAS</MessageBubble>
        <h2>COMBO SIÊU RẺ</h2>
        <div className="promo-prices">
          <strong>99K</strong>
          <span>+</span>
          <strong>-20%</strong>
        </div>
        <p>KHAO SHIP</p>
      </div>
      <div className="promo-food" aria-hidden="true">
        🍔🍗🌯
      </div>
      <button className="close-ad" aria-label="Đóng quảng cáo">
        ×
      </button>
    </section>
  );
}

