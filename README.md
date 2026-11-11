# Rhea-Thomas.github.io

Source for my portfolio site, served by GitHub Pages at **https://rhea-thomas.github.io**.

It is plain HTML, CSS and JavaScript with no build step and no dependencies.

- **RiskFormer explorer**: interactive charts of the model's out-of-sample forecasts (`data/riskformer.json`, exported from the [RiskFormer](https://github.com/Rhea-Thomas/RiskFormer) repo's trained checkpoint and walk-forward baselines).
- **Mosaic demo**: the [Mosaic-Generator](https://github.com/Rhea-Thomas/Mosaic-Generator) pipeline ported to JavaScript (`js/mosaic.js`). It runs entirely in the browser; images are never uploaded.

Run it locally:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
