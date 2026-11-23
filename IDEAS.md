# Ideas to improve Capital

The design goal: **every month should offer lots of freedom and lots of small decisions that matter.**
This document starts with a short diagnosis of the current game (as of world version 50), then lists ideas grouped by area.
Each idea says *why* it adds freedom or micromanagement and *where* it would hook into the existing code.
A prioritized shortlist is at the end.

Effort tags: **S** = an afternoon, **M** = a few days, **L** = a big feature.

---

## 1. Diagnosis

### What already works well
- **A deep production model.** There are 30+ products with recipes, factory layout grids (2×2, 3×3 or 4×4 depending on terrain), and cells you can link (lines, import, warehouse, export, R&D, QC, robotics). Inputs need an explicit supplier. This is the game's best micromanagement layer.
- **A spatial economy.** Haul costs follow terrain, rails and the land/sea switch. Tile fertility and quality, pollution, town-hall foot traffic, 5×5 and 7×7 areas with expansions, lot prices and transport availability all depend on where you build.
- **Many financial levers.** Loans from several lenders with collateral, overdraft, dividends and an invest policy, issuing shares, buybacks, and now takeovers and mergers.
- **Side systems.** Real estate (vacant facilities, malls, rents), subsidies, harbour imports, ad contracts by media, staff bidding for managers and advisors, research unlocks, messages, news and a turn summary.

### Where the "every turn matters" goal is weak
1. **Most turns can be skipped.** Once a supply chain is set up, nothing *forces* a decision. Events (drought, recession, boom, city boom) are passive modifiers with no choices attached (`updateMarket`, engine.ts ~1213).
2. **Actions resolve instantly while you plan.** `applyAction` changes the state immediately: buying lots, shares, vacant facilities and staff. In a simultaneous turn-based multiplayer game, the fastest clicker wins anything two players want, and there is no reason to think ahead about what rivals will do this month.
3. **No forward-looking information.** There is a turn summary *after* the month, but no forecast *before* you end the turn. Micromanagement is more fun when you can see the effect of a price change before you commit.
4. **AI rivals are passive.** `aiTurn` builds one focus chain, adds stores and lines, and does a little R&D. It doesn't react to undercutting, doesn't trade shares (so takeovers are one-sided), and doesn't pick fights. A strong human soon has no pressure.
5. **Externalities have no cost to the one who causes them.** Pollution hurts farmland, but the polluter pays nothing. Roads, rails and cities are fixed after world generation.
6. **Few deals between players.** Players can sell on the open market (`setListPrice`) and chat (`sendMessage`), but they can't sign a binding contract with each other.
7. **The UI makes large-scale micromanagement tedious.** Each building is edited one at a time. There is no bulk table, no copying of settings, and no "what needs my attention" list.

---

## 2. The turn loop: make every month a set of decisions

### 2.1 Sealed orders for contested actions — **M**, high impact
Actions that rivals can fight over become *orders* that resolve at the end of the turn:
- buying a lot or a vacant facility
- buying shares
- bidding for staff (this already works as bids, in `resolveHiring`)
- claiming a subsidy

When two companies want the same thing, the higher bid wins, with ties broken by reputation or at random. This removes the click race and creates real mind games: "will they outbid me on that oil field?"
Hook: add an `orders: Order[]` list on `GameState`, resolved early in `processTurn`, next to `resolveHiring` and `resolveContracts`. The UI shows pending orders with a cancel button.

### 2.2 Monthly agenda / decision cards — **M**, high impact
Each month, every company gets 1–3 cards with choices. Examples:
- *"Workers at Oakdale steel demand +8% wages."* Accept (morale up), refuse (strike risk), or negotiate (+4%, half the risk).
- *"A city councillor offers to rezone the farmland next to your factory for $200k."*
- *"A truck accident spilled your chemicals: pay $80k to clean up, or deny it (scandal risk, brand −)."*
- *"A supermarket chain wants 3,000 bread/month for 12 months at $X."* (This links to contracts, see 4.2.)

Cards are built from the company's own situation: pollution near cities, low wages, idle lines, high debt. That makes them feel personal. Unanswered cards fall back to a default choice, which is usually a bad one.
Hook: a new `agenda` list on `Company`, generated in `processTurn` and answered with an `answerCard` action. Render it in `turnsummary.ts` or a new "Desk" tab.

### 2.3 End-turn forecast — **M**, high impact
A "Projected month" panel shows expected revenue, costs, cash and stock-outs if the turn ended now. It works by running `processTurn` on a deep copy of the state on the client (the engine is shared and pure) and showing the difference from the current state.
- Price changes and supplier changes then give immediate feedback.
- The panel can warn about things like "Bread line will run out of grain on week 3" or "Cash goes below the overdraft limit."

Caveat: rivals' moves are unknown, so call it an *estimate*. That uncertainty is fine and even good.

### 2.4 Attention list ("Issues inbox") — **S**
Collect `layoutIssues`, idle buildings, stock-outs, unfilled shelves, expiring ad contracts and loans due within 2 months into one sortable list. Each row has a jump-to button and, where possible, a one-click fix such as "raise wage to the city average" or "reorder".
`advice()` already exists (engine.ts ~1647). Turn it into actionable rows.

### 2.5 Board meetings and quarterly goals — **S/M**
Every 3 months the board (your shareholders) sets 2–3 targets, for example "+10% revenue", "pay a dividend of at least $0.05" or "cut debt below $2M". Meeting them gives a bonus: a better credit rating or a cheaper loan rate. Missing them repeatedly lowers the share price, which matters because takeovers now exist. This gives medium-term direction without scripting the player.

---

## 3. Markets and selling

### 3.1 Customer segments: budget, mainstream and premium — **M**
Each city's demand is split by wealth (`city.wealth` already exists). Budget buyers weigh price, premium buyers weigh quality and brand. The same product can then be sold two ways: a cheap high-volume store in a poor suburb, or an expensive one downtown. This adds real per-shelf pricing decisions instead of a single best price.
Hook: in `retail()`, compute attraction per segment and add up the units.

### 3.2 Product variants or quality tiers per line — **M**
A production line can run in *economy*, *standard* or *deluxe* mode. Each mode changes how much input it uses and its output quality and cost. It fits naturally into the existing layout cell model (`LayoutCell.m` already has modes).

### 3.3 Market research as a purchasable report — **S**
Players today see everything. Hide some of it, such as demand elasticity, competitor margins and how loyal customers are to each brand in each city. Let players *buy* reports by city and product for a month. Information then becomes a resource to spend on.

### 3.4 Trends, fads and product life cycles — **S/M**
- Products have a popularity curve, e.g. TVs rise from 1990 and phones boom later.
- Random fads give +40% demand for one product in one region for 6 months.
- News announces trends a few months *before* they peak, so players who read the news and retool early win.

`dateOf` already gives an in-game date, and `research` unlocks already exist. Tie unlocks to eras.

### 3.5 Commodity exchange with futures — **M**
Raw goods (grain, ore, oil, copper, cotton) trade on an exchange with a spot price and 3- and 6-month futures. Producers can hedge, factories can lock in input costs, and speculators can gamble. The ingredients already exist (`market[p].idx` and the `salesHist` record), so this is mostly UI plus settlement code.

### 3.6 Export markets with tariffs and exchange rates — **S**
`sellWorld` exists. Add 2–3 named foreign markets with different prices, tariff events and a currency that drifts. "Where do I dump my surplus steel this month?" becomes a decision.

---

## 4. Deals between companies

### 4.1 Make the existing messages tradeable — **S**
Let a message carry an attached proposal: "I'll sell you lot X for $Y", or "I'll transfer 50,000 shares for $Z". The receiver clicks Accept and the engine carries it out. This builds on `sendMessage` and `messages.ts`.

### 4.2 Supply contracts — **M**, high impact
A binding agreement: *seller delivers Q units per month of product P at price X for N months, at a minimum quality q, with a penalty for each missing unit*. The NPC market, AI companies and players can all offer and accept contracts.
- It creates long-term commitments that you have to *manage*: keep the production line running, or pay the penalty.
- Hook: a `Contract` type; in `acquire()`, treat a contract as a source (the `setSource` code already handles explicit sources).

### 4.3 Joint ventures and cartels — **L**
Two companies co-own a facility and split its profit by share. Cartels (agreed price floors) are possible but risk an antitrust investigation event. This works well with the share system.

---

## 5. Production and logistics

### 5.1 Inventory policies — **S**
For each input and each shelf, choose *fixed order*, *reorder point / order-up-to level* or *just-in-time*. Today the player sets an order quantity. Policies give finer control and introduce stock-outs versus carrying cost as a real tradeoff, especially since spoilage already exists.

### 5.2 Warehouses and distribution centres — **M**
A new building type that holds stock near cities. Stores in a city pull from the distribution centre at a lower haul cost. This turns the haul-cost map into a network-design puzzle. Hook: `haulCost` and the source system in `acquire()`.

### 5.3 Own fleet versus contract haulage — **M**
Haul is currently a cost per unit. Let players buy trucks or rail wagons: a fixed monthly cost with a lower cost per unit and a capacity limit. Ships work the same way for land/sea switches, which already cost 500 points. "Do I invest in rail wagons for my ore route?" becomes a decision.

### 5.4 Breakdowns, maintenance and overtime — **S**
- A line in poor condition has a chance to break down for a month. The maintenance setting `setMaint` gains a real risk dimension.
- Overtime: +25% output for +60% wages and a morale hit. It's a monthly switch you'll actually use when demand spikes.

### 5.5 By-products and recycling — **S/M**
Steel produces slag, which can become construction materials. Meat produces leather, which can become shoes. Factories that link a by-product cell get extra value, which adds more layout puzzles.

### 5.6 Pollution control modules — **S**, fits right now
A *scrubber / filter* layout cell reduces a factory's `factoryPollution` weight by 50% for a monthly cost. With 7.1, it becomes a real tradeoff.

---

## 6. People

### 6.1 Traits and skills for managers — **S/M**
Managers and advisors exist (`makePerson`, `mgrBonus`). Give them 1–2 traits, such as *Penny-pincher* (−5% maintenance), *Visionary* (+R&D), *Union buster* (−strike risk, −morale) or *Logistics whiz* (−10% haul). Staffing becomes a combinatorial decision.

### 6.2 Unions and strikes — **S**
If wage / city wage stays below 0.9 for a few months and morale is low, a strike card appears (see 2.2). An ignored strike halts the building. This links to the existing `moraleFactor` and `cityWage`.

### 6.3 Training budget — **S**
A per-building slider: spend $ on training for a slowly rising skill level (+efficiency). The benefit is lost if staff quit, and better-trained staff get poached more often.

---

## 7. Finance and the stock market

### 7.1 AI companies that trade shares — **M**, needed now that takeovers exist
- AIs with spare cash buy undervalued shares, including humans' shares if a human has issued too many.
- An AI with a large stake can launch a hostile bid.
- This puts real pressure on "should I issue more shares?" At the moment the takeover rule only threatens humans from other humans.

### 7.2 Takeover defences — **S**
- **Poison pill:** an emergency share issue to existing holders, at a cost to the share price.
- **White knight:** a friendly company buys a blocking stake.
- **Golden parachute:** the acquirer has to pay a cash penalty.
- **Tender offer:** a public bid at a premium. Holders accept or refuse over 2 turns, which works well with sealed orders (2.1).

### 7.3 Credit rating and bonds — **M**
A rating from AAA to junk, based on debt/equity and missed payments, sets loan rates. Bonds are a way to borrow long-term at a fixed coupon. Interacts with board meetings (2.5).

### 7.4 Insurance — **S**
Monthly premiums against fire, flood (coastal tiles), breakdowns (5.4) and lawsuits. Random disasters then hurt less if you prepared.

### 7.5 Depreciation and tax choices — **S**
Choose straight-line or accelerated depreciation once per year at `fiscalYearEnd`. It's a small but real accounting lever.

---

## 8. Government, cities and environment

### 8.1 Pollution consequences — **S/M**, fits right now
- High pollution in a city lowers its population growth and its wealth (both already updated each turn in `processTurn`).
- Each city has a pollution limit. Over it, factories inside the city's 30-tile area pay a fine or a carbon tax per unit of pollution weight.
- Citizens' groups lower the brand of the worst polluter in that city.
- This closes the externality loop and makes building a steel mill near a city a real choice.

### 8.2 Player-built infrastructure — **M**
Pay to build a road, rail spur or port. It changes `tiles` and rails, lowers your haul costs, and also helps rivals. A road toll is optional. The haul and rail systems already support this, but world tiles are fixed after generation, so the change would need a world delta and `ovCache` / `costField` invalidation.

### 8.3 Public tenders — **S/M**
The city council opens tenders, for example "deliver 500 construction materials and 200 buildings within 6 months". It's a sealed bid (2.1) and the lowest qualified bid wins. This gives intermediate products a buyer other than the open market.

### 8.4 Lobbying and permits — **M**
Building near the town hall or in protected forest needs a permit (time + $), which lobbying speeds up. Tariff and tax levels can be pushed with lobbying spend, competing against rivals' spend.

### 8.5 Jobs attract people — **S**
City growth today is `0.002 + 0.001 × (wealth − 1)`. Add a term for jobs: workers employed in the city divided by its labour pool. Building factories then grows your own customer base, while pollution (8.1) pulls the other way.

---

## 9. Rivals and information

### 9.1 AI personalities — **M**
Give each AI a profile: *discounter* (undercuts every price by 5%), *premium* (brand-heavy, high prices), *vertical integrator* (owns whole chains), *speculator* (real estate and shares), *expander* (many small stores). Adjust `aiTurn` weights by profile. Each game then feels different, and you have to read your opponents.

### 9.2 Reactive pricing — **S**
When an AI loses more than 20% of its sales in a city for two months, it cuts its price or starts an ad campaign. Price wars appear naturally.

### 9.3 Industrial espionage — **S/M**
Pay to reveal a rival's costs, tech levels or pending orders for one month. There is a chance of being caught, which costs brand and could even bring a lawsuit card.

---

## 10. UI for micromanagement at scale

### 10.1 Spreadsheet view — **M**, high impact
One table with every shelf in every store: product, price, order, supplier, stock, sold, margin. Cells are editable inline and support multi-select plus "set price to market +5%". Add the same table for factory lines and inputs. This is the single biggest win for players with 30+ buildings.

### 10.2 Copy settings and templates — **S**
"Copy layout from factory X", "apply this shelf setup to all stores in city Y", and saved factory templates. The build panel already has a product dropdown, so templates can live next to it.

### 10.3 "What changed" diff — **S**
After each turn, list the changes: prices that moved, rivals that opened next to you, workers that quit, suppliers that ran out. The turn summary already exists and could gain a "changes" section.

### 10.4 Undo within the turn — **M**
Easier once there are sealed orders (2.1). Until then, keep a per-turn action log and replay it from the start-of-turn snapshot, without the last action.

### 10.5 Keyboard shortcuts and notes — **S**
Arrow keys to cycle through buildings, number keys for tabs, and a free-text note on each building ("raise price after the fad ends").

---

## 11. Variety and replayability

- **Scenarios** — **M**: start as an indebted heir, or as a monopolist under antitrust watch, or "rebuild a polluted rust-belt city".
- **Alternative win conditions** — **S**: hold 60% market share in a product category, own the largest real-estate portfolio, or take over every rival.
- **Eras** — **M**: the game starts in 1990 and products unlock by date, so the economy shifts over a 10-year game (see 3.4).
- **Achievements and titles** — **S**: "Steel baron", "Clean industry", "Corporate raider". Cheap to add, and they give players goals of their own.

---

## 12. Prioritized shortlist

If I had to pick the next ten, in order:

| # | Idea | Why first | Effort |
|---|------|-----------|--------|
| 1 | **Sealed orders for contested actions** (2.1) | Fixes multiplayer fairness and makes rival behaviour part of every turn | M |
| 2 | **End-turn forecast** (2.3) | Every price or supplier tweak gets instant feedback; easy because the engine is pure and shared | M |
| 3 | **Spreadsheet view and bulk edit** (10.1) | Makes large-scale micromanagement fun instead of tedious | M |
| 4 | **Monthly decision cards** (2.2) | Guarantees fresh decisions every month, even in steady state | M |
| 5 | **Supply contracts** (4.2) | Long-term commitments you have to keep managing; real player-to-player interaction | M |
| 6 | **Pollution consequences and scrubber module** (8.1, 5.6) | Completes the system just built; gives a real tradeoff about where to put factories | S/M |
| 7 | **AI share trading and takeover defences** (7.1, 7.2) | The new takeover rule needs pressure from AIs and counter-moves | M |
| 8 | **Customer segments** (3.1) | Turns pricing into a strategic choice by city and segment | M |
| 9 | **AI personalities and reactive pricing** (9.1, 9.2) | Rivals that fight back keep the mid-game tense | M |
| 10 | **Attention list** (2.4) | Cheap, and every other feature benefits from it | S |

A guiding principle for all of them: **prefer systems that create tradeoffs over systems that add bonuses.** Every new lever should have a cost, a risk or an opportunity cost, so the "right" setting depends on the situation and changes from month to month. That is what makes micromanagement feel like freedom rather than chores.
