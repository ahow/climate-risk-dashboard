# Climate Risk Dashboard

## What It Does

The Climate Risk Dashboard estimates the financial cost of climate change for publicly traded companies. It answers the question: **"How much money could this company lose due to climate-related hazards, and how significant is that loss relative to the company's overall value?"**

It does this by looking at three dimensions of climate risk for each company, combining them into an overall exposure figure, and then adjusting that figure based on how well the company is managing its climate risks.

---

## The Three Dimensions of Risk

### 1. Geographic Risk (Physical Asset Exposure)

This measures the direct financial risk to a company's physical facilities — factories, offices, warehouses, data centres, mines, and other built assets — from five climate hazards:

- **Flooding** — river and coastal inundation
- **Hurricanes / Typhoons** — wind damage from tropical cyclones
- **Heat Stress** — extreme temperatures affecting operations and infrastructure
- **Drought** — water scarcity impacting operations
- **Extreme Precipitation** — heavy rainfall events beyond normal flooding

For each facility, the system estimates an **Expected Annual Loss (EAL)** — the average amount of money that location is expected to lose per year due to each hazard. These annual losses are then converted to a **30-year Present Value (PV)**, which represents the total cost of climate risk at that location over a 30-year horizon, discounted to today's dollars.

The geographic risk for a company is the sum of the present values across all of its facilities.

**Scaling:** The facility-level data available for each company may attribute synthetic asset values to individual locations that, when summed, exceed the company's actual total asset value. To prevent overstating risk, the system scales the total geographic risk proportionally:

> If the sum of individual facility values exceeds the company's actual total asset value, the risk is scaled down by the ratio of (actual total assets) / (sum of facility values).

This ensures geographic risk is always proportional to what the company actually owns.

### 2. Supply Chain Risk (Indirect Exposure)

This measures the financial risk to a company through its supply chain — the possibility that climate events disrupt suppliers, increase input costs, or interrupt production in the countries and sectors where the company sources materials and services.

Supply chain risk is assessed based on two factors:
- The **country** where the company operates (or is headquartered)
- The **industry sector** the company belongs to

The assessment looks at indirect risks only — the risk that suppliers are affected by climate hazards — because direct physical risk to the company's own assets is already captured by Geographic Risk above. Including both would double-count.

The supply chain risk is expressed as a **Present Value per unit of exposure**. The system scales this by the company's **Supplier Costs** (total annual spending on suppliers and third-party services) to produce a dollar figure representing the expected supply chain disruption cost over 30 years.

> Supply Chain Risk PV = (Risk per $1 billion of supplier spend) × (Company's actual supplier costs / $1 billion)

The supply chain risk breaks down into five hazard categories matching the geographic risk: flood, drought, heat stress, hurricane, and extreme precipitation.

### 3. Management Performance (Climate Governance Score)

This measures how well a company is managing and disclosing its climate risks. It is based on a scoring framework that evaluates the company across 9 categories and 44 individual measures, covering areas such as:

- Board-level climate oversight
- Climate risk strategy and scenario analysis
- Emissions targets and reduction plans
- Climate-related financial disclosures
- Transition planning

The result is a **percentage score** (e.g., 27% means the company meets 27% of best-practice climate governance standards). A higher score indicates the company is better prepared to manage climate risks and is therefore less likely to suffer the full financial impact.

---

## Combining the Three Dimensions

### Total Exposure

The company's **Total Exposure PV** is the sum of Geographic Risk PV and Supply Chain Risk PV:

> Total Exposure = Geographic Risk PV + Supply Chain Risk PV

### Adjusted Exposure (After Management Mitigation)

Companies with stronger climate management are likely to mitigate some of the potential losses. The system adjusts the total exposure downward based on the management score:

> Adjusted Exposure = Total Exposure × (1 − 0.7 × Management Score %)

This formula means:
- A company with a **0% management score** gets no reduction — the full exposure applies
- A company with a **50% management score** has its exposure reduced by 35%
- A company with a **100% management score** (theoretical best practice) has its exposure reduced by the maximum 70%

The 70% cap reflects the reality that even perfect management cannot eliminate all climate risk — some physical damage is unavoidable regardless of how well a company prepares.

### Valuation Exposure (% of Enterprise Value)

The final headline metric relates the adjusted exposure to the company's overall size:

> Valuation Exposure % = Adjusted Exposure / Enterprise Value × 100

This allows comparison across companies of different sizes. A $10 million adjusted exposure means very different things for a $500 million company (2% of value at risk) versus a $50 billion company (0.02% of value at risk).

---

## What the Dashboard Shows

### Company Overview
A sortable table of all companies showing their total risk exposure, geographic and supply chain risk components, management score, adjusted exposure, and valuation exposure percentage. Summary cards show portfolio-wide totals and averages.

### Company Detail View
A full breakdown for each individual company including:
- The risk contribution of each physical facility, with a hazard-by-hazard breakdown
- Supply chain risk by hazard type
- Management performance scores across all 9 categories
- The step-by-step calculation from total exposure through management adjustment to valuation impact

### Calculation Monitor
A real-time view of processing progress when risk assessments are being calculated, with the ability to pause, resume, or cancel batch processing.

### Company List Management
Upload a spreadsheet of companies (with ISIN codes, asset values, enterprise values, and supplier costs) to process in bulk. Includes the ability to clear all risk data and reprocess when the underlying risk models are updated.

### CSV Export
Download all company risk data as a CSV file for further analysis in Excel or other tools.

---

## Key Assumptions and Limitations

1. **30-year horizon**: All present values use a 30-year time horizon with a discount rate, reflecting the typical planning period for climate-related financial risk.

2. **Static assessment**: The current model does not project how climate hazards will change over time (e.g., rising sea levels, increasing hurricane intensity). It uses current hazard levels as a baseline.

3. **Facility-level data**: Geographic risk quality depends on the completeness and accuracy of the facility location data available for each company. Some companies have comprehensive facility records; others may have only a few locations identified.

4. **Supply chain approximation**: Supply chain risk is assessed at the country-sector level, not at the level of individual suppliers. It provides a reasonable estimate but cannot capture company-specific supply chain dependencies.

5. **Management score as mitigation**: The 70% maximum reduction for management quality is a modelling choice. In practice, the relationship between management quality and loss reduction is complex and varies by hazard type.

6. **No forward-looking projections**: The model assesses risk based on historical and current climate data, not future climate scenarios (RCP/SSP pathways). This is a planned future enhancement.
