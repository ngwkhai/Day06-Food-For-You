import type { BrandDeal, Category, FoodDeal } from "@/lib/types";
import type { CSSProperties } from "react";

type FoodCardProps =
  | {
      type: "category";
      item: Category;
    }
  | {
      type: "deal";
      item: FoodDeal;
    }
  | {
      type: "brand";
      item: BrandDeal;
    };

export default function FoodCard(props: FoodCardProps) {
  const accentStyle = (accent: string) =>
    ({ "--accent": accent }) as CSSProperties;

  if (props.type === "category") {
    const { item } = props;

    return (
      <article className="category-card" style={accentStyle(item.accent)}>
        <h2>{item.title}</h2>
        <div className="category-art" aria-hidden="true">
          {item.image}
        </div>
      </article>
    );
  }

  if (props.type === "brand") {
    const { item } = props;

    return (
      <article className="brand-card" style={accentStyle(item.accent)}>
        <div className="brand-logo">
          <strong>{item.brand}</strong>
          <span>{item.logoText}</span>
        </div>
        <p>{item.offer}</p>
      </article>
    );
  }

  const { item } = props;

  return (
    <article className={`deal-card deal-card-${item.variant}`} style={accentStyle(item.accent)}>
      <div className="deal-art" aria-hidden="true">
        {item.image}
      </div>
      <p>{item.subtitle}</p>
      <h2>{item.title}</h2>
    </article>
  );
}
