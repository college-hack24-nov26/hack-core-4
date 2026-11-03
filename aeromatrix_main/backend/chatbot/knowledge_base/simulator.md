# The What-If simulator

The simulator changes inputs of the prototype rule model and re-runs it live as a control moves. Controls: city-wide traffic, area traffic for selected zones, vehicle emission control, public-transport shift, road closures with diversion, adding or removing industries, industrial control, a green buffer, green cover change with a tree helper, building density and height, area selection and weather with a wind compass. Presets are Rush hour, Monsoon day, Winter inversion, Calm industrial day and Clean fleet.

The map can show Baseline, Scenario or Change. Change colours a decrease blue and an increase rose, and outlines zones that changed by 0.5 ug/m3 PM2.5 or more.

Six reduction actions are ranked by mean PM2.5 reduction: traffic restriction, industrial control, green expansion, road diversion, industrial relocation and a public-transport shift. A note appears when the ranking changes under 20 percent changes of the model's illustrative coefficients.

Plan-It is a budget planner: given a budget and a target it searches combinations of tree planting, industrial emission control and traffic enforcement, costs them from a price table with sourced prices and labelled estimates, and uses the same engine to estimate the PM2.5 effect. It can produce a PDF plan.

All scenario results are MODELED_SCENARIO: hypothetical estimates, not forecasts.
