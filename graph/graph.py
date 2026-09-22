"""
LangGraph workflow for food optimization.

Nodes:
  1. parse_input      – validate and structure user input
  2. estimate_protein – use the protein estimation tool for each food item
  3. optimize         – enumerate valid combinations within budget, rank by protein
  4. recommend        – LLM generates a human-friendly recommendation
"""

from __future__ import annotations

import os
from itertools import combinations
from typing import Any, TypedDict

from dotenv import load_dotenv
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

load_dotenv()

# ── LLM ─────────────────────────────────────────────────────────────────────
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.7,
)


# ── Protein Estimation Tool ────────────────────────────────────────────────
NUTRITION_DB: dict[str, float] = {
    # Non-veg
    "chicken rice": 28, "chicken biryani": 30, "chicken curry": 25,
    "butter chicken": 24, "tandoori chicken": 32, "egg omelette": 12,
    "egg bhurji": 14, "boiled egg": 6, "fish fry": 22, "fish curry": 20,
    "mutton curry": 26, "mutton biryani": 28, "prawn curry": 20,
    "kebab": 18, "chicken tikka": 26, "egg roll": 10, "chicken roll": 20,
    # Vegetarian
    "paneer roll": 18, "paneer butter masala": 16, "paneer tikka": 20,
    "palak paneer": 14, "shahi paneer": 15, "dal tadka": 12,
    "dal makhani": 14, "rajma": 15, "chole": 13, "chole bhature": 14,
    "soy chunks curry": 25, "tofu stir fry": 16, "idli": 4, "dosa": 5,
    "masala dosa": 7, "upma": 5, "poha": 4, "vada pav": 6, "samosa": 4,
    # Dairy & Drinks
    "milk": 8, "lassi": 8, "curd": 6, "buttermilk": 4, "paneer salad": 14,
    "cheese sandwich": 12, "protein shake": 25, "whey protein": 24,
    # Snacks & Sides
    "french fries": 3, "aloo tikki": 3, "bread pakora": 4, "pav bhaji": 8,
    "pasta": 8, "maggi": 6, "fried rice": 6, "veg biryani": 8,
    "roti": 3, "naan": 4, "paratha": 5, "rice": 3,
    # Salads & Light
    "green salad": 2, "sprouts salad": 12, "fruit salad": 2, "corn cup": 4,
}


@tool
def estimate_protein(food_item: str) -> dict:
    """Estimate the protein content (in grams) for a given food item.

    Args:
        food_item: Name of the food item (e.g., 'Chicken Rice', 'Paneer Roll')
    """
    key = food_item.strip().lower()
    if key in NUTRITION_DB:
        return {
            "food_item": food_item,
            "protein_grams": NUTRITION_DB[key],
            "source": "built-in database",
        }
    for db_key, protein in NUTRITION_DB.items():
        if db_key in key or key in db_key:
            return {
                "food_item": food_item,
                "protein_grams": protein,
                "source": f"partial match with '{db_key}'",
            }
    return {
        "food_item": food_item,
        "protein_grams": 5,
        "source": "default estimate (item not in database)",
    }


# ── State Schema ────────────────────────────────────────────────────────────
class FoodItem(TypedDict):
    name: str
    price: float


class Combination(TypedDict):
    items: list[str]
    total_cost: float
    total_protein: float


class GraphState(TypedDict):
    menu: list[FoodItem]
    budget: float
    protein_target: float
    protein_estimates: dict[str, float]
    valid_combinations: list[Combination]
    best_combination: Combination | None
    recommendation: str


# ── Node 1: Parse Input ─────────────────────────────────────────────────────
def parse_input(state: GraphState) -> dict[str, Any]:
    """Validate and pass through user input."""
    menu = state["menu"]
    budget = state["budget"]
    protein_target = state["protein_target"]

    if not menu:
        raise ValueError("Menu cannot be empty.")
    if budget <= 0:
        raise ValueError("Budget must be positive.")
    if protein_target <= 0:
        raise ValueError("Protein target must be positive.")

    return {
        "menu": menu,
        "budget": budget,
        "protein_target": protein_target,
    }


# ── Node 2: Estimate Protein via Tool ───────────────────────────────────────
def estimate_protein_node(state: GraphState) -> dict[str, Any]:
    """Call the protein estimation tool for each food item."""
    protein_estimates: dict[str, float] = {}
    for item in state["menu"]:
        result = estimate_protein.invoke({"food_item": item["name"]})
        if isinstance(result, dict):
            protein_estimates[item["name"]] = result.get("protein_grams", 5)
        else:
            protein_estimates[item["name"]] = 5
    return {"protein_estimates": protein_estimates}


# ── Node 3: Optimize Combinations ───────────────────────────────────────────
def optimize(state: GraphState) -> dict[str, Any]:
    """Generate all valid food combinations within budget, ranked by protein."""
    menu = state["menu"]
    budget = state["budget"]
    protein_estimates = state["protein_estimates"]

    price_map = {item["name"]: item["price"] for item in menu}
    food_names = [item["name"] for item in menu]

    valid_combos: list[Combination] = []

    for r in range(1, len(food_names) + 1):
        for combo in combinations(food_names, r):
            total_cost = sum(price_map[name] for name in combo)
            total_protein = sum(protein_estimates.get(name, 0) for name in combo)
            if total_cost <= budget:
                valid_combos.append({
                    "items": list(combo),
                    "total_cost": total_cost,
                    "total_protein": total_protein,
                })

    valid_combos.sort(key=lambda c: (-c["total_protein"], c["total_cost"]))
    top_combos = valid_combos[:10]
    best = top_combos[0] if top_combos else None

    return {
        "valid_combinations": top_combos,
        "best_combination": best,
    }


# ── Node 4: Recommend via LLM ───────────────────────────────────────────────
def recommend(state: GraphState) -> dict[str, Any]:
    """Use the LLM to create a human-friendly recommendation."""
    menu = state["menu"]
    budget = state["budget"]
    protein_target = state["protein_target"]
    protein_estimates = state["protein_estimates"]
    valid_combinations = state["valid_combinations"]
    best = state["best_combination"]

    menu_table = "\n".join(
        f"  - {item['name']}: ₹{item['price']}, ~{protein_estimates.get(item['name'], '?')}g protein"
        for item in menu
    )

    combos_text = ""
    for i, combo in enumerate(valid_combinations[:5], 1):
        items_str = " + ".join(combo["items"])
        combos_text += f"  {i}. {items_str} → ₹{combo['total_cost']}, {combo['total_protein']}g protein\n"

    best_text = "None found within budget." if not best else (
        f"Items: {', '.join(best['items'])}\n"
        f"Total Cost: ₹{best['total_cost']}\n"
        f"Total Protein: {best['total_protein']}g"
    )

    prompt = f"""You are a nutrition advisor AI. Based on the analysis below, provide a clear,
friendly recommendation to the user.

CRITICAL INSTRUCTION: KEEP YOUR RESPONSE EXTREMELY CONCISE. Provide only 2 or 3 short sentences. No long paragraphs or bulleted lists!
State if they met the target, and suggest the best option or a quick alternative if not found.

=== USER INPUT ===
Budget: ₹{budget}
Protein Target: {protein_target}g

=== MENU WITH PROTEIN ESTIMATES ===
{menu_table}

=== TOP COMBINATIONS (within budget) ===
{combos_text if combos_text else "No valid combinations found within budget."}

=== BEST COMBINATION ===
{best_text}

Provide the recommendation now:"""

    response = llm.invoke(prompt)
    return {"recommendation": response.content}


# ── Build the Graph ─────────────────────────────────────────────────────────
def build_graph():
    """Build and compile the LangGraph workflow."""
    workflow = StateGraph(GraphState)

    workflow.add_node("parse_input", parse_input)
    workflow.add_node("estimate_protein", estimate_protein_node)
    workflow.add_node("optimize", optimize)
    workflow.add_node("recommend", recommend)

    workflow.set_entry_point("parse_input")
    workflow.add_edge("parse_input", "estimate_protein")
    workflow.add_edge("estimate_protein", "optimize")
    workflow.add_edge("optimize", "recommend")
    workflow.add_edge("recommend", END)

    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)
