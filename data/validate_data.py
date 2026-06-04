import json
from pathlib import Path

DATA_PATH = Path(__file__).with_name("mock_foods.json")

required_fields = [
    "id",
    "name",
    "restaurant",
    "price_vnd",
    "eta_minutes",
    "distance_km",
    "is_hot",
    "quick_to_eat_score",
    "fullness_score",
    "spicy_level",
    "tags",
    "trust_signal",
]


def validate_food_item(item, index):
    for field in required_fields:
        assert field in item, f"Item {index} missing field: {field}"

    assert isinstance(item["id"], str) and item["id"], f"Item {index}: invalid id"
    assert isinstance(item["name"], str) and item["name"], f"Item {index}: invalid name"
    assert isinstance(item["restaurant"], str) and item["restaurant"], f"Item {index}: invalid restaurant"
    assert isinstance(item["price_vnd"], int) and item["price_vnd"] > 0, f"Item {index}: invalid price_vnd"
    assert isinstance(item["eta_minutes"], int) and item["eta_minutes"] > 0, f"Item {index}: invalid eta_minutes"
    assert isinstance(item["distance_km"], (int, float)) and item["distance_km"] > 0, f"Item {index}: invalid distance_km"
    assert isinstance(item["is_hot"], bool), f"Item {index}: invalid is_hot"
    assert isinstance(item["quick_to_eat_score"], int) and 1 <= item["quick_to_eat_score"] <= 5, f"Item {index}: invalid quick_to_eat_score"
    assert isinstance(item["fullness_score"], int) and 1 <= item["fullness_score"] <= 5, f"Item {index}: invalid fullness_score"
    assert isinstance(item["spicy_level"], int) and 0 <= item["spicy_level"] <= 3, f"Item {index}: invalid spicy_level"
    assert isinstance(item["tags"], list), f"Item {index}: invalid tags"
    assert all(isinstance(tag, str) for tag in item["tags"]), f"Item {index}: invalid tag value"
    assert isinstance(item["trust_signal"], str) and item["trust_signal"], f"Item {index}: invalid trust_signal"


def main():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

    assert isinstance(data, list), "Data must be a list"
    assert len(data) >= 10, "Data must contain at least 10 food items"

    ids = set()
    for index, item in enumerate(data):
        validate_food_item(item, index)
        assert item["id"] not in ids, f"Duplicate id: {item['id']}"
        ids.add(item["id"])

    print("Data validation passed.")


if __name__ == "__main__":
    main()
